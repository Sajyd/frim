"""Pose-track repair for GPU mocap. Numpy only, no model runtime.

Keeps one person through the clip, undoes left/right flips, fills short
dropouts, and rejects single-frame joint spikes. Timing is left alone:
a real fast move spans neighbouring frames, so it is not treated as a spike.
"""
from __future__ import annotations

import math
from typing import Sequence

import numpy as np

L_SHO, R_SHO = 5, 6
L_HIP, R_HIP = 11, 12
NOSE = 0

# COCO-WholeBody left/right pairs (body, feet). Hands are swapped as blocks.
_PAIRS = (
    (1, 2), (3, 4), (5, 6), (7, 8), (9, 10),
    (11, 12), (13, 14), (15, 16),
    (17, 20), (18, 21), (19, 22),
)

_LIMB_CHAINS = (
    (11, 13, 15),
    (12, 14, 16),
    (5, 7, 9),
    (6, 8, 10),
)
_FOOT_BONES = ((15, 19), (15, 17), (16, 22), (16, 20))


class CaptureRejected(Exception):
    """The video has no usable performance. Not an infrastructure failure."""


NO_PERSON_MESSAGE = (
    'No clear person in this video. Use one person, full body, and a steady camera.'
)
UNREADABLE_MESSAGE = 'Could not read this video. Export an mp4 and try again.'
TOO_SHORT_MESSAGE = 'Video is too short to capture.'


def rotation_from_probe(data: dict) -> int:
    """Display rotation in degrees from an ffprobe JSON stream object."""
    streams = data.get('streams') or []
    if not streams:
        return 0
    stream = streams[0] or {}
    raw = (stream.get('tags') or {}).get('rotate')
    if raw is None:
        for side in stream.get('side_data_list') or []:
            if isinstance(side, dict) and side.get('rotation') is not None:
                raw = side.get('rotation')
                break
    if raw is None:
        return 0
    try:
        return int(round(float(raw))) % 360
    except (TypeError, ValueError):
        return 0


def advance_sample(t_ms: float, next_t: float, fps: float) -> tuple[bool, float]:
    """Decide whether `t_ms` is the next kept frame and return the following deadline."""
    dt = 1000.0 / max(float(fps), 1.0)
    t = float(t_ms)
    if t + 0.5 >= next_t:
        nxt = next_t + dt
        if nxt < t:
            nxt = t + dt
        return True, nxt
    return False, next_t


def sample_frame_indices(timestamps_ms: Sequence[float], fps: float, max_frames: int) -> list[int]:
    """Keep frames closest to a constant output rate. Variable-frame-rate safe."""
    if not timestamps_ms or max_frames <= 0:
        return []
    next_t = float(timestamps_ms[0])
    keep: list[int] = []
    for i, raw in enumerate(timestamps_ms):
        take, next_t = advance_sample(float(raw), next_t, fps)
        if take:
            keep.append(i)
            if len(keep) >= max_frames:
                break
    return keep


def _torso(pts: np.ndarray) -> float:
    if pts.shape[0] < 13:
        return 0.0
    sho = 0.5 * (pts[L_SHO] + pts[R_SHO])
    hip = 0.5 * (pts[L_HIP] + pts[R_HIP])
    return float(np.linalg.norm(sho - hip))


def _hip(pts: np.ndarray) -> np.ndarray:
    return 0.5 * (pts[L_HIP] + pts[R_HIP])


def body_valid(xy: np.ndarray, sc: np.ndarray) -> bool:
    """True when the 2D body is large enough and the torso joints are confident."""
    if xy.shape[0] < 17:
        return False
    if not np.isfinite(xy[:17]).all():
        return False
    core = np.asarray(sc[:17], dtype=np.float32).reshape(-1)
    if core.shape[0] < 13:
        return False
    if float(np.mean(core[[L_SHO, R_SHO, L_HIP, R_HIP]])) < 0.22:
        return False
    return _torso(xy) >= 10.0


def _bbox(xy: np.ndarray, sc: np.ndarray, thr: float = 0.3) -> np.ndarray:
    pts = np.asarray(xy[:17, :2], dtype=np.float32)
    conf = np.asarray(sc, dtype=np.float32).reshape(-1)
    m = conf[: pts.shape[0]] >= thr
    use = pts[m] if int(np.count_nonzero(m)) >= 3 else pts
    x0, y0 = use.min(axis=0)
    x1, y1 = use.max(axis=0)
    if x1 - x0 < 1:
        x1 = x0 + 1
    if y1 - y0 < 1:
        y1 = y0 + 1
    return np.array([x0, y0, x1, y1], dtype=np.float32)


def _iou(a: np.ndarray, b: np.ndarray) -> float:
    x0 = max(float(a[0]), float(b[0]))
    y0 = max(float(a[1]), float(b[1]))
    x1 = min(float(a[2]), float(b[2]))
    y1 = min(float(a[3]), float(b[3]))
    inter = max(0.0, x1 - x0) * max(0.0, y1 - y0)
    area = max(0.0, float(a[2] - a[0])) * max(0.0, float(a[3] - a[1]))
    area += max(0.0, float(b[2] - b[0])) * max(0.0, float(b[3] - b[1]))
    return inter / max(area - inter, 1e-6)


def _core_dist(a: np.ndarray, b: np.ndarray) -> float:
    total = 0.0
    n = 0
    for j in (L_SHO, R_SHO, L_HIP, R_HIP):
        if j >= a.shape[0] or j >= b.shape[0]:
            continue
        total += float(np.linalg.norm(a[j, :2] - b[j, :2]))
        n += 1
    return total / max(n, 1)


def select_person(
    people: Sequence[tuple[np.ndarray, np.ndarray]],
    prev_xy: np.ndarray | None,
) -> int | None:
    """Index of the person who continues the current track.

    Overlap with the previous body beats a larger stranger in the background.
    """
    if not people:
        return None
    boxes: list[np.ndarray] = []
    areas: list[float] = []
    confs: list[float] = []
    for xy, sc in people:
        xy = np.asarray(xy, dtype=np.float32)
        sc = np.nan_to_num(np.asarray(sc, dtype=np.float32).reshape(-1), nan=0.0)
        box = _bbox(xy, sc)
        boxes.append(box)
        areas.append(max(0.0, float((box[2] - box[0]) * (box[3] - box[1]))))
        body = sc[: min(17, sc.shape[0])]
        confs.append(float(np.mean(body)) if body.size else 0.0)
    max_area = max(areas) or 1.0
    prev_box = None if prev_xy is None else _bbox(prev_xy, np.ones(min(17, prev_xy.shape[0]), dtype=np.float32))
    best_i: int | None = None
    best_s = -1.0
    for i, (xy, _sc) in enumerate(people):
        if not math.isfinite(confs[i]) or confs[i] < 0.12:
            continue
        area_term = math.sqrt(max(areas[i], 0.0) / max_area)
        if prev_box is None:
            cont = 1.0
        else:
            iou = _iou(boxes[i], prev_box)
            torso = max(_torso(prev_xy), _torso(xy), 1.0)
            dist_term = math.exp(-_core_dist(xy, prev_xy) / (torso * 1.4))
            cont = 0.5 * iou + 0.5 * dist_term
        score = confs[i] * (0.35 + 0.65 * cont) * (0.4 + 0.6 * area_term)
        if score > best_s:
            best_s = score
            best_i = i
    return best_i


def _is_cut(a: np.ndarray, b: np.ndarray) -> bool:
    scale = max(_torso(a), _torso(b), 1.0)
    return float(np.linalg.norm(_hip(a) - _hip(b))) > 1.75 * scale


def _torso_confident(sc: np.ndarray) -> bool:
    if sc.shape[0] < 13:
        return False
    return float(np.min(sc[[L_SHO, R_SHO, L_HIP, R_HIP]])) >= 0.25


def _swap_cost(xy: np.ndarray, prev: np.ndarray) -> tuple[float, float]:
    direct = 0.0
    swapped = 0.0
    for left, right in ((L_SHO, R_SHO), (L_HIP, R_HIP)):
        if max(left, right) >= xy.shape[0]:
            continue
        direct += float(np.linalg.norm(xy[left] - prev[left]) + np.linalg.norm(xy[right] - prev[right]))
        swapped += float(np.linalg.norm(xy[right] - prev[left]) + np.linalg.norm(xy[left] - prev[right]))
    return direct, swapped


def _swap_row(arr: np.ndarray, a: int, b: int) -> None:
    tmp = arr[a].copy()
    arr[a] = arr[b]
    arr[b] = tmp


def _apply_swap(xy: np.ndarray, sc: np.ndarray, xyz: np.ndarray | None) -> None:
    k = xy.shape[0]

    def swap_idx(a: int, b: int) -> None:
        if a >= k or b >= k:
            return
        _swap_row(xy, a, b)
        _swap_row(sc, a, b)
        if xyz is not None and xyz.shape[0] > max(a, b):
            _swap_row(xyz, a, b)

    for a, b in _PAIRS:
        swap_idx(a, b)
    if k >= 133:
        for i in range(21):
            swap_idx(91 + i, 112 + i)


def _unswap(
    xy: np.ndarray,
    sc: np.ndarray,
    xyz: np.ndarray | None,
    valid: np.ndarray,
) -> int:
    count = 0
    prev: int | None = None
    for i in range(xy.shape[0]):
        if not valid[i]:
            continue
        if prev is None:
            prev = i
            continue
        if _is_cut(xy[prev], xy[i]) or not (_torso_confident(sc[prev]) and _torso_confident(sc[i])):
            prev = i
            continue
        direct, swapped = _swap_cost(xy[i], xy[prev])
        torso = max(_torso(xy[i]), _torso(xy[prev]), 1.0)
        if swapped < direct * 0.75 and (direct - swapped) > 0.22 * torso:
            _apply_swap(xy[i], sc[i], None if xyz is None else xyz[i])
            count += 1
        prev = i
    return count


def _spike_pass(arr: np.ndarray, sc: np.ndarray, valid: np.ndarray, space: str) -> int:
    """Replace a joint that leaves and returns in one frame. Sustained motion stays."""
    t, k, _ = arr.shape
    count = 0
    body_idx = list(range(min(k, 23)))
    hand_idx = list(range(91, min(k, 133)))
    for i in range(1, t - 1):
        if not (valid[i] and valid[i - 1] and valid[i + 1]):
            continue
        if _is_cut(arr[i - 1], arr[i]) or _is_cut(arr[i], arr[i + 1]):
            continue
        scale = max(_torso(arr[i - 1]), _torso(arr[i]), _torso(arr[i + 1]), 1e-3)
        if space == '2d':
            body_lim = max(18.0, scale * 0.62)
            hand_lim = max(10.0, scale * 0.35)
        else:
            body_lim = scale * 0.55
            hand_lim = scale * 0.28
        targets = [(j, body_lim) for j in body_idx] + [(j, hand_lim) for j in hand_idx]
        for j, lim in targets:
            if sc[i - 1, j] < 0.2 or sc[i + 1, j] < 0.2:
                continue
            a = arr[i - 1, j]
            b = arr[i, j]
            c = arr[i + 1, j]
            dev = float(np.linalg.norm(b - 0.5 * (a + c)))
            span = float(np.linalg.norm(a - c))
            if span < lim and dev > lim:
                arr[i, j] = 0.5 * (a + c)
                sc[i, j] = float(min(sc[i - 1, j], sc[i + 1, j], sc[i, j]))
                count += 1
    return count


def _fill_gaps(
    xy: np.ndarray,
    sc: np.ndarray,
    xyz: np.ndarray | None,
    valid: np.ndarray,
    fps: float,
) -> int:
    """Interpolate dropouts up to 0.4s. Longer holes keep the nearest pose at low score."""
    t = xy.shape[0]
    max_gap = max(2, int(round(0.4 * max(fps, 1.0))))
    filled = 0
    i = 0
    while i < t:
        if valid[i]:
            i += 1
            continue
        j = i
        while j < t and not valid[j]:
            j += 1
        prev = i - 1 if i > 0 and valid[i - 1] else None
        nxt = j if j < t else None
        gap = j - i
        cut = prev is not None and nxt is not None and _is_cut(xy[prev], xy[nxt])
        if prev is not None and nxt is not None and gap <= max_gap and not cut:
            span = max(1, nxt - prev)
            for g in range(i, j):
                a = (g - prev) / span
                xy[g] = xy[prev] * (1 - a) + xy[nxt] * a
                if xyz is not None:
                    xyz[g] = xyz[prev] * (1 - a) + xyz[nxt] * a
                sc[g] = np.clip(np.minimum(sc[prev], sc[nxt]) * 0.85, 0, 1)
                filled += 1
        elif prev is not None or nxt is not None:
            src = prev if prev is not None else nxt
            for g in range(i, j):
                xy[g] = xy[src]
                if xyz is not None:
                    xyz[g] = xyz[src]
                sc[g] = np.minimum(sc[src], 0.35)
        i = j
    return filled


def repair_sequence(
    xy: np.ndarray,
    sc: np.ndarray,
    xyz: np.ndarray | None,
    valid: np.ndarray,
    fps: float,
) -> tuple[np.ndarray, np.ndarray, np.ndarray | None, np.ndarray, dict]:
    """Repair a tracked clip. `valid` stays the mask of real detections, not fills."""
    xy = np.asarray(xy, dtype=np.float32).copy()
    sc = np.clip(np.nan_to_num(np.asarray(sc, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0), 0, 1)
    valid = np.asarray(valid, dtype=bool).copy()
    if xyz is not None:
        xyz = np.nan_to_num(np.asarray(xyz, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    bad_xy = ~np.isfinite(xy).all(axis=-1)
    xy[bad_xy] = 0
    sc[bad_xy] = 0
    if xyz is not None:
        bad_z = ~np.isfinite(xyz).all(axis=-1)
        xyz[bad_z] = 0
        sc[bad_z] = 0
    for i in range(xy.shape[0]):
        if valid[i] and not body_valid(xy[i], sc[i]):
            valid[i] = False
    swaps = _unswap(xy, sc, xyz, valid)
    spikes = _spike_pass(xy, sc, valid, '2d')
    gaps = _fill_gaps(xy, sc, xyz, valid, fps)
    return xy, sc, xyz, valid, {'swaps': swaps, 'spikes': spikes, 'gaps': gaps}


def enough_person(valid: np.ndarray) -> bool:
    n = int(np.asarray(valid).shape[0])
    count = int(np.count_nonzero(valid))
    if n < 4 or count < 6:
        return False
    return count / n >= 0.2


def normalize_rtmw3d(xyz: np.ndarray, valid: np.ndarray | None = None) -> np.ndarray:
    """Crop-space RTMW3D → hip-centred, y-down, torso about 0.55 m.

    Scale comes from the typical frame, then a single exploded frame is
    rescaled on its own so it cannot resize the whole clip.
    """
    out = np.nan_to_num(np.asarray(xyz, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if out.ndim != 3 or out.shape[1] < 17:
        return out
    if valid is None:
        good = np.ones(out.shape[0], dtype=bool)
    else:
        good = np.asarray(valid, dtype=bool).copy()
        if good.shape[0] != out.shape[0] or not np.any(good):
            good = np.ones(out.shape[0], dtype=bool)

    mid_hip = 0.5 * (out[:, L_HIP] + out[:, R_HIP])
    out -= mid_hip[:, None, :]

    radii = np.linalg.norm(out[good, :, :2], axis=-1)
    frame_r = np.percentile(radii, 90, axis=1) if radii.size else np.zeros(1, dtype=np.float32)
    typical = float(np.median(frame_r)) if frame_r.size else 0.0
    if typical > 5:
        out[:, :, :2] *= np.float32(0.85 / max(typical, 1e-3))

    if float(np.median(out[good, NOSE, 1])) > 0:
        out[:, :, 1] *= -1
    if float(np.median(out[good, NOSE, 2])) > 0:
        out[:, :, 2] *= -1

    torso = np.linalg.norm(
        0.5 * (out[:, L_SHO] + out[:, R_SHO]) - 0.5 * (out[:, L_HIP] + out[:, R_HIP]),
        axis=-1,
    )
    base = torso[good]
    base = base[base > 1e-4]
    if base.size:
        lo, hi = np.percentile(base, [10, 90])
        core = base[(base >= lo) & (base <= hi)]
        med = float(np.median(core if core.size else base))
    else:
        med = 0.55
    if med > 1e-4:
        out *= np.float32(0.55 / med)

    torso = np.linalg.norm(
        0.5 * (out[:, L_SHO] + out[:, R_SHO]) - 0.5 * (out[:, L_HIP] + out[:, R_HIP]),
        axis=-1,
    )
    for i in range(out.shape[0]):
        if torso[i] < 0.22 or torso[i] > 1.15:
            if torso[i] > 1e-4:
                out[i] *= np.float32(0.55 / torso[i])
    mid_hip = 0.5 * (out[:, L_HIP] + out[:, R_HIP])
    out -= mid_hip[:, None, :]
    return out


def repair_depth_spikes(xyz: np.ndarray) -> tuple[np.ndarray, int]:
    """Drop one-frame depth spikes after the skeleton is in meters."""
    out = np.asarray(xyz, dtype=np.float32).copy()
    t, k, _ = out.shape
    sc = np.ones((t, k), dtype=np.float32)
    valid = np.array([_torso(out[i]) >= 0.05 for i in range(t)], dtype=bool)
    return out, _spike_pass(out, sc, valid, '3d')


def _clamp_chain(xyz: np.ndarray, chain: tuple[int, ...], lo: float, hi: float, max_med: float) -> None:
    if xyz.shape[1] <= chain[-1]:
        return
    meds: list[float] = []
    for a, b in zip(chain, chain[1:]):
        length = np.linalg.norm(xyz[:, b] - xyz[:, a], axis=-1)
        length = length[np.isfinite(length) & (length > 1e-4)]
        meds.append(float(np.median(length)) if length.size else 0.0)
    for i, (a, b) in enumerate(zip(chain, chain[1:])):
        med = meds[i]
        if med < 1e-3 or med > max_med:
            continue
        delta_vec = xyz[:, b] - xyz[:, a]
        length = np.linalg.norm(delta_vec, axis=-1, keepdims=True)
        target = np.clip(length, lo * med, hi * med)
        scale = np.ones_like(length)
        ok = length[:, 0] > 1e-6
        scale[ok, 0] = target[ok, 0] / length[ok, 0]
        new_b = xyz[:, a] + delta_vec * scale
        shift = new_b - xyz[:, b]
        for j in chain[i + 1:]:
            xyz[:, j] = xyz[:, j] + shift


def clamp_limb_lengths(xyz: np.ndarray) -> np.ndarray:
    """Keep each limb near its own median length. Directions stay; spikes shrink."""
    out = np.asarray(xyz, dtype=np.float32).copy()
    for chain in _LIMB_CHAINS:
        _clamp_chain(out, chain, 0.72, 1.38, max_med=1.2)
    for bone in _FOOT_BONES:
        _clamp_chain(out, bone, 0.55, 1.7, max_med=0.45)
    if out.shape[1] >= 133:
        for base in (91, 112):
            chains = (
                (base, base + 1, base + 2, base + 3, base + 4),
                (base, base + 5, base + 6, base + 7, base + 8),
                (base, base + 9, base + 10, base + 11, base + 12),
                (base, base + 13, base + 14, base + 15, base + 16),
                (base, base + 17, base + 18, base + 19, base + 20),
            )
            for chain in chains:
                _clamp_chain(out, chain, 0.5, 1.85, max_med=0.12)
    return out


def gaussian_smooth_weighted(
    xyz: np.ndarray,
    sigma: float = 0.5,
    weights: np.ndarray | None = None,
) -> np.ndarray:
    """Light blur. A zero-weight frame does not pull its neighbours."""
    xyz = np.asarray(xyz, dtype=np.float32)
    t, j, c = xyz.shape
    if t < 5 or sigma <= 0:
        return xyz
    radius = max(1, int(math.ceil(3 * sigma)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    kernel = np.exp(-0.5 * (x / max(sigma, 1e-3)) ** 2)
    kernel /= kernel.sum()
    if weights is None:
        w = np.ones((t, j), dtype=np.float32)
    else:
        w = np.nan_to_num(np.asarray(weights, dtype=np.float32), nan=0.0)
        if w.ndim == 1:
            w = np.repeat(w[:, None], j, axis=1)
        if w.shape[0] != t:
            w = np.ones((t, j), dtype=np.float32)
        elif w.shape[1] == 1:
            w = np.repeat(w, j, axis=1)
        elif w.shape[1] != j:
            w = np.repeat(w[:, :1], j, axis=1)
        w = np.clip(w, 0, None)
    pad_xyz = np.pad(xyz, ((radius, radius), (0, 0), (0, 0)), mode='edge')
    pad_w = np.pad(w, ((radius, radius), (0, 0)), mode='edge')
    out = np.empty_like(xyz)
    for ji in range(j):
        ww = pad_w[:, ji]
        den = np.convolve(ww, kernel, mode='valid')
        for ci in range(c):
            num = np.convolve(pad_xyz[:, ji, ci] * ww, kernel, mode='valid')
            good = den > 1e-6
            out[:, ji, ci] = np.where(good, num / np.maximum(den, 1e-6), xyz[:, ji, ci])
    return out

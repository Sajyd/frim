"""GPU pose → MediaPipe-33 body + 21-point hands for Frim's IK retargeter.

Pipeline:
  1. RTMW3D-x (3D, CUDA) — 133 keypoints with real depth for body, feet, hands
  2. Fallback: RTMW 2D + MotionBERT if RTMW3D cannot load
  3. Hip-centred metric skeleton so the editor rotates the user's mesh
     without stretching it to the person in the video
  4. Light median + Gaussian denoise (1-frame jitter only) so robotic snaps
     stay distinct from organic glides
"""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
import urllib.request
from typing import Any

import cv2
import numpy as np


class CaptureCancelled(Exception):
    """Raised when the user cancels a GPU capture mid-infer."""

# COCO-17
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16

# H36M-17
H_PELVIS, H_RHIP, H_RKNEE, H_RANK = 0, 1, 2, 3
H_LHIP, H_LKNEE, H_LANK = 4, 5, 6
H_SPINE, H_THORAX, H_NECK, H_HEAD = 7, 8, 9, 10
H_LSHO, H_LELB, H_LWRI = 11, 12, 13
H_RSHO, H_RELB, H_RWRI = 14, 15, 16

# COCO-WholeBody 133: body 0-16, feet 17-22, face 23-90, L hand 91-111, R 112-132
L_HAND0, R_HAND0 = 91, 112
L_HEEL, R_HEEL, L_BIG_TOE, R_BIG_TOE = 19, 22, 17, 20
# MediaPipe Hands 21: 0 wrist, 1-4 thumb, 5-8 index, 9-12 middle, 13-16 ring, 17-20 pinky
H_PINKY_MCP, H_INDEX_MCP, H_THUMB_TIP, H_INDEX_TIP, H_PINKY_TIP = 17, 5, 4, 8, 20

# Adult rest lengths (meters). Applied along MotionBERT directions so the
# exported skeleton has mesh-like proportions, not the actor's pixel size.
H36M_BONES = [
    (H_PELVIS, H_RHIP, 0.105),
    (H_RHIP, H_RKNEE, 0.42),
    (H_RKNEE, H_RANK, 0.40),
    (H_PELVIS, H_LHIP, 0.105),
    (H_LHIP, H_LKNEE, 0.42),
    (H_LKNEE, H_LANK, 0.40),
    (H_PELVIS, H_SPINE, 0.24),
    (H_SPINE, H_THORAX, 0.24),
    (H_THORAX, H_NECK, 0.12),
    (H_NECK, H_HEAD, 0.18),
    (H_THORAX, H_LSHO, 0.18),
    (H_LSHO, H_LELB, 0.28),
    (H_LELB, H_LWRI, 0.25),
    (H_THORAX, H_RSHO, 0.18),
    (H_RSHO, H_RELB, 0.28),
    (H_RELB, H_RWRI, 0.25),
]

RTMW3D_URL = os.environ.get(
    'RTMW3D_URL',
    'https://huggingface.co/Soykaf/RTMW3D-x/resolve/main/onnx/rtmw3d-x_8xb64_cocktail14-384x288-b0a0eab7_20240626.onnx',
)
RTMW3D_PATH = os.environ.get('RTMW3D_ONNX', '/models/rtmw3d-x.onnx')

MOTIONBERT_URL = os.environ.get(
    'MOTIONBERT_URL',
    'https://huggingface.co/bukuroo/MotionBERT-3d-ONNX/resolve/main/motionbert_3d_81.onnx',
)
MOTIONBERT_PATH = os.environ.get('MOTIONBERT_ONNX', '/models/motionbert_3d_81.onnx')
CLIP_LEN = 81
CLIP_STRIDE = 27

_BODY = None
_DEVICE = None
_POSE_KIND = 'body'
_MB_SESS = None
_MB_INPUT = None


def _device() -> str:
    try:
        import onnxruntime as ort
        if 'CUDAExecutionProvider' in ort.get_available_providers():
            return 'cuda'
    except Exception:
        pass
    return 'cpu'


def _ort_providers() -> list:
    import onnxruntime as ort
    avail = ort.get_available_providers()
    if 'CUDAExecutionProvider' in avail:
        return ['CUDAExecutionProvider', 'CPUExecutionProvider']
    return ['CPUExecutionProvider']


def _ensure_file(url: str, path: str) -> str:
    if os.path.isfile(path) and os.path.getsize(path) > 1_000_000:
        return path
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.part'
    urllib.request.urlretrieve(url, tmp)
    os.replace(tmp, path)
    return path


def _load_body():
    device = _device()
    try:
        from rtmlib import Wholebody3d
        kwargs = dict(to_openpose=False, mode='balanced', backend='onnxruntime', device=device)
        try:
            local = _ensure_file(RTMW3D_URL, RTMW3D_PATH)
            kwargs['pose'] = local
            kwargs['pose_input_size'] = (288, 384)
        except Exception:
            pass
        return Wholebody3d(**kwargs), device, 'rtmw3d'
    except Exception as exc:
        print(f'RTMW3D unavailable ({exc}); using 2D wholebody + MotionBERT', flush=True)
    try:
        from rtmlib import Wholebody
        return Wholebody(to_openpose=False, mode='performance', backend='onnxruntime', device=device), device, 'wholebody'
    except Exception:
        from rtmlib import Body
        return Body(to_openpose=False, mode='performance', backend='onnxruntime', device=device), device, 'body'


def get_body():
    global _BODY, _DEVICE, _POSE_KIND
    if _BODY is None:
        _BODY, _DEVICE, _POSE_KIND = _load_body()
    return _BODY, _DEVICE


def pose_kind() -> str:
    get_body()
    return _POSE_KIND


def _ensure_motionbert(path: str) -> str:
    return _ensure_file(MOTIONBERT_URL, path)


def get_motionbert():
    global _MB_SESS, _MB_INPUT
    if _MB_SESS is None:
        import onnxruntime as ort
        path = _ensure_motionbert(MOTIONBERT_PATH)
        so = ort.SessionOptions()
        so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        _MB_SESS = ort.InferenceSession(path, sess_options=so, providers=_ort_providers())
        _MB_INPUT = _MB_SESS.get_inputs()[0].name
    return _MB_SESS, _MB_INPUT


def extract_frames(video_path: str, max_fps: float = 30.0, max_side: int = 960) -> tuple[list[np.ndarray], float, int, int]:
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError('Could not open video')
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 1)
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 1)
    fps = min(max_fps, src_fps if src_fps > 1 else 30.0)
    step = max(src_fps / fps, 1.0)

    frames: list[np.ndarray] = []
    idx = 0.0
    frame_i = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if frame_i >= idx:
            h, w = frame.shape[:2]
            scale = min(1.0, max_side / max(h, w))
            if scale < 0.999:
                frame = cv2.resize(frame, (int(w * scale), int(h * scale)), interpolation=cv2.INTER_AREA)
            frames.append(frame)
            idx += step
        frame_i += 1
        if len(frames) >= int(90 * fps) + 2:
            break
    cap.release()
    if not frames:
        raise RuntimeError('No frames decoded')
    fh, fw = frames[0].shape[:2]
    return frames, fps, fw, fh


def coco_xy_from_rtm(output) -> tuple[np.ndarray, np.ndarray]:
    kpts, scores = output
    kpts = np.asarray(kpts)
    scores = np.asarray(scores)
    if kpts.ndim == 3:
        kpts = kpts[0]
        scores = scores[0] if scores.ndim > 1 else scores
    n = max(int(kpts.shape[0]), 17)
    xy = np.zeros((n, 2), dtype=np.float32)
    sc = np.zeros(n, dtype=np.float32)
    take = min(kpts.shape[0], n)
    xy[:take] = kpts[:take, :2]
    if scores.shape[0] >= take:
        sc[:take] = scores[:take]
    else:
        sc[:take] = 1.0
    return xy, sc


def _person(arr: np.ndarray) -> np.ndarray:
    a = np.asarray(arr)
    if a.ndim == 3:
        a = a[0]
    return a.astype(np.float32)


def decode_pose(model, frame) -> tuple[np.ndarray, np.ndarray, np.ndarray | None]:
    """Returns (xy133_or_17, scores, xyz133_or_none)."""
    out = model(frame)
    if isinstance(out, (tuple, list)) and len(out) >= 4:
        k3d, scores, _, k2d = out[0], out[1], out[2], out[3]
        xy = _person(k2d)[:, :2]
        sc = _person(scores).reshape(-1)
        xyz = _person(k3d)
        if xyz.ndim == 2 and xyz.shape[1] >= 3:
            return xy, sc[: xy.shape[0]], xyz[:, :3]
        return xy, sc[: xy.shape[0]], None
    if isinstance(out, (tuple, list)) and len(out) >= 2:
        xy, sc = coco_xy_from_rtm((out[0], out[1]))
        return xy, sc, None
    xy, sc = coco_xy_from_rtm(out)
    return xy, sc, None


def rtmw3d_to_world(xyz: np.ndarray) -> np.ndarray:
    """RTMW3D crop-space xy + root-relative z → hip-centred y-down meters."""
    out = xyz.astype(np.float32).copy()
    mid_hip = 0.5 * (out[:, L_HIP] + out[:, R_HIP])
    out -= mid_hip[:, None, :]
    xy_span = np.linalg.norm(out[:, :, :2], axis=-1)
    p95 = float(np.percentile(xy_span, 95)) if xy_span.size else 0.0
    if p95 > 5:
        out[:, :, :2] *= 0.85 / max(p95, 1e-3)
    if float(np.mean(out[:, NOSE, 1])) > 0:
        out[:, :, 1] *= -1
    if float(np.mean(out[:, NOSE, 2])) > 0:
        out[:, :, 2] *= -1
    torso = np.linalg.norm(
        0.5 * (out[:, L_SHO] + out[:, R_SHO]) - 0.5 * (out[:, L_HIP] + out[:, R_HIP]),
        axis=-1,
    )
    valid = torso > 1e-4
    med = float(np.median(torso[valid])) if np.any(valid) else 0.55
    out *= 0.55 / max(med, 1e-3)
    out -= (0.5 * (out[:, L_HIP] + out[:, R_HIP]))[:, None, :]
    return out


def median_filter(xyz: np.ndarray, k: int = 3) -> np.ndarray:
    t = xyz.shape[0]
    if t < k:
        return xyz
    pad = k // 2
    p = np.pad(xyz, ((pad, pad), (0, 0), (0, 0)), mode='edge')
    out = np.empty_like(xyz)
    for i in range(t):
        out[i] = np.median(p[i:i + k], axis=0)
    return out


def coco_to_h36m(xy: np.ndarray, conf: np.ndarray) -> np.ndarray:
    """COCO-17 (T,17,2) + conf (T,17) → H36M-17 (T,17,3) with confidence."""
    t = xy.shape[0]

    def j(i: int) -> np.ndarray:
        return np.concatenate([xy[:, i], conf[:, i:i + 1]], axis=-1)

    lhip, rhip = j(L_HIP), j(R_HIP)
    lsho, rsho = j(L_SHO), j(R_SHO)
    pelvis = (lhip + rhip) * 0.5
    thorax = (lsho + rsho) * 0.5
    nose = j(NOSE)
    head = nose.copy()
    head[:, :2] = nose[:, :2] + 0.35 * (nose[:, :2] - thorax[:, :2])

    h = np.zeros((t, 17, 3), dtype=np.float32)
    h[:, H_PELVIS] = pelvis
    h[:, H_RHIP] = rhip
    h[:, H_RKNEE] = j(R_KNE)
    h[:, H_RANK] = j(R_ANK)
    h[:, H_LHIP] = lhip
    h[:, H_LKNEE] = j(L_KNE)
    h[:, H_LANK] = j(L_ANK)
    h[:, H_THORAX] = thorax
    h[:, H_SPINE] = (pelvis + thorax) * 0.5
    h[:, H_NECK] = (thorax + nose) * 0.5
    h[:, H_HEAD] = head
    h[:, H_LSHO] = lsho
    h[:, H_LELB] = j(L_ELB)
    h[:, H_LWRI] = j(L_WRI)
    h[:, H_RSHO] = rsho
    h[:, H_RELB] = j(R_ELB)
    h[:, H_RWRI] = j(R_WRI)
    return h


def crop_scale(motion: np.ndarray) -> np.ndarray:
    """Normalize 2D keypoints to [-1, 1] (MotionBERT in-the-wild). motion: (T,17,3)."""
    result = motion.copy()
    valid = motion[motion[..., 2] > 0.05][:, :2]
    if len(valid) < 4:
        return np.zeros_like(motion)
    xmin, ymin = valid.min(axis=0)
    xmax, ymax = valid.max(axis=0)
    scale = max(float(xmax - xmin), float(ymax - ymin), 1e-3)
    xs = (xmin + xmax - scale) / 2.0
    ys = (ymin + ymax - scale) / 2.0
    result[..., 0] = (motion[..., 0] - xs) / scale
    result[..., 1] = (motion[..., 1] - ys) / scale
    result[..., :2] = (result[..., :2] - 0.5) * 2.0
    result[..., :2] = np.clip(result[..., :2], -1.0, 1.0)
    return result.astype(np.float32)


def lift_motionbert(h36m_2d: np.ndarray) -> np.ndarray:
    """h36m_2d: (T,17,3) pixel xy+conf → (T,17,3) camera xyz, pelvis-centred."""
    sess, name = get_motionbert()
    t = h36m_2d.shape[0]
    motion = crop_scale(h36m_2d)
    if t < CLIP_LEN:
        pad = np.repeat(motion[-1:], CLIP_LEN - t, axis=0)
        motion = np.concatenate([motion, pad], axis=0)
        clip = motion[None, :CLIP_LEN].astype(np.float32)
        out = sess.run(None, {name: clip})[0][0, :t]
        return out.astype(np.float32)

    acc = np.zeros((t, 17, 3), dtype=np.float32)
    wsum = np.zeros((t, 1, 1), dtype=np.float32)
    starts = list(range(0, max(t - CLIP_LEN, 0) + 1, CLIP_STRIDE))
    if starts[-1] != t - CLIP_LEN:
        starts.append(t - CLIP_LEN)
    hann = np.hanning(CLIP_LEN).astype(np.float32)
    hann = np.maximum(hann, 0.05)
    for st in starts:
        clip = motion[st:st + CLIP_LEN][None].astype(np.float32)
        pred = sess.run(None, {name: clip})[0][0]
        acc[st:st + CLIP_LEN] += pred * hann[:, None, None]
        wsum[st:st + CLIP_LEN] += hann[:, None, None]
    return (acc / np.maximum(wsum, 1e-6)).astype(np.float32)


def apply_canonical_bones(xyz: np.ndarray) -> np.ndarray:
    """Keep MotionBERT directions, replace lengths with a canonical adult skeleton."""
    out = np.zeros_like(xyz)
    out[:, H_PELVIS] = 0.0
    src = xyz.copy()
    src -= src[:, H_PELVIS:H_PELVIS + 1]
    for parent, child, length in H36M_BONES:
        d = src[:, child] - src[:, parent]
        n = np.linalg.norm(d, axis=-1, keepdims=True)
        n = np.maximum(n, 1e-6)
        out[:, child] = out[:, parent] + (d / n) * length
    return out


def to_mp_world(h36m: np.ndarray) -> np.ndarray:
    """H36M camera xyz (y-up, +z away) → COCO-17, y-down, hip-centred, meters."""
    xyz = h36m.copy()
    xyz -= xyz[:, H_PELVIS:H_PELVIS + 1]
    # Head should be +y in H36M. If not, the model used a flipped axis.
    if float(np.mean(xyz[:, H_HEAD, 1])) < 0:
        xyz[:, 1] *= -1
    # y-up → y-down
    xyz[:, 1] *= -1
    # Nose/head closer to camera than pelvis → negative z in MediaPipe image convention.
    if float(np.mean(xyz[:, H_HEAD, 2] - xyz[:, H_PELVIS, 2])) > 0:
        xyz[:, 2] *= -1

    coco = np.zeros((xyz.shape[0], 17, 3), dtype=np.float32)
    coco[:, NOSE] = xyz[:, H_NECK] * 0.25 + xyz[:, H_HEAD] * 0.75
    coco[:, L_EYE] = coco[:, NOSE] + np.array([-0.03, -0.02, -0.02], dtype=np.float32)
    coco[:, R_EYE] = coco[:, NOSE] + np.array([0.03, -0.02, -0.02], dtype=np.float32)
    coco[:, L_EAR] = coco[:, NOSE] + np.array([-0.06, -0.01, 0.03], dtype=np.float32)
    coco[:, R_EAR] = coco[:, NOSE] + np.array([0.06, -0.01, 0.03], dtype=np.float32)
    coco[:, L_SHO] = xyz[:, H_LSHO]
    coco[:, R_SHO] = xyz[:, H_RSHO]
    coco[:, L_ELB] = xyz[:, H_LELB]
    coco[:, R_ELB] = xyz[:, H_RELB]
    coco[:, L_WRI] = xyz[:, H_LWRI]
    coco[:, R_WRI] = xyz[:, H_RWRI]
    coco[:, L_HIP] = xyz[:, H_LHIP]
    coco[:, R_HIP] = xyz[:, H_RHIP]
    coco[:, L_KNE] = xyz[:, H_LKNEE]
    coco[:, R_KNE] = xyz[:, H_RKNEE]
    coco[:, L_ANK] = xyz[:, H_LANK]
    coco[:, R_ANK] = xyz[:, H_RANK]
    mid = 0.5 * (coco[:, L_HIP] + coco[:, R_HIP])
    coco -= mid[:, None, :]
    return coco


def gaussian_smooth(xyz: np.ndarray, sigma: float = 1.15) -> np.ndarray:
    t = xyz.shape[0]
    if t < 5:
        return xyz
    radius = max(1, int(math.ceil(3 * sigma)))
    x = np.arange(-radius, radius + 1, dtype=np.float32)
    k = np.exp(-0.5 * (x / sigma) ** 2)
    k /= k.sum()
    pad = np.pad(xyz, ((radius, radius), (0, 0), (0, 0)), mode='edge')
    out = np.empty_like(xyz)
    for j in range(xyz.shape[1]):
        for c in range(3):
            out[:, j, c] = np.convolve(pad[:, j, c], k, mode='valid')
    return out


def pack_lm(x: float, y: float, z: float, v: float) -> dict:
    return {'x': float(x), 'y': float(y), 'z': float(z), 'visibility': float(np.clip(v, 0.0, 1.0))}


def lift_hand_21(
    hand_xy: np.ndarray,
    hand_sc: np.ndarray,
    wrist_xyz: np.ndarray,
    elbow_xyz: np.ndarray,
    wrist_xy: np.ndarray,
    elbow_xy: np.ndarray,
) -> np.ndarray:
    """Place 21 hand pixels into the MotionBERT wrist frame (y-down, meters)."""
    out = np.repeat(wrist_xyz[None, :], 21, axis=0).astype(np.float32)
    forearm_px = float(np.linalg.norm(wrist_xy - elbow_xy))
    forearm_m = float(np.linalg.norm(wrist_xyz - elbow_xyz))
    scale = forearm_m / max(forearm_px, 1.0)
    for i in range(min(21, hand_xy.shape[0])):
        d = hand_xy[i] - wrist_xy
        out[i, 0] = wrist_xyz[0] + float(d[0]) * scale
        out[i, 1] = wrist_xyz[1] + float(d[1]) * scale
        out[i, 2] = wrist_xyz[2]
    out[0] = wrist_xyz
    # Drop obviously missing fingers (keep wrist).
    for i in range(1, 21):
        if i < hand_sc.shape[0] and hand_sc[i] < 0.12:
            out[i] = out[0]
    return out


def hand21_image(hand_xy: np.ndarray, hand_xyz: np.ndarray, hand_sc: np.ndarray, width: int, height: int) -> list[dict]:
    pts = []
    for i in range(21):
        xy = hand_xy[i] if i < hand_xy.shape[0] else np.zeros(2)
        xyz = hand_xyz[i] if i < hand_xyz.shape[0] else np.zeros(3)
        v = float(hand_sc[i]) if i < hand_sc.shape[0] else 0.0
        pts.append(pack_lm(xy[0] / max(width, 1), xy[1] / max(height, 1), xyz[2] / 0.9, v))
    return pts


def hand21_world(hand_xyz: np.ndarray, hand_sc: np.ndarray) -> list[dict]:
    pts = []
    for i in range(21):
        xyz = hand_xyz[i] if i < hand_xyz.shape[0] else np.zeros(3)
        v = float(hand_sc[i]) if i < hand_sc.shape[0] else 0.0
        pts.append(pack_lm(xyz[0], xyz[1], xyz[2], v))
    return pts


def coco_to_mp33(
    coco_xy: np.ndarray,
    coco_xyz: np.ndarray,
    scores: np.ndarray,
    width: int,
    height: int,
    left_hand_xy: np.ndarray | None = None,
    left_hand_xyz: np.ndarray | None = None,
    left_hand_sc: np.ndarray | None = None,
    right_hand_xy: np.ndarray | None = None,
    right_hand_xyz: np.ndarray | None = None,
    right_hand_sc: np.ndarray | None = None,
    full_xy: np.ndarray | None = None,
    full_sc: np.ndarray | None = None,
    full_xyz: np.ndarray | None = None,
) -> tuple[list[dict], list[dict]]:
    def vis(i: int) -> float:
        return float(np.clip(scores[i], 0.0, 1.0))

    def pt_img(i: int, dx=0.0, dy=0.0, dz=0.0, v=None):
        x = float((coco_xy[i, 0] + dx) / max(width, 1))
        y = float((coco_xy[i, 1] + dy) / max(height, 1))
        z = float(coco_xyz[i, 2] / 0.9 + dz)
        return {'x': x, 'y': y, 'z': z, 'visibility': vis(i) if v is None else v}

    def pt_wld(i: int, dx=0.0, dy=0.0, dz=0.0, v=None):
        return {
            'x': float(coco_xyz[i, 0] + dx),
            'y': float(coco_xyz[i, 1] + dy),
            'z': float(coco_xyz[i, 2] + dz),
            'visibility': vis(i) if v is None else v,
        }

    mapping_exact = {
        0: NOSE,
        2: L_EYE, 5: R_EYE,
        7: L_EAR, 8: R_EAR,
        11: L_SHO, 12: R_SHO,
        13: L_ELB, 14: R_ELB,
        15: L_WRI, 16: R_WRI,
        23: L_HIP, 24: R_HIP,
        25: L_KNE, 26: R_KNE,
        27: L_ANK, 28: R_ANK,
    }
    img = [pt_img(NOSE) for _ in range(33)]
    wld = [pt_wld(NOSE) for _ in range(33)]
    for mp_i, coco_i in mapping_exact.items():
        img[mp_i] = pt_img(coco_i)
        wld[mp_i] = pt_wld(coco_i)

    img[1] = pt_img(L_EYE, dx=-2); wld[1] = pt_wld(L_EYE, dx=-0.01)
    img[3] = pt_img(L_EYE, dx=2); wld[3] = pt_wld(L_EYE, dx=0.01)
    img[4] = pt_img(R_EYE, dx=-2); wld[4] = pt_wld(R_EYE, dx=-0.01)
    img[6] = pt_img(R_EYE, dx=2); wld[6] = pt_wld(R_EYE, dx=0.01)
    img[9] = pt_img(NOSE, dx=-6, dy=12); wld[9] = pt_wld(NOSE, dx=-0.03, dy=0.04)
    img[10] = pt_img(NOSE, dx=6, dy=12); wld[10] = pt_wld(NOSE, dx=0.03, dy=0.04)

    def apply_hand(mp_pinky: int, mp_index: int, mp_thumb: int, hxy, hxyz, hsc, wrist_i: int):
        if hxy is None or hxyz is None or hsc is None or hxy.shape[0] < 21:
            img[mp_pinky] = pt_img(wrist_i, dx=-8 if wrist_i == L_WRI else 8, dy=6, v=vis(wrist_i) * 0.4)
            wld[mp_pinky] = pt_wld(wrist_i, dx=-0.03 if wrist_i == L_WRI else 0.03, dy=0.02, dz=-0.04, v=vis(wrist_i) * 0.4)
            img[mp_index] = pt_img(wrist_i, dx=-8 if wrist_i == L_WRI else 8, dy=6, v=vis(wrist_i) * 0.4)
            wld[mp_index] = pt_wld(wrist_i, dx=-0.03 if wrist_i == L_WRI else 0.03, dy=0.02, dz=-0.04, v=vis(wrist_i) * 0.4)
            img[mp_thumb] = pt_img(wrist_i, dx=-8 if wrist_i == L_WRI else 8, dy=6, v=vis(wrist_i) * 0.4)
            wld[mp_thumb] = pt_wld(wrist_i, dx=-0.03 if wrist_i == L_WRI else 0.03, dy=0.02, dz=-0.04, v=vis(wrist_i) * 0.4)
            return
        pairs = (
            (mp_pinky, H_PINKY_TIP if float(hsc[H_PINKY_TIP]) >= 0.2 else H_PINKY_MCP),
            (mp_index, H_INDEX_TIP if float(hsc[H_INDEX_TIP]) >= 0.2 else H_INDEX_MCP),
            (mp_thumb, H_THUMB_TIP),
        )
        for mp_i, hi in pairs:
            v = float(np.clip(hsc[hi], 0.0, 1.0))
            img[mp_i] = pack_lm(hxy[hi, 0] / max(width, 1), hxy[hi, 1] / max(height, 1), hxyz[hi, 2] / 0.9, v)
            wld[mp_i] = pack_lm(hxyz[hi, 0], hxyz[hi, 1], hxyz[hi, 2], v)

    apply_hand(17, 19, 21, left_hand_xy, left_hand_xyz, left_hand_sc, L_WRI)
    apply_hand(18, 20, 22, right_hand_xy, right_hand_xyz, right_hand_sc, R_WRI)

    def apply_foot(mp_heel: int, mp_toe: int, heel_i: int, toe_i: int, ankle_i: int):
        if full_xyz is not None and full_xyz.shape[0] > max(heel_i, toe_i):
            hv = float(full_sc[heel_i]) if full_sc is not None and full_sc.shape[0] > heel_i else 1.0
            tv = float(full_sc[toe_i]) if full_sc is not None and full_sc.shape[0] > toe_i else 1.0
            if full_xy is not None and full_xy.shape[0] > max(heel_i, toe_i):
                img[mp_heel] = pack_lm(full_xy[heel_i, 0] / max(width, 1), full_xy[heel_i, 1] / max(height, 1), full_xyz[heel_i, 2] / 0.9, hv)
                img[mp_toe] = pack_lm(full_xy[toe_i, 0] / max(width, 1), full_xy[toe_i, 1] / max(height, 1), full_xyz[toe_i, 2] / 0.9, tv)
            else:
                img[mp_heel] = pt_img(ankle_i, dy=8, v=hv)
                img[mp_toe] = pt_img(ankle_i, dy=18, v=tv)
            wld[mp_heel] = pack_lm(full_xyz[heel_i, 0], full_xyz[heel_i, 1], full_xyz[heel_i, 2], hv)
            wld[mp_toe] = pack_lm(full_xyz[toe_i, 0], full_xyz[toe_i, 1], full_xyz[toe_i, 2], tv)
            return
        if full_xy is None or full_xy.shape[0] <= max(heel_i, toe_i):
            img[mp_heel] = pt_img(ankle_i, dy=8)
            wld[mp_heel] = pt_wld(ankle_i, dy=0.04, dz=0.05)
            img[mp_toe] = pt_img(ankle_i, dy=18)
            wld[mp_toe] = pt_wld(ankle_i, dy=0.10, dz=-0.06)
            return
        hv = float(full_sc[heel_i]) if full_sc is not None and full_sc.shape[0] > heel_i else 0.0
        tv = float(full_sc[toe_i]) if full_sc is not None and full_sc.shape[0] > toe_i else 0.0
        if hv >= 0.2:
            img[mp_heel] = pack_lm(full_xy[heel_i, 0] / max(width, 1), full_xy[heel_i, 1] / max(height, 1), coco_xyz[ankle_i, 2] / 0.9, hv)
            heel_dir = full_xy[heel_i] - coco_xy[ankle_i]
            scale = 0.08 / max(float(np.linalg.norm(coco_xy[ankle_i] - coco_xy[L_KNE if ankle_i == L_ANK else R_KNE])), 1.0)
            wld[mp_heel] = pack_lm(
                coco_xyz[ankle_i, 0] + heel_dir[0] * scale,
                coco_xyz[ankle_i, 1] + heel_dir[1] * scale,
                coco_xyz[ankle_i, 2] + 0.04,
                hv,
            )
        else:
            img[mp_heel] = pt_img(ankle_i, dy=8)
            wld[mp_heel] = pt_wld(ankle_i, dy=0.04, dz=0.05)
        if tv >= 0.2:
            img[mp_toe] = pack_lm(full_xy[toe_i, 0] / max(width, 1), full_xy[toe_i, 1] / max(height, 1), coco_xyz[ankle_i, 2] / 0.9, tv)
            toe_dir = full_xy[toe_i] - coco_xy[ankle_i]
            scale = 0.12 / max(float(np.linalg.norm(coco_xy[ankle_i] - coco_xy[L_KNE if ankle_i == L_ANK else R_KNE])), 1.0)
            wld[mp_toe] = pack_lm(
                coco_xyz[ankle_i, 0] + toe_dir[0] * scale,
                coco_xyz[ankle_i, 1] + toe_dir[1] * scale,
                coco_xyz[ankle_i, 2] - 0.05,
                tv,
            )
        else:
            img[mp_toe] = pt_img(ankle_i, dy=18)
            wld[mp_toe] = pt_wld(ankle_i, dy=0.10, dz=-0.06)

    apply_foot(29, 31, L_HEEL, L_BIG_TOE, L_ANK)
    apply_foot(30, 32, R_HEEL, R_BIG_TOE, R_ANK)
    return img, wld


def infer_video(video_path: str, progress_cb=None, cancel_cb=None) -> dict[str, Any]:
    frames, fps, width, height = extract_frames(video_path)
    body, device = get_body()
    kind = pose_kind()
    n = len(frames)
    full_xy = np.zeros((n, 133, 2), dtype=np.float32)
    full_sc = np.zeros((n, 133), dtype=np.float32)
    full_xyz = np.zeros((n, 133, 3), dtype=np.float32)
    has_3d = False
    last_xy = None
    last_sc = np.ones(17, dtype=np.float32) * 0.01
    last_xyz = None

    for i, frame in enumerate(frames):
        if cancel_cb and cancel_cb():
            raise CaptureCancelled()
        try:
            xy, scores, xyz = decode_pose(body, frame)
            take = min(xy.shape[0], 133)
            full_xy[i, :take] = xy[:take, :2]
            full_sc[i, :take] = scores[:take]
            last_xy, last_sc = xy[:17], scores[:17]
            if xyz is not None and xyz.shape[0] >= 17:
                t3 = min(xyz.shape[0], 133)
                full_xyz[i, :t3] = xyz[:t3]
                last_xyz = xyz
                has_3d = True
        except CaptureCancelled:
            raise
        except Exception:
            if last_xy is not None:
                full_xy[i, :17] = last_xy[:17]
                full_sc[i, :17] = last_sc[:17] * 0.3
            if last_xyz is not None:
                t3 = min(last_xyz.shape[0], 133)
                full_xyz[i, :t3] = last_xyz[:t3]
        if progress_cb and (i % 5 == 0 or i == n - 1):
            progress_cb(i + 1, n * 2)

    xy = full_xy[:, :17]
    conf = full_sc[:, :17]
    if has_3d and kind == 'rtmw3d':
        world133 = rtmw3d_to_world(full_xyz)
        world133 = median_filter(world133, 3)
        world133 = gaussian_smooth(world133, sigma=0.5)
        coco_xyz = world133[:, :17]
        left_xyz = world133[:, L_HAND0:L_HAND0 + 21]
        right_xyz = world133[:, R_HAND0:R_HAND0 + 21]
        lift = 'rtmw3d'
    else:
        h36m_2d = coco_to_h36m(xy, conf)
        h36m_3d = lift_motionbert(h36m_2d)
        h36m_3d = apply_canonical_bones(h36m_3d)
        h36m_3d = gaussian_smooth(h36m_3d, sigma=0.5)
        coco_xyz = to_mp_world(h36m_3d)
        left_xyz = np.zeros((n, 21, 3), dtype=np.float32)
        right_xyz = np.zeros((n, 21, 3), dtype=np.float32)
        for i in range(n):
            left_xyz[i] = lift_hand_21(
                full_xy[i, L_HAND0:L_HAND0 + 21], full_sc[i, L_HAND0:L_HAND0 + 21],
                coco_xyz[i, L_WRI], coco_xyz[i, L_ELB], xy[i, L_WRI], xy[i, L_ELB],
            )
            right_xyz[i] = lift_hand_21(
                full_xy[i, R_HAND0:R_HAND0 + 21], full_sc[i, R_HAND0:R_HAND0 + 21],
                coco_xyz[i, R_WRI], coco_xyz[i, R_ELB], xy[i, R_WRI], xy[i, R_ELB],
            )
        left_xyz = gaussian_smooth(left_xyz, sigma=0.45)
        right_xyz = gaussian_smooth(right_xyz, sigma=0.45)
        world133 = None
        lift = 'motionbert'

    out_frames = []
    for i in range(n):
        if cancel_cb and cancel_cb():
            raise CaptureCancelled()
        lxy, lsc = full_xy[i, L_HAND0:L_HAND0 + 21], full_sc[i, L_HAND0:L_HAND0 + 21]
        rxy, rsc = full_xy[i, R_HAND0:R_HAND0 + 21], full_sc[i, R_HAND0:R_HAND0 + 21]
        image, world = coco_to_mp33(
            xy[i], coco_xyz[i], conf[i], width, height,
            left_hand_xy=lxy, left_hand_xyz=left_xyz[i], left_hand_sc=lsc,
            right_hand_xy=rxy, right_hand_xyz=right_xyz[i], right_hand_sc=rsc,
            full_xy=full_xy[i], full_sc=full_sc[i],
            full_xyz=None if world133 is None else world133[i],
        )
        out_frames.append({
            'image': image,
            'world': world,
            'leftHand': hand21_world(left_xyz[i], lsc),
            'rightHand': hand21_world(right_xyz[i], rsc),
            'leftHandImage': hand21_image(lxy, left_xyz[i], lsc, width, height),
            'rightHandImage': hand21_image(rxy, right_xyz[i], rsc, width, height),
        })
        if progress_cb and (i % 8 == 0 or i == n - 1):
            progress_cb(n + i + 1, n * 2)

    aspect = width / max(height, 1)
    return {
        'fps': fps,
        'aspect': aspect,
        'width': width,
        'height': height,
        'device': device,
        'lift': lift,
        'hands': True,
        'frames': out_frames,
    }


def maybe_transcode(src: str) -> str:
    lower = src.lower()
    if lower.endswith(('.mp4', '.mov', '.webm', '.avi', '.mkv')):
        cap = cv2.VideoCapture(src)
        ok = cap.isOpened()
        cap.release()
        if ok:
            return src
    dest = tempfile.NamedTemporaryFile(suffix='.mp4', delete=False).name
    subprocess.check_call([
        'ffmpeg', '-y', '-i', src, '-an', '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
        '-movflags', '+faststart', dest,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    return dest

"""GPU pose inference → MediaPipe-33 landmarks for Frim's existing IK retargeter.

Uses RTMPose (ONNX, CUDA) for 2D, then a bone-length / weak-perspective lift for 3D.
Output matches MediaPipe Pose: image xy in 0–1 (y down), world in meters (hip origin).
"""
from __future__ import annotations

import math
import os
import subprocess
import tempfile
from typing import Any

import cv2
import numpy as np

# COCO-17
NOSE, L_EYE, R_EYE, L_EAR, R_EAR = 0, 1, 2, 3, 4
L_SHO, R_SHO, L_ELB, R_ELB, L_WRI, R_WRI = 5, 6, 7, 8, 9, 10
L_HIP, R_HIP, L_KNE, R_KNE, L_ANK, R_ANK = 11, 12, 13, 14, 15, 16

# Rest lengths in meters (adult). Used to recover z from planar 2D length.
BONES = [
    (L_HIP, L_KNE, 0.42),
    (L_KNE, L_ANK, 0.40),
    (R_HIP, R_KNE, 0.42),
    (R_KNE, R_ANK, 0.40),
    (L_HIP, L_SHO, 0.50),
    (R_HIP, R_SHO, 0.50),
    (L_SHO, R_SHO, 0.36),
    (L_HIP, R_HIP, 0.28),
    (L_SHO, L_ELB, 0.28),
    (L_ELB, L_WRI, 0.25),
    (R_SHO, R_ELB, 0.28),
    (R_ELB, R_WRI, 0.25),
    (L_SHO, NOSE, 0.22),
    (R_SHO, NOSE, 0.22),
]

# Default "in front of camera" signs so arms/legs don't collapse into the torso plane.
DEFAULT_SIGN = {
    L_ELB: -1, R_ELB: -1, L_WRI: -1, R_WRI: -1,
    L_KNE: 1, R_KNE: 1, L_ANK: 1, R_ANK: 1,
    L_SHO: -1, R_SHO: -1, NOSE: -1,
    L_EYE: -1, R_EYE: -1, L_EAR: -1, R_EAR: -1,
}


def _device() -> str:
    try:
        import onnxruntime as ort
        if 'CUDAExecutionProvider' in ort.get_available_providers():
            return 'cuda'
    except Exception:
        pass
    return 'cpu'


def _load_body():
    from rtmlib import Body
    device = _device()
    backend = 'onnxruntime'
    # 'balanced' = RTMPose-m: accurate enough, ~5ms/frame on T4.
    # RTMO is a one-stage detector+pose model — fewer GPU-seconds than RTMDet+RTMPose.
    return Body(pose='rtmo', to_openpose=False, mode='balanced', backend=backend, device=device), device


_BODY = None
_DEVICE = None


def get_body():
    global _BODY, _DEVICE
    if _BODY is None:
        _BODY, _DEVICE = _load_body()
    return _BODY, _DEVICE


def extract_frames(video_path: str, max_fps: float = 30.0, max_side: int = 768) -> tuple[list[np.ndarray], float, int, int]:
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
    """rtmlib Body returns (keypoints, scores). keypoints: (1, 17, 2) or (17, 2)."""
    kpts, scores = output
    kpts = np.asarray(kpts)
    scores = np.asarray(scores)
    if kpts.ndim == 3:
        kpts = kpts[0]
        scores = scores[0] if scores.ndim > 1 else scores
    if kpts.shape[0] >= 17:
        kpts = kpts[:17]
        scores = scores[:17] if scores.shape[0] >= 17 else np.ones(17)
    return kpts.astype(np.float32), scores.astype(np.float32)


def lift_3d(kpts_px: np.ndarray, scores: np.ndarray, width: int, height: int, prev_z: np.ndarray | None) -> np.ndarray:
    """Weak-perspective bone-length lift. Returns 17×3 in meters, hip-centered, y-down."""
    xy = kpts_px.copy()
    mid_hip = 0.5 * (xy[L_HIP] + xy[R_HIP])
    shoulder_px = float(np.linalg.norm(xy[L_SHO] - xy[R_SHO]))
    hip_px = float(np.linalg.norm(xy[L_HIP] - xy[R_HIP]))
    ref_px = max(shoulder_px, hip_px, 8.0)
    meters_per_px = 0.36 / ref_px

    xy_m = (xy - mid_hip) * meters_per_px
    # image y is down; keep that so Frim's charVec(-y) matches Fast capture.
    z = np.zeros(17, dtype=np.float32)
    if prev_z is not None:
        z[:] = prev_z

    for parent, child, rest in BONES:
        dxy = xy_m[child] - xy_m[parent]
        planar = float(math.hypot(float(dxy[0]), float(dxy[1])))
        z_rel = math.sqrt(max(0.0, rest * rest - planar * planar))
        sign = DEFAULT_SIGN.get(child, -1)
        if prev_z is not None:
            pred = z[parent] + sign * z_rel
            alt = z[parent] - sign * z_rel
            sign = sign if abs(pred - prev_z[child]) <= abs(alt - prev_z[child]) else -sign
        z[child] = z[parent] + sign * z_rel

    # Eyes / ears sit near the nose in z.
    z[L_EYE] = z[R_EYE] = z[NOSE] - 0.02
    z[L_EAR] = z[R_EAR] = z[NOSE] + 0.04

    conf = np.clip(scores, 0.05, 1.0)
    xyz = np.stack([xy_m[:, 0], xy_m[:, 1], z], axis=-1)
    # Low-confidence joints: pull toward parent / previous to avoid spikes.
    if prev_z is not None:
        for i in range(17):
            if conf[i] < 0.35:
                xyz[i, 2] = prev_z[i]
    return xyz


def coco_to_mp33(coco_xy: np.ndarray, coco_xyz: np.ndarray, scores: np.ndarray, width: int, height: int) -> tuple[list[dict], list[dict]]:
    """Build 33 MediaPipe-style {x,y,z,visibility} dicts for image + world."""
    def vis(i: int) -> float:
        return float(np.clip(scores[i], 0.0, 1.0))

    img = []
    wld = []
    # Helper to push one joint from a coco index
    def pt_img(i: int, dx=0.0, dy=0.0, dz=0.0, v=None):
        x = float((coco_xy[i, 0] + dx) / max(width, 1))
        y = float((coco_xy[i, 1] + dy) / max(height, 1))
        z = float(coco_xyz[i, 2] / 0.9 + dz)  # MP image z is roughly head-normalized
        return {'x': x, 'y': y, 'z': z, 'visibility': vis(i) if v is None else v}

    def pt_wld(i: int, dx=0.0, dy=0.0, dz=0.0, v=None):
        return {
            'x': float(coco_xyz[i, 0] + dx),
            'y': float(coco_xyz[i, 1] + dy),
            'z': float(coco_xyz[i, 2] + dz),
            'visibility': vis(i) if v is None else v,
        }

    # MP 0 nose
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
    # Fill 33 with nose as default then overwrite
    img = [pt_img(NOSE) for _ in range(33)]
    wld = [pt_wld(NOSE) for _ in range(33)]
    for mp_i, coco_i in mapping_exact.items():
        img[mp_i] = pt_img(coco_i)
        wld[mp_i] = pt_wld(coco_i)

    # Eyes inner/outer ≈ eye
    img[1] = pt_img(L_EYE, dx=-2); wld[1] = pt_wld(L_EYE, dx=-0.01)
    img[3] = pt_img(L_EYE, dx=2); wld[3] = pt_wld(L_EYE, dx=0.01)
    img[4] = pt_img(R_EYE, dx=-2); wld[4] = pt_wld(R_EYE, dx=-0.01)
    img[6] = pt_img(R_EYE, dx=2); wld[6] = pt_wld(R_EYE, dx=0.01)
    # Mouth from nose
    img[9] = pt_img(NOSE, dx=-6, dy=12); wld[9] = pt_wld(NOSE, dx=-0.03, dy=0.04)
    img[10] = pt_img(NOSE, dx=6, dy=12); wld[10] = pt_wld(NOSE, dx=0.03, dy=0.04)
    # Hands: copy wrist with slight forward offset
    for mp_i, coco_i, sx in ((17, L_WRI, -1), (19, L_WRI, -1), (21, L_WRI, -1),
                             (18, R_WRI, 1), (20, R_WRI, 1), (22, R_WRI, 1)):
        img[mp_i] = pt_img(coco_i, dx=sx * 8, dy=6, v=vis(coco_i) * 0.7)
        wld[mp_i] = pt_wld(coco_i, dx=sx * 0.03, dy=0.02, dz=-0.02, v=vis(coco_i) * 0.7)
    # Heel / foot index from ankle
    img[29] = pt_img(L_ANK, dy=8); wld[29] = pt_wld(L_ANK, dy=0.04, dz=0.03)
    img[30] = pt_img(R_ANK, dy=8); wld[30] = pt_wld(R_ANK, dy=0.04, dz=0.03)
    img[31] = pt_img(L_ANK, dy=18); wld[31] = pt_wld(L_ANK, dy=0.08, dz=-0.04)
    img[32] = pt_img(R_ANK, dy=18); wld[32] = pt_wld(R_ANK, dy=0.08, dz=-0.04)
    return img, wld


def infer_video(video_path: str, progress_cb=None) -> dict[str, Any]:
    frames, fps, width, height = extract_frames(video_path)
    body, device = get_body()
    n = len(frames)
    out_frames = []
    prev_z = None
    for i, frame in enumerate(frames):
        try:
            kpts, scores = coco_xy_from_rtm(body(frame))
        except Exception:
            if out_frames:
                out_frames.append(out_frames[-1])
            else:
                zeros = [{'x': 0.5, 'y': 0.5, 'z': 0.0, 'visibility': 0.0} for _ in range(33)]
                out_frames.append({'image': zeros, 'world': zeros})
            continue
        xyz = lift_3d(kpts, scores, width, height, prev_z)
        prev_z = xyz[:, 2].copy()
        image, world = coco_to_mp33(kpts, xyz, scores, width, height)
        out_frames.append({'image': image, 'world': world})
        if progress_cb and (i % 5 == 0 or i == n - 1):
            progress_cb(i + 1, n)

    aspect = width / max(height, 1)
    return {
        'fps': fps,
        'aspect': aspect,
        'width': width,
        'height': height,
        'device': device,
        'frames': out_frames,
    }


def maybe_transcode(src: str) -> str:
    """Decode odd containers to mp4 so OpenCV can read them."""
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

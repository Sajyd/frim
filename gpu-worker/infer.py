"""GPU pose → MediaPipe-33 landmarks for Frim's IK retargeter.

Pipeline:
  1. RTMPose-L (2D, CUDA) — accurate per-frame joints
  2. MotionBERT (temporal 2D→3D) — real depth, not a planar bone-length lift
  3. Canonical bone lengths so the editor can rotate the user's mesh
     without stretching it to the person in the video
  4. Gaussian temporal filter so the clip is already smooth before keyframes
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

MOTIONBERT_URL = os.environ.get(
    'MOTIONBERT_URL',
    'https://huggingface.co/bukuroo/MotionBERT-3d-ONNX/resolve/main/motionbert_3d_81.onnx',
)
MOTIONBERT_PATH = os.environ.get('MOTIONBERT_ONNX', '/models/motionbert_3d_81.onnx')
CLIP_LEN = 81
CLIP_STRIDE = 27

_BODY = None
_DEVICE = None
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


def _load_body():
    from rtmlib import Body
    device = _device()
    backend = 'onnxruntime'
    # RTMPose-L + YOLOX-L — more accurate than the old one-stage RTMO-m.
    return Body(to_openpose=False, mode='performance', backend=backend, device=device), device


def get_body():
    global _BODY, _DEVICE
    if _BODY is None:
        _BODY, _DEVICE = _load_body()
    return _BODY, _DEVICE


def _ensure_motionbert(path: str) -> str:
    if os.path.isfile(path) and os.path.getsize(path) > 1_000_000:
        return path
    os.makedirs(os.path.dirname(path) or '.', exist_ok=True)
    tmp = path + '.part'
    urllib.request.urlretrieve(MOTIONBERT_URL, tmp)
    os.replace(tmp, path)
    return path


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
    if kpts.shape[0] >= 17:
        kpts = kpts[:17]
        scores = scores[:17] if scores.shape[0] >= 17 else np.ones(17)
    return kpts.astype(np.float32), scores.astype(np.float32)


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


def coco_to_mp33(
    coco_xy: np.ndarray,
    coco_xyz: np.ndarray,
    scores: np.ndarray,
    width: int,
    height: int,
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
    for mp_i, coco_i, sx in ((17, L_WRI, -1), (19, L_WRI, -1), (21, L_WRI, -1),
                             (18, R_WRI, 1), (20, R_WRI, 1), (22, R_WRI, 1)):
        img[mp_i] = pt_img(coco_i, dx=sx * 8, dy=6, v=vis(coco_i) * 0.7)
        wld[mp_i] = pt_wld(coco_i, dx=sx * 0.03, dy=0.02, dz=-0.04, v=vis(coco_i) * 0.7)
    img[29] = pt_img(L_ANK, dy=8); wld[29] = pt_wld(L_ANK, dy=0.04, dz=0.05)
    img[30] = pt_img(R_ANK, dy=8); wld[30] = pt_wld(R_ANK, dy=0.04, dz=0.05)
    img[31] = pt_img(L_ANK, dy=18); wld[31] = pt_wld(L_ANK, dy=0.10, dz=-0.06)
    img[32] = pt_img(R_ANK, dy=18); wld[32] = pt_wld(R_ANK, dy=0.10, dz=-0.06)
    return img, wld


def infer_video(video_path: str, progress_cb=None) -> dict[str, Any]:
    frames, fps, width, height = extract_frames(video_path)
    body, device = get_body()
    n = len(frames)
    xy = np.zeros((n, 17, 2), dtype=np.float32)
    conf = np.zeros((n, 17), dtype=np.float32)
    last_xy = None
    last_conf = np.ones(17, dtype=np.float32) * 0.01

    for i, frame in enumerate(frames):
        try:
            kpts, scores = coco_xy_from_rtm(body(frame))
            xy[i] = kpts
            conf[i] = scores
            last_xy, last_conf = kpts, scores
        except Exception:
            xy[i] = last_xy if last_xy is not None else np.zeros((17, 2), dtype=np.float32)
            conf[i] = last_conf * 0.3
        if progress_cb and (i % 5 == 0 or i == n - 1):
            progress_cb(i + 1, n * 2)

    h36m_2d = coco_to_h36m(xy, conf)
    h36m_3d = lift_motionbert(h36m_2d)
    h36m_3d = apply_canonical_bones(h36m_3d)
    h36m_3d = gaussian_smooth(h36m_3d, sigma=1.2)
    coco_xyz = to_mp_world(h36m_3d)
    coco_xyz = gaussian_smooth(coco_xyz, sigma=0.7)

    out_frames = []
    for i in range(n):
        image, world = coco_to_mp33(xy[i], coco_xyz[i], conf[i], width, height)
        out_frames.append({'image': image, 'world': world})
        if progress_cb and (i % 8 == 0 or i == n - 1):
            progress_cb(n + i + 1, n * 2)

    aspect = width / max(height, 1)
    return {
        'fps': fps,
        'aspect': aspect,
        'width': width,
        'height': height,
        'device': device,
        'lift': 'motionbert',
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

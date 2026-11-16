"""MotionLCM text-to-motion, packed as the same MediaPipe 33 frames as video mocap.

Checkpoint: ZeyuLing/Motius-MotionLCM-HumanML3D (ECCV 2024 latent consistency).
One LCM step on HumanML3D-263 — fastest Motius T2M that fits Spot T4 (g4dn.xlarge)
without gated SMPL-X assets. DART/Being-M0 need SMPL or unreleased code.

HumanML3D is 20 fps, Y-up, facing +Z, +X on the person's left. The editor
expects MediaPipe world: Y-down, smaller Z closer to the camera.
"""
from __future__ import annotations

import os
import re
from typing import Callable

import numpy as np

from robust import CaptureRejected

MOTIONLCM_REPO = os.environ.get('MOTIONLCM_REPO', 'ZeyuLing/Motius-MotionLCM-HumanML3D')
MOTIONLCM_DIR = os.environ.get('MOTIONLCM_DIR', '/models/motionlcm')
FPS = 20
LCM_STEPS = int(os.environ.get('MOTIONLCM_STEPS', '1'))

# HumanML3D 22-joint order.
PELVIS, L_HIP, R_HIP = 0, 1, 2
L_KNEE, R_KNEE = 4, 5
L_ANK, R_ANK = 7, 8
L_FOOT, R_FOOT = 10, 11
HEAD, L_SHO, R_SHO = 15, 16, 17
L_ELB, R_ELB, L_WRI, R_WRI = 18, 19, 20, 21

_PIPE = None


def clamp_frames(frames: int) -> int:
    """MotionLCM trains on 40..196 frames at 20 fps, multiples of 4."""
    frames = int(frames or 120)
    frames = max(40, min(196, frames))
    return frames - (frames % 4)


def caption_for_model(prompt: str) -> str:
    text = ' '.join(str(prompt or '').split())
    if len(text) < 2:
        raise CaptureRejected('Describe a motion first.')
    if not re.search(r'\b(person|man|woman|someone|human|dancer|boy|girl|kid)\b', text, re.I):
        text = f'a person {text}'
    return text[:320]


def qinv(q: np.ndarray) -> np.ndarray:
    out = np.array(q, dtype=np.float32, copy=True)
    out[..., 1:] *= -1
    return out


def qrot(q: np.ndarray, v: np.ndarray) -> np.ndarray:
    """Rotate v by quaternion q (w, x, y, z). Matches HumanML3D's qrot."""
    qvec = q[..., 1:]
    uv = np.cross(qvec, v)
    uuv = np.cross(qvec, uv)
    return v + 2.0 * (q[..., :1] * uv + uuv)


def recover_root_rot_pos(data: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    rot_vel = data[:, 0]
    r_rot_ang = np.zeros_like(rot_vel)
    r_rot_ang[1:] = rot_vel[:-1]
    r_rot_ang = np.cumsum(r_rot_ang, axis=0)

    r_rot_quat = np.zeros((data.shape[0], 4), dtype=np.float32)
    r_rot_quat[:, 0] = np.cos(r_rot_ang)
    r_rot_quat[:, 2] = np.sin(r_rot_ang)

    r_pos = np.zeros((data.shape[0], 3), dtype=np.float32)
    r_pos[1:, 0] = data[:-1, 1]
    r_pos[1:, 2] = data[:-1, 2]
    r_pos = qrot(qinv(r_rot_quat), r_pos)
    r_pos = np.cumsum(r_pos, axis=0)
    r_pos[:, 1] = data[:, 3]
    return r_rot_quat, r_pos


def recover_from_ric(data: np.ndarray, joints_num: int = 22) -> np.ndarray:
    """HumanML3D 263-D features → (T, 22, 3) joint positions, Y-up."""
    if data.ndim != 2 or data.shape[1] != 263:
        raise CaptureRejected('MotionLCM returned an unexpected motion shape.')
    r_rot_quat, r_pos = recover_root_rot_pos(data)
    positions = data[:, 4:(joints_num - 1) * 3 + 4]
    positions = positions.reshape(data.shape[0], joints_num - 1, 3)
    quat = np.repeat(qinv(r_rot_quat)[:, None, :], joints_num - 1, axis=1)
    positions = qrot(quat, positions)
    positions[..., 0] += r_pos[:, None, 0]
    positions[..., 2] += r_pos[:, None, 2]
    return np.concatenate([r_pos[:, None, :], positions], axis=1).astype(np.float32)


def hml_to_mp(points: np.ndarray) -> np.ndarray:
    out = np.array(points, dtype=np.float32, copy=True)
    out[..., 1] *= -1
    out[..., 2] *= -1
    return out


def _unit(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec, axis=-1, keepdims=True)
    return vec / np.clip(norm, 1e-6, None)


def prepare_joints(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    joints = recover_from_ric(features)
    if joints.shape[0] < 8 or not np.isfinite(joints).all():
        raise CaptureRejected('MotionLCM returned an unusable pose. Try a simpler prompt.')
    hip = float(np.linalg.norm(joints[:, L_HIP] - joints[:, PELVIS], axis=-1).mean())
    if not 0.04 < hip < 0.45:
        raise CaptureRejected('MotionLCM returned a pose with bad proportions. Try again.')

    floor = float(np.percentile(np.minimum(joints[:, L_FOOT, 1], joints[:, R_FOOT, 1]), 5))
    joints = joints.copy()
    joints[:, :, 1] -= floor
    joints[:, :, 0] -= joints[0, PELVIS, 0]
    joints[:, :, 2] -= joints[0, PELVIS, 2]

    # Root yaw lives in the feature's Y quaternion. Facing +Z, person's left is +X.
    quat, _ = recover_root_rot_pos(features[:joints.shape[0]])
    forward = qrot(qinv(quat), np.tile(np.array([0, 0, 1], np.float32), (joints.shape[0], 1)))
    left = qrot(qinv(quat), np.tile(np.array([1, 0, 0], np.float32), (joints.shape[0], 1)))
    up = qrot(qinv(quat), np.tile(np.array([0, 1, 0], np.float32), (joints.shape[0], 1)))
    return hml_to_mp(joints), hml_to_mp(np.stack([forward, left, up], axis=1))


def _lm(point: np.ndarray, scale: float, image: bool) -> dict:
    if image:
        return {
            'x': float(0.5 + point[0] * scale),
            'y': float(0.84 + point[1] * scale),
            'z': float(point[2]),
            'visibility': 1.0,
        }
    return {'x': float(point[0]), 'y': float(point[1]), 'z': float(point[2]), 'visibility': 1.0}


def joints_to_frames(joints_mp: np.ndarray, axes_mp: np.ndarray) -> list[dict]:
    """axes_mp is (T, 3, 3): forward, left, up in MediaPipe space."""
    forward, left, up = axes_mp[:, 0], axes_mp[:, 1], axes_mp[:, 2]
    j = joints_mp
    head = j[:, HEAD]
    nose = head + forward * 0.11
    l_eye = head + forward * 0.08 + left * 0.03 + up * 0.03
    r_eye = head + forward * 0.08 - left * 0.03 + up * 0.03
    l_ear = head + left * 0.08 + up * 0.02
    r_ear = head - left * 0.08 + up * 0.02
    mouth_l = nose - up * 0.04 + left * 0.02
    mouth_r = nose - up * 0.04 - left * 0.02

    def hand(wrist, elbow, side: float):
        reach = _unit(wrist - elbow)
        lateral = left * side
        return (
            wrist + reach * 0.075 + lateral * 0.03,
            wrist + reach * 0.09,
            wrist + reach * 0.04 - lateral * 0.025,
        )

    l_pinky, l_index, l_thumb = hand(j[:, L_WRI], j[:, L_ELB], 1.0)
    r_pinky, r_index, r_thumb = hand(j[:, R_WRI], j[:, R_ELB], -1.0)
    l_heel = j[:, L_ANK] - _unit(j[:, L_FOOT] - j[:, L_ANK]) * 0.06
    r_heel = j[:, R_ANK] - _unit(j[:, R_FOOT] - j[:, R_ANK]) * 0.06

    named = {
        0: nose,
        1: l_eye + left * 0.01,
        2: l_eye,
        3: l_eye - left * 0.01,
        4: r_eye + left * 0.01,
        5: r_eye,
        6: r_eye - left * 0.01,
        7: l_ear,
        8: r_ear,
        9: mouth_l,
        10: mouth_r,
        11: j[:, L_SHO],
        12: j[:, R_SHO],
        13: j[:, L_ELB],
        14: j[:, R_ELB],
        15: j[:, L_WRI],
        16: j[:, R_WRI],
        17: l_pinky,
        18: r_pinky,
        19: l_index,
        20: r_index,
        21: l_thumb,
        22: r_thumb,
        23: j[:, L_HIP],
        24: j[:, R_HIP],
        25: j[:, L_KNEE],
        26: j[:, R_KNEE],
        27: j[:, L_ANK],
        28: j[:, R_ANK],
        29: l_heel,
        30: r_heel,
        31: j[:, L_FOOT],
        32: j[:, R_FOOT],
    }

    span = j[:, L_SHO] - j[:, L_HIP]
    spine = float(np.linalg.norm(span, axis=-1).mean())
    spine = float(np.clip(spine, 0.35, 0.75))
    scale = 0.28 / spine

    frames = []
    count = j.shape[0]
    for i in range(count):
        image = []
        world = []
        for k in range(33):
            point = named[k][i]
            image.append(_lm(point, scale, True))
            world.append(_lm(point, scale, False))
        frames.append({'image': image, 'world': world})
    return frames


def get_pipeline():
    global _PIPE
    if _PIPE is not None:
        return _PIPE
    import torch
    from huggingface_hub import snapshot_download
    from motius.pipelines.motionlcm import MotionLCMPipeline

    if not torch.cuda.is_available():
        raise RuntimeError('MotionLCM needs the T4 GPU. This instance has no CUDA device.')
    os.makedirs(MOTIONLCM_DIR, exist_ok=True)
    snapshot_download(repo_id=MOTIONLCM_REPO, local_dir=MOTIONLCM_DIR)
    _PIPE = MotionLCMPipeline.from_pretrained(
        MOTIONLCM_DIR,
        device='cuda',
    )
    return _PIPE


def warmup() -> None:
    get_pipeline()


def infer_text(
    prompt: str,
    frames: int,
    seed: int | None = None,
    progress_cb: Callable[[int], None] | None = None,
    cancel_cb: Callable[[], bool] | None = None,
) -> dict:
    caption = caption_for_model(prompt)
    frames = clamp_frames(frames)
    if cancel_cb and cancel_cb():
        raise CaptureRejected('Cancelled')
    if progress_cb:
        progress_cb(15)
    pipe = get_pipeline()
    if cancel_cb and cancel_cb():
        raise CaptureRejected('Cancelled')
    if progress_cb:
        progress_cb(35)
    if seed is not None:
        import torch
        torch.manual_seed(int(seed))
        if torch.cuda.is_available():
            torch.cuda.manual_seed_all(int(seed))
    motions = pipe.infer_text_to_motion(
        [caption],
        [frames],
        num_inference_steps=max(1, LCM_STEPS),
    )
    if not motions or motions[0] is None or len(motions[0]) < 8:
        raise CaptureRejected('MotionLCM returned no motion. Try rephrasing the prompt.')
    features = np.asarray(motions[0], dtype=np.float32)
    if features.shape[0] > frames:
        features = features[:frames]
    joints, axes = prepare_joints(features)
    if progress_cb:
        progress_cb(90)
    return {
        'fps': FPS,
        'aspect': 1,
        'device': 'cuda',
        'lift': 'motionlcm',
        'model': 'MotionLCM',
        'prompt': caption,
        'hands': False,
        'frames': joints_to_frames(joints, axes),
    }


def _self_check() -> None:
    data = np.zeros((8, 263), dtype=np.float32)
    data[:, 3] = 0.9
    # RIC joint Y is already a height. Only XZ is root-relative.
    data[:, 4:7] = (0.1, 0.85, 0.0)
    data[:, 46:49] = (0.0, 1.5, 0.05)
    joints = recover_from_ric(data)
    assert joints.shape == (8, 22, 3), joints.shape
    assert np.allclose(joints[0, 0], (0, 0.9, 0), atol=1e-5)
    assert np.allclose(joints[0, 1], (0.1, 0.85, 0), atol=1e-5)
    mp, axes = prepare_joints(data)
    assert mp[0, L_HIP, 0] > mp[0, R_HIP, 0]
    assert mp[0, HEAD, 1] < mp[0, PELVIS, 1]
    frames = joints_to_frames(mp, axes)
    assert len(frames) == 8 and len(frames[0]['world']) == 33
    assert frames[0]['world'][23]['x'] > frames[0]['world'][24]['x']
    print('t2m self-check ok', caption_for_model('walks forward'), clamp_frames(121))


if __name__ == '__main__':
    _self_check()

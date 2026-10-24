"""Pose-track repair. Run: python3 gpu-worker/test_robust.py"""
from __future__ import annotations

import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))

from robust import (  # noqa: E402
    advance_sample,
    body_valid,
    clamp_limb_lengths,
    enough_person,
    gaussian_smooth_weighted,
    normalize_rtmw3d,
    repair_depth_spikes,
    repair_sequence,
    rotation_from_probe,
    sample_frame_indices,
    select_person,
)


def person(cx, cy, scale=1.0, conf=0.9, swap=False):
    xy = np.zeros((133, 2), np.float32)
    sc = np.zeros(133, np.float32)
    torso = 80 * scale
    pts = {
        0: (cx, cy - torso * 1.15),
        5: (cx - 40 * scale, cy - torso * 0.7),
        6: (cx + 40 * scale, cy - torso * 0.7),
        7: (cx - 55 * scale, cy - torso * 0.2),
        8: (cx + 55 * scale, cy - torso * 0.2),
        9: (cx - 60 * scale, cy + torso * 0.15),
        10: (cx + 60 * scale, cy + torso * 0.15),
        11: (cx - 18 * scale, cy),
        12: (cx + 18 * scale, cy),
        13: (cx - 20 * scale, cy + torso * 0.55),
        14: (cx + 20 * scale, cy + torso * 0.55),
        15: (cx - 20 * scale, cy + torso),
        16: (cx + 20 * scale, cy + torso),
    }
    for i, p in pts.items():
        xy[i] = p
        sc[i] = conf
    if swap:
        for a, b in ((5, 6), (7, 8), (9, 10), (11, 12), (13, 14), (15, 16)):
            xy[[a, b]] = xy[[b, a]]
            sc[[a, b]] = sc[[b, a]]
    return xy, sc


def clip(frames):
    t = len(frames)
    xy = np.stack([f[0] for f in frames])
    sc = np.stack([f[1] for f in frames])
    valid = np.ones(t, dtype=bool)
    return xy, sc, valid


def test_select_keeps_the_tracked_person():
    subject = person(120, 200, scale=1.0)
    stranger = person(700, 180, scale=2.4)
    prev = subject[0]
    chosen = select_person([stranger, subject], prev)
    assert chosen == 1, chosen
    first = select_person([stranger, subject], None)
    assert first == 0, first


def test_unswap_repairs_a_flipped_frame():
    frames = [person(200, 220) for _ in range(8)]
    frames[3] = person(200, 220, swap=True)
    xy, sc, valid = clip(frames)
    out, _, _, observed, info = repair_sequence(xy, sc, None, valid, 30)
    assert info['swaps'] == 1, info
    assert np.allclose(out[3, 5], out[2, 5], atol=1.5)
    assert np.all(observed)


def test_spike_is_removed_and_a_real_swing_stays():
    frames = [person(200, 220) for _ in range(10)]
    xy, sc, valid = clip(frames)
    xy[5, 9] = (xy[5, 9, 0] + 400, xy[5, 9, 1])
    out, _, _, _, info = repair_sequence(xy, sc, None, valid, 30)
    assert info['spikes'] >= 1
    assert abs(float(out[5, 9, 0]) - 200 + 60) < 5

    moving = []
    for i in range(10):
        xy_i, sc_i = person(200, 220)
        xy_i[9, 0] += i * 40
        moving.append((xy_i, sc_i))
    mxy, msc, mvalid = clip(moving)
    mout, _, _, _, minfo = repair_sequence(mxy, msc, None, mvalid, 30)
    assert minfo['spikes'] == 0, minfo
    assert float(mout[9, 9, 0]) > float(mout[0, 9, 0]) + 300


def test_short_gap_is_filled_and_a_cut_is_not_blended():
    frames = [person(200, 220) for _ in range(8)]
    xy, sc, valid = clip(frames)
    xy[3] = 0
    sc[3] = 0
    valid[3] = False
    out, _, _, observed, info = repair_sequence(xy, sc, None, valid, 30)
    assert info['gaps'] == 1
    assert abs(float(out[3, 0, 0]) - 200) < 2
    assert not observed[3]

    cut = [person(100, 220) for _ in range(4)] + [person(900, 220) for _ in range(4)]
    cxy, csc, cvalid = clip(cut)
    cxy[3] = 0
    csc[3] = 0
    cvalid[3] = False
    cout, _, _, _, _ = repair_sequence(cxy, csc, None, cvalid, 30)
    assert abs(float(cout[3, 11, 0]) - 450) > 80


def test_empty_clip_is_rejected():
    xy = np.zeros((12, 133, 2), np.float32)
    sc = np.zeros((12, 133), np.float32)
    valid = np.zeros(12, dtype=bool)
    _, _, _, observed, _ = repair_sequence(xy, sc, None, valid, 30)
    assert not enough_person(observed)
    assert not body_valid(xy[0], sc[0])


def test_normalize_and_bone_clamp_ignore_one_exploded_frame():
    t = 16
    xyz = np.zeros((t, 133, 3), np.float32)
    xyz[:, 11] = (-0.1, 0, 0)
    xyz[:, 12] = (0.1, 0, 0)
    xyz[:, 5] = (-0.2, 0.5, 0)
    xyz[:, 6] = (0.2, 0.5, 0)
    xyz[:, 0] = (0, 0.7, -0.1)
    xyz[:, 13] = (-0.1, -0.4, 0)
    xyz[:, 15] = (-0.1, -0.8, 0)
    xyz[:, 14] = (0.1, -0.4, 0)
    xyz[:, 16] = (0.1, -0.8, 0)
    xyz[7, 5, 1] = 8.0
    xyz[7, 6, 1] = 8.0
    xyz[4, 13] = (-0.1, -2.4, 0)
    valid = np.ones(t, dtype=bool)
    world = normalize_rtmw3d(xyz * 100, valid)
    torso = np.linalg.norm(
        0.5 * (world[:, 5] + world[:, 6]) - 0.5 * (world[:, 11] + world[:, 12]),
        axis=-1,
    )
    assert np.median(torso) < 0.7
    assert torso[7] < 1.2
    assert float(np.median(world[:, 0, 1])) < 0
    clamped = clamp_limb_lengths(world)
    femur = np.linalg.norm(clamped[:, 13] - clamped[:, 11], axis=-1)
    assert femur[4] < float(np.median(femur)) * 1.5
    repaired, spikes = repair_depth_spikes(world)
    assert repaired.shape == world.shape
    assert spikes >= 0


def test_weighted_smooth_ignores_a_zero_weight_spike():
    xyz = np.zeros((9, 2, 3), np.float32)
    xyz[4, 0, 0] = 10
    w = np.ones((9, 2), np.float32)
    w[4] = 0
    out = gaussian_smooth_weighted(xyz, 0.8, w)
    assert abs(float(out[3, 0, 0])) < 0.5
    assert abs(float(out[4, 0, 0])) < 0.5


def test_rotation_and_sampling():
    assert rotation_from_probe({'streams': [{'tags': {'rotate': '90'}}]}) == 90
    assert rotation_from_probe({'streams': [{'side_data_list': [{'rotation': -90}]}]}) == 270
    assert rotation_from_probe({'streams': [{}]}) == 0
    keep = sample_frame_indices([0, 16, 33, 50, 66, 100], 30, 10)
    assert keep[0] == 0
    assert 2 in keep
    assert 1 not in keep
    take, nxt = advance_sample(0, 0, 30)
    assert take and nxt > 30


if __name__ == '__main__':
    test_select_keeps_the_tracked_person()
    test_unswap_repairs_a_flipped_frame()
    test_spike_is_removed_and_a_real_swing_stays()
    test_short_gap_is_filled_and_a_cut_is_not_blended()
    test_empty_clip_is_rejected()
    test_normalize_and_bone_clamp_ignore_one_exploded_frame()
    test_weighted_smooth_ignores_a_zero_weight_spike()
    test_rotation_and_sampling()
    print('robust ok')

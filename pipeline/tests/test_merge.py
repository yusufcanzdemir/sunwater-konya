import numpy as np

from lib.merge import (
    boundary_pairs, edge_strength, merge_segments, relabel_connected, segment_means,
)


def _scene():
    """Two fields (left NDVI 0.8, right 0.3) split by a low-NDVI boundary column;
    each field is over-segmented into a top and a bottom superpixel."""
    h, w = 10, 21
    profiles = np.zeros((2, h, w))
    profiles[:, :, :10] = 0.8
    profiles[:, :, 11:] = 0.3
    profiles[:, :, 10] = 0.1  # boundary line
    labels = np.zeros((h, w), dtype=np.int32)
    labels[:5, :11] = 1
    labels[5:, :11] = 2
    labels[:5, 11:] = 3
    labels[5:, 11:] = 4
    return labels, profiles


def test_relabel_splits_disconnected_parts():
    labels = np.array([[1, 2, 1]], dtype=np.int32)
    out = relabel_connected(labels, np.ones_like(labels, bool))
    assert len(np.unique(out)) == 3


def test_merge_joins_pieces_but_not_fields():
    labels, profiles = _scene()
    edge = np.abs(np.gradient(profiles[0], axis=1))
    area, means = segment_means(labels, profiles)
    merged = merge_segments(labels, area, means, boundary_pairs(labels, edge),
                            max_profile_dist=0.2, max_edge=0.1)
    assert merged[0, 0] == merged[9, 0]          # top and bottom of left field joined
    assert merged[0, 15] == merged[9, 15]        # same for right field
    assert merged[0, 0] != merged[0, 15]         # fields stay apart
    assert len(np.unique(merged)) == 2


def test_strict_thresholds_merge_nothing():
    labels, profiles = _scene()
    edge = np.abs(np.gradient(profiles[0], axis=1))
    area, means = segment_means(labels, profiles)
    merged = merge_segments(labels, area, means, boundary_pairs(labels, edge),
                            max_profile_dist=0.0, max_edge=0.0)
    assert len(np.unique(merged)) == 4


def test_boundary_line_keeps_same_crop_fields_apart():
    labels, profiles = _scene()
    profiles[:, :, 11:] = 0.8  # same crop on both sides; only the boundary line separates them
    valid = np.ones(labels.shape, bool)
    edge = edge_strength(profiles, valid)
    area, means = segment_means(labels, profiles)
    merged = merge_segments(labels, area, means, boundary_pairs(labels, edge),
                            max_profile_dist=0.2, max_edge=0.1)
    assert merged[0, 0] == merged[9, 0]
    assert merged[0, 0] != merged[0, 15]

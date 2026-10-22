import pytest
from shapely.geometry import box

from lib.seg_metrics import confidence, evaluate


def test_perfect_match():
    ref = box(0, 0, 100, 100)
    m = evaluate([ref], [box(0, 0, 100, 100), box(100, 0, 200, 100)], 0.5)
    assert m["iou_mean"] == pytest.approx(1.0)
    assert m["over_segmented_share"] == 0
    assert m["under_segmented_share"] == 0


def test_over_segmentation_counts_pieces():
    ref = box(0, 0, 100, 100)
    halves = [box(0, 0, 50, 100), box(50, 0, 100, 100)]
    m = evaluate([ref], halves, 0.5)
    assert m["iou_mean"] == pytest.approx(0.5)
    assert m["segments_per_field_mean"] == 2
    assert m["over_segmented_share"] == 1


def test_under_segmentation_detects_spill():
    ref = box(0, 0, 100, 100)
    m = evaluate([ref], [box(0, 0, 200, 100)], 0.5)  # one segment covering two fields
    assert m["iou_mean"] == pytest.approx(0.5)
    assert m["under_segmented_share"] == 1
    # the segment is only half inside the reference, so it still counts as one piece
    assert m["segments_per_field_mean"] == 1


def test_empty_reference():
    assert evaluate([], [box(0, 0, 1, 1)], 0.5) == {"n_reference": 0}


def test_confidence_is_clamped():
    assert confidence(0.0, 0.3) == 1.0
    assert confidence(0.15, 0.3) == pytest.approx(0.5)
    assert confidence(0.6, 0.3) == 0.0


def test_raster_matches_vector_definitions():
    import numpy as np

    from lib.seg_metrics import evaluate_raster

    ref = np.zeros((4, 8), dtype=np.int32)
    ref[:, :4] = 1  # reference field = left half
    seg = np.ones((4, 8), dtype=np.int32)
    seg[:, 2:4] = 2  # field split in two pieces
    seg[:, 4:] = 3
    m = evaluate_raster(ref, [1], seg, 0.5)
    assert m["iou_mean"] == pytest.approx(0.5)
    assert m["segments_per_field_mean"] == 2
    assert m["over_segmented_share"] == 1

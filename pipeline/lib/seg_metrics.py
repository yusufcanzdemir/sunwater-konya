"""Segmentation quality against hand-drawn reference fields (metric CRS geometries)."""

from statistics import mean, median

from shapely import STRtree
from shapely.geometry.base import BaseGeometry


def match_reference(ref: BaseGeometry, segments: list[BaseGeometry], tree: STRtree,
                    overlap_share: float) -> dict:
    """Best-match IoU plus over/under-segmentation for one reference field.

    n_segments: segments with >= overlap_share of their area inside the reference
                (1 is ideal, more means the field is split = over-segmentation).
    best_outside: share of the best-matching segment lying outside the reference
                  (high means the segment spills into neighbours = under-segmentation).
    """
    best_iou, best_outside, n_segments = 0.0, 1.0, 0
    for i in tree.query(ref, predicate="intersects"):
        seg = segments[i]
        inter = ref.intersection(seg).area
        if seg.area and inter / seg.area >= overlap_share:
            n_segments += 1
        union = ref.union(seg).area
        iou = inter / union if union else 0.0
        if iou > best_iou:
            best_iou, best_outside = iou, 1 - inter / seg.area
    return {"iou": best_iou, "best_outside": best_outside, "n_segments": n_segments}


def evaluate(refs: list[BaseGeometry], segments: list[BaseGeometry],
             overlap_share: float) -> dict:
    tree = STRtree(segments)
    rows = [match_reference(r, segments, tree, overlap_share) for r in refs]
    if not rows:
        return {"n_reference": 0}
    ious = [r["iou"] for r in rows]
    return {
        "n_reference": len(rows),
        "iou_mean": mean(ious),
        "iou_median": median(ious),
        "share_iou_ge_0_5": sum(i >= 0.5 for i in ious) / len(ious),
        "share_iou_ge_0_7": sum(i >= 0.7 for i in ious) / len(ious),
        "over_segmented_share": sum(r["n_segments"] > 1 for r in rows) / len(rows),
        "segments_per_field_mean": mean(r["n_segments"] for r in rows),
        "under_segmented_share": sum(r["best_outside"] > 0.3 for r in rows) / len(rows),
    }


def confidence(dist: float, dist_max: float) -> float:
    return min(1.0, max(0.0, 1 - dist / dist_max))

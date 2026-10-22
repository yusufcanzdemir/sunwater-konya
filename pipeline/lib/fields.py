"""Turning segments into field polygons, and loading the hand-drawn reference fields."""

import geopandas as gpd
import numpy as np
from rasterio import features
from shapely.geometry import shape

from lib.config import PIPELINE_DIR
from lib.seg_metrics import confidence

METRIC_CRS = "EPSG:32636"


def to_fields(segments: gpd.GeoDataFrame, scfg: dict, method: str) -> gpd.GeoDataFrame:
    """Filter segments (columns crop, dist, geometry) into fields with stable ids."""
    metric = segments.to_crs(METRIC_CRS)
    fields = metric.assign(area_ha=metric.area / 1e4, crop_fraction=metric["crop"])
    fields = fields[
        (fields["area_ha"] >= scfg["min_area_ha"])
        & (fields["crop_fraction"] >= scfg["min_crop_fraction"])
    ].copy()
    fields["seg_confidence"] = [
        round(confidence(d, scfg["confidence_dist_max"]), 3) for d in fields["dist"]
    ]
    # Stable ids: north to south, then west to east
    c = fields.centroid
    fields = fields.assign(_y=-c.y.round(0), _x=c.x.round(0)).sort_values(["_y", "_x"])
    fields["field_id"] = [f"F{i + 1:05d}" for i in range(len(fields))]
    fields["method"] = method
    fields["area_ha"] = fields["area_ha"].round(3)
    fields["crop_fraction"] = fields["crop_fraction"].round(3)
    return fields[
        ["field_id", "area_ha", "seg_confidence", "crop_fraction", "method", "geometry"]
    ].to_crs("EPSG:4326")


def split_reference(ref: gpd.GeoDataFrame) -> tuple[gpd.GeoDataFrame, gpd.GeoDataFrame]:
    """(tune, test): odd point numbers tune, even numbers test (points are in random order)."""
    odd = ref["point_id"].str[1:].astype(int) % 2 == 1
    return ref[odd], ref[~odd]


def load_reference(cfg: dict) -> tuple[gpd.GeoDataFrame | None, dict]:
    """Drawn reference fields (EPSG:4326, with point_id) and counts of skipped points."""
    path = PIPELINE_DIR / cfg["reference"]["fields_file"]
    if not path.exists():
        return None, {"drawn": 0}
    ref = gpd.read_file(path)
    drawn = ref[(ref["status"] == "drawn") & ref.geometry.notna()]
    skipped = ref[ref["status"] == "skipped"]
    # The reason column only exists once at least one point has been skipped
    reasons = skipped["reason"].value_counts().to_dict() if "reason" in skipped else {}
    stats = {"drawn": len(drawn), "skipped": reasons}
    return drawn.set_crs("EPSG:4326", allow_override=True), stats


def rasterize_reference(ref: gpd.GeoDataFrame, shape_hw, transform) -> tuple[np.ndarray, dict]:
    ids = {pid: i + 1 for i, pid in enumerate(ref["point_id"])}
    raster = features.rasterize(
        ((geom, ids[pid]) for geom, pid in zip(ref.geometry, ref["point_id"])),
        out_shape=shape_hw, transform=transform, fill=0, dtype="int32",
    )
    return raster, ids


def vectorize_labels(labels: np.ndarray, transform, crs, stats: dict) -> gpd.GeoDataFrame:
    polys: dict[int, list] = {}
    for geom, value in features.shapes(labels, mask=labels > 0, transform=transform):
        polys.setdefault(int(value), []).append(shape(geom))
    rows = []
    for lab, parts in polys.items():
        geom = parts[0] if len(parts) == 1 else gpd.GeoSeries(parts).union_all()
        rows.append({"cluster": lab, "crop": float(stats["crop"][lab]),
                     "dist": float(stats["dist"][lab]), "geometry": geom})
    return gpd.GeoDataFrame(rows, crs=crs).to_crs("EPSG:4326")

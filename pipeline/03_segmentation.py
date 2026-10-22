"""Step 03: field segmentation (method A, SNIC) and quality against reference fields.

Usage: python 03_segmentation.py [--config config.yaml] [--force] [--wait]
For every trial in segmentation.trials:
  EE table asset segments_<trial>_<year>   SNIC segments with mean crop share and NDVI spread
  outputs/03_segmentation/segments_<trial>.parquet   downloaded segments (cache)
  outputs/03_segmentation/fields_<trial>.parquet     filtered fields (area, cropland share)
Quality: if reference/reference_fields.geojson has drawn fields, every trial is scored
(IoU, over/under-segmentation) into segmentation_report.{json,md} for KK2.
Once segmentation.selected_trial is set, writes outputs/03_segmentation/fields.geojson
(field_id, area_ha, seg_confidence, crop_fraction). Later steps prefer a hand-corrected
fields_corrected.geojson next to it when present.
"""

import argparse
import json
import sys

import geopandas as gpd

from lib.aoi import bbox_polygon
from lib.config import load_config, step_output_dir
from lib.ee_utils import (
    active_task_descriptions, asset_exists, asset_root, init_ee, wait_for_tasks,
)
from lib.fields import METRIC_CRS, load_reference, split_reference, to_fields
from lib.seg_metrics import evaluate


def trial_id(trial: dict) -> str:
    return f"snic_s{trial['size']}_c{str(trial['compactness']).replace('.', 'p')}"


def segment_vectors(ee, cfg: dict, pilot, trial: dict):
    ccfg, scfg = cfg["composites"], cfg["segmentation"]
    year = cfg["seasons"][ccfg["segmentation_season"]]
    bands = [f"NDVI_m{m:02d}" for m in ccfg["segmentation_months"]]
    ndvi = (
        ee.Image(f"{asset_root(cfg)}/seg_stack_{year}")
        .select(bands).divide(ccfg["index_scale"])
    )
    snic = ee.Algorithms.Image.Segmentation.SNIC(
        image=ndvi, size=trial["size"], compactness=trial["compactness"],
        connectivity=scfg["connectivity"],
        neighborhoodSize=scfg["neighborhood_factor"] * trial["size"],
    ).reproject(ccfg["export_crs"], None, ccfg["export_scale_m"])
    acfg = cfg["aoi"]
    crop = (
        ee.ImageCollection(acfg["worldcover_id"]).first()
        .eq(acfg["cropland_class"]).rename("crop")
    )
    dist = (
        ndvi.subtract(snic.select([f"{b}_mean" for b in bands]))
        .pow(2).reduce("mean").sqrt().rename("dist")
    )
    return snic.select("clusters").addBands(crop).addBands(dist).reduceToVectors(
        reducer=ee.Reducer.mean(), geometry=pilot, scale=ccfg["export_scale_m"],
        crs=ccfg["export_crs"], geometryType="polygon", eightConnected=False,
        labelProperty="cluster", maxPixels=1e10, tileScale=4,
    )


def submit(ee, cfg: dict, pilot, force: bool) -> tuple[dict[str, str], set[str]]:
    year = cfg["seasons"][cfg["composites"]["segmentation_season"]]
    running = active_task_descriptions(ee)
    assets, submitted = {}, set()
    for trial in cfg["segmentation"]["trials"]:
        tid = trial_id(trial)
        desc = f"segments_{tid}_{year}"
        asset_id = f"{asset_root(cfg)}/{desc}"
        assets[tid] = asset_id
        if desc in running:
            print(f"{desc}: task already running", file=sys.stderr)
            submitted.add(desc)
            continue
        if asset_exists(ee, asset_id):
            if not force:
                continue
            ee.data.deleteAsset(asset_id)
        ee.batch.Export.table.toAsset(
            collection=segment_vectors(ee, cfg, pilot, trial),
            description=desc, assetId=asset_id,
        ).start()
        print(f"{desc}: export task started", file=sys.stderr)
        submitted.add(desc)
    return assets, submitted


def load_segments(ee, asset_id: str, cache, force: bool) -> gpd.GeoDataFrame:
    if cache.exists() and not force:
        return gpd.read_parquet(cache)
    print(f"downloading {asset_id} ...", file=sys.stderr)
    gdf = ee.data.computeFeatures({
        "expression": ee.FeatureCollection(asset_id),
        "fileFormat": "GEOPANDAS_GEODATAFRAME",
    })
    gdf = gdf.set_crs("EPSG:4326", allow_override=True)[["cluster", "crop", "dist", "geometry"]]
    gdf.to_parquet(cache)
    return gdf





def render_report_md(report: dict) -> str:
    ref = report["reference"]
    lines = [
        f"Reference fields drawn: {ref['drawn']}; skipped: {ref.get('skipped', {})}",
        "",
        "| Trial | Segments | Fields | Median field ha | Mean IoU | Median IoU | IoU>=0.5 "
        "| IoU>=0.7 | Over-segmented | Pieces/field | Under-segmented |",
        "|---|---|---|---|---|---|---|---|---|---|---|",
    ]
    for tid, t in report["trials"].items():
        q = t.get("quality", {})
        if q.get("n_reference"):
            qcols = (f"{q['iou_mean']:.2f} | {q['iou_median']:.2f} | {q['share_iou_ge_0_5']:.0%} "
                     f"| {q['share_iou_ge_0_7']:.0%} | {q['over_segmented_share']:.0%} "
                     f"| {q['segments_per_field_mean']:.1f} | {q['under_segmented_share']:.0%}")
        else:
            qcols = " | ".join(["–"] * 7)
        lines.append(f"| {tid} | {t['n_segments']} | {t['n_fields']} "
                     f"| {t['median_field_ha']:.1f} | {qcols} |")
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true", help="re-export and re-download")
    parser.add_argument("--wait", action="store_true", help="wait for export tasks")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    scfg = cfg["segmentation"]
    ee = init_ee(cfg)
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)

    assets, submitted = submit(ee, cfg, pilot, args.force)
    if submitted and args.wait:
        states = wait_for_tasks(ee, submitted)
        failed = {d: s for d, s in states.items() if s != "COMPLETED"}
        if failed:
            print(f"export tasks not completed: {failed}", file=sys.stderr)
            return 1
    missing = [t for t, a in assets.items() if not asset_exists(ee, a)]
    if missing:
        print(f"segments not ready: {', '.join(missing)}; re-run later (or use --wait)",
              file=sys.stderr)
        return 0

    out_dir = step_output_dir(cfg, "03_segmentation")
    ref, ref_stats = load_reference(cfg)
    ref_metric = list(ref.to_crs(METRIC_CRS).geometry) if ref is not None else []
    # Held-out half, comparable with tuned methods (03b); SNIC trials are not tuned on it
    test_metric = (list(split_reference(ref)[1].to_crs(METRIC_CRS).geometry)
                   if ref is not None else [])
    report = {"reference": ref_stats, "trials": {}}
    all_fields = {}
    for tid, asset_id in assets.items():
        segments = load_segments(ee, asset_id, out_dir / f"segments_{tid}.parquet", args.force)
        fields = to_fields(segments, scfg, tid)
        fields.to_parquet(out_dir / f"fields_{tid}.parquet")
        all_fields[tid] = fields
        entry = {
            "n_segments": len(segments),
            "n_fields": len(fields),
            "median_field_ha": float(fields["area_ha"].median()),
            "field_area_km2": round(float(fields["area_ha"].sum()) / 100, 1),
        }
        if ref_metric:
            # Score against all segments, not only kept fields, so filtering can't hide errors
            seg_metric = list(segments.to_crs(METRIC_CRS).geometry)
            entry["quality"] = evaluate(ref_metric, seg_metric, scfg["overlap_share"])
            entry["quality_test"] = evaluate(test_metric, seg_metric, scfg["overlap_share"])
        report["trials"][tid] = entry

    (out_dir / "segmentation_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    md = render_report_md(report)
    (out_dir / "segmentation_report.md").write_text(md, encoding="utf-8")
    print(md)

    selected = scfg.get("selected_trial")
    if selected:
        # Methods from 03b/03c leave their fields as fields_<id>.parquet
        extra = out_dir / f"fields_{selected}.parquet"
        if selected not in all_fields and not extra.exists():
            print(f"selected_trial {selected!r}: no fields found (run its step first)",
                  file=sys.stderr)
            return 1
        fields = all_fields[selected] if selected in all_fields else gpd.read_parquet(extra)
        fields.to_file(out_dir / "fields.geojson", driver="GeoJSON")
        print(f"wrote fields.geojson from {selected}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

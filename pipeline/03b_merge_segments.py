"""Step 03b (KK2 option 2): merge small SNIC superpixels into fields, tuned on reference.

Usage: python 03b_merge_segments.py [--config config.yaml] [--force-download]
1. Downloads SNIC labels (segmentation.merge.base_trial), monthly NDVI and the cropland
   mask on a 10 m UTM grid (cached as outputs/03_segmentation/merge_inputs_<year>.tif).
2. Grid-searches the two merge thresholds on the tuning half of the reference fields.
3. Scores the best setting on the held-out test half and writes
   segments_snic_s<size>_merge.parquet, fields_snic_s<size>_merge.parquet, merge_report.{json,md}.
"""

import argparse
import json
import sys

import numpy as np
import rasterio

from lib.aoi import bbox_polygon
from lib.config import load_config, step_output_dir
from lib.ee_download import grid_for_bbox, download_grid
from lib.ee_utils import asset_root, init_ee
from lib.fields import (
    load_reference, rasterize_reference, split_reference, to_fields, vectorize_labels,
)
from lib.merge import (
    boundary_pairs, edge_strength, label_stats, merge_segments, relabel_connected,
    segment_means,
)
from lib.seg_metrics import evaluate_raster


def download_inputs(ee, cfg: dict, path) -> None:
    ccfg, acfg = cfg["composites"], cfg["aoi"]
    base = cfg["segmentation"]["merge"]["base_trial"]
    year = cfg["seasons"][ccfg["segmentation_season"]]
    bands = [f"NDVI_m{m:02d}" for m in ccfg["segmentation_months"]]
    stack = ee.Image(f"{asset_root(cfg)}/seg_stack_{year}").select(bands)
    snic = ee.Algorithms.Image.Segmentation.SNIC(
        image=stack.divide(ccfg["index_scale"]), size=base["size"],
        compactness=base["compactness"], connectivity=cfg["segmentation"]["connectivity"],
        neighborhoodSize=cfg["segmentation"]["neighborhood_factor"] * base["size"],
    ).reproject(ccfg["export_crs"], None, ccfg["export_scale_m"])
    crop = ee.ImageCollection(acfg["worldcover_id"]).first().eq(acfg["cropland_class"])
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)
    valid = stack.select(0).mask().gt(0).clip(pilot).unmask(0)
    image = ee.Image.cat([
        snic.select("clusters").unmask(0).rename("clusters"),
        stack.unmask(0), crop.unmask(0).rename("crop"), valid.rename("valid"),
    ])
    grid = grid_for_bbox(cfg["pilot_bbox"], ccfg["export_crs"], ccfg["export_scale_m"])
    print(f"downloading {grid.width}x{grid.height} px ...", file=sys.stderr)
    download_grid(ee, image, grid, path)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force-download", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    scfg, mcfg = cfg["segmentation"], cfg["segmentation"]["merge"]
    year = cfg["seasons"][cfg["composites"]["segmentation_season"]]
    out_dir = step_output_dir(cfg, "03_segmentation")
    inputs = out_dir / f"merge_inputs_{year}.tif"
    if not inputs.exists() or args.force_download:
        download_inputs(init_ee(cfg), cfg, inputs)

    with rasterio.open(inputs) as src:
        data, transform, crs = src.read(), src.transform, src.crs
    valid = data[-1] == 1
    crop = data[-2]
    profiles = data[1:-2].astype(np.float32) / cfg["composites"]["index_scale"]
    labels = relabel_connected(data[0], valid & (data[0] != 0))

    ref, ref_stats = load_reference(cfg)
    if ref is None or not len(ref):
        print("no reference fields drawn yet", file=sys.stderr)
        return 1
    ref = ref.to_crs(crs)
    ref_raster, ids = rasterize_reference(ref, labels.shape, transform)
    tune, test = split_reference(ref)
    tune_ids = [ids[p] for p in tune["point_id"]]
    test_ids = [ids[p] for p in test["point_id"]]
    share = scfg["overlap_share"]

    def score(lab: np.ndarray) -> dict:
        return {
            "tune": evaluate_raster(ref_raster, tune_ids, lab, share),
            "test": evaluate_raster(ref_raster, test_ids, lab, share),
            "all": evaluate_raster(ref_raster, tune_ids + test_ids, lab, share),
        }

    print("scoring unmerged superpixels ...", file=sys.stderr)
    baseline = score(labels)
    edge = edge_strength(profiles, valid)
    area, means = segment_means(labels, profiles)
    pairs = boundary_pairs(labels, edge)
    border_means = np.array([s / c for s, c in pairs.values()])
    edge_grid = {q: float(np.quantile(border_means, q)) for q in mcfg["edge_quantile_grid"]}

    grid_rows = []
    best = None
    for pd in mcfg["profile_dist_grid"]:
        for q, e in edge_grid.items():
            merged = merge_segments(labels, area, means, pairs, pd, e)
            t = evaluate_raster(ref_raster, tune_ids, merged, share)
            row = {"max_profile_dist": pd, "edge_quantile": q, "max_edge": round(e, 5),
                   "n_segments": int(merged.max()), "tune_iou_mean": t["iou_mean"]}
            grid_rows.append(row)
            print(f"  pd={pd} q={q}: tune IoU {t['iou_mean']:.3f}, {row['n_segments']} segments",
                  file=sys.stderr)
            if best is None or t["iou_mean"] > best[0]["tune_iou_mean"]:
                best = (row, merged)

    best_row, merged = best
    tid = f"snic_s{mcfg['base_trial']['size']}_merge"
    stats = label_stats(merged, profiles, crop)
    segments = vectorize_labels(merged, transform, crs, stats)
    segments.to_parquet(out_dir / f"segments_{tid}.parquet")
    fields = to_fields(segments, scfg, tid)
    fields.to_parquet(out_dir / f"fields_{tid}.parquet")

    report = {
        "reference": {**ref_stats, "tune": len(tune_ids), "test": len(test_ids)},
        "unmerged": baseline,
        "selected": best_row,
        "merged": score(merged),
        "n_segments": len(segments),
        "n_fields": len(fields),
        "median_field_ha": float(fields["area_ha"].median()),
        "grid": grid_rows,
    }
    (out_dir / "merge_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = [
        f"Selected: max_profile_dist={best_row['max_profile_dist']}, "
        f"edge quantile {best_row['edge_quantile']} (max_edge={best_row['max_edge']})",
        f"Segments {len(segments)}, fields {len(fields)}, median field "
        f"{report['median_field_ha']:.1f} ha", "",
        "| Labels | Split | Mean IoU | Median IoU | IoU>=0.5 | IoU>=0.7 | Over-seg | Under-seg |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for name, res in (("unmerged", baseline), ("merged", report["merged"])):
        for split in ("tune", "test", "all"):
            q = res[split]
            lines.append(
                f"| {name} | {split} ({q['n_reference']}) | {q['iou_mean']:.2f} "
                f"| {q['iou_median']:.2f} | {q['share_iou_ge_0_5']:.0%} | {q['share_iou_ge_0_7']:.0%} "
                f"| {q['over_segmented_share']:.0%} | {q['under_segmented_share']:.0%} |"
            )
    md = "\n".join(lines) + "\n"
    (out_dir / "merge_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

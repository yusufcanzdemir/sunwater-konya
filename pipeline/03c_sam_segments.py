"""Step 03c (method B): Segment Anything on the 10 m pilot image, scored on reference.

Usage: uv run --extra sam python 03c_sam_segments.py [--config config.yaml]
Needs outputs/03_segmentation/merge_inputs_<year>.tif from 03b (NDVI, cropland, valid mask)
and downloads the July RGB on the same grid (sam_rgb_<year>.tif). For every input in
segmentation.sam.inputs: tiled automatic mask generation -> label raster (cached as
sam_labels_<input>.tif). The input with the best tuning-half IoU is scored on the test
half and written as segments_/fields_sam_<input>.parquet plus sam_report.{json,md}.
"""

import argparse
import json
import sys

import numpy as np
import rasterio

from lib.config import PIPELINE_DIR, load_config, step_output_dir
from lib.ee_download import download_grid, grid_for_bbox
from lib.ee_utils import asset_root, init_ee
from lib.fields import (
    load_reference, rasterize_reference, split_reference, to_fields, vectorize_labels,
)
from lib.merge import label_stats, relabel_connected
from lib.seg_metrics import evaluate_raster
from lib.tiles import make_tiles


def to_uint8(bands: np.ndarray, lo: float, hi: float) -> np.ndarray:
    """(3, H, W) -> (H, W, 3) uint8 with linear stretch lo..hi."""
    scaled = np.clip((bands.astype(np.float32) - lo) / (hi - lo), 0, 1) * 255
    return np.moveaxis(scaled.astype(np.uint8), 0, -1)


def load_generator(scfg: dict):
    import torch
    from segment_anything import SamAutomaticMaskGenerator, sam_model_registry

    sam = sam_model_registry[scfg["model_type"]](
        checkpoint=str(PIPELINE_DIR / scfg["checkpoint"])
    ).to("cuda" if torch.cuda.is_available() else "cpu")
    return SamAutomaticMaskGenerator(sam, **scfg["generator"])


def sam_labels(generator, image: np.ndarray, tile_px: int, overlap_px: int) -> np.ndarray:
    """Label raster from tiled SAM masks; each mask is taken whole from the tile whose
    core contains its centroid, so fields crossing tile seams are not cut."""
    h, w = image.shape[:2]
    masks = []
    tiles = make_tiles(h, w, tile_px, overlap_px)
    for i, t in enumerate(tiles):
        out = generator.generate(image[t.row:t.row + t.height, t.col:t.col + t.width])
        for m in out:
            seg = m["segmentation"]
            rr, cc = np.nonzero(seg)
            if t.core_contains(t.row + rr.mean(), t.col + cc.mean()):
                masks.append((int(seg.sum()), t.row, t.col, seg))
        print(f"  tile {i + 1}/{len(tiles)}: {len(out)} masks", file=sys.stderr)
    labels = np.zeros((h, w), dtype=np.int32)
    # Large masks first, so smaller (more specific) masks end up on top
    for k, (_, r, c, seg) in enumerate(sorted(masks, key=lambda x: -x[0]), start=1):
        view = labels[r:r + seg.shape[0], c:c + seg.shape[1]]
        view[seg] = k
    return labels


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    ccfg, scfg = cfg["composites"], cfg["segmentation"]
    sam_cfg = scfg["sam"]
    year = cfg["seasons"][ccfg["segmentation_season"]]
    out_dir = step_output_dir(cfg, "03_segmentation")

    inputs_path = out_dir / f"merge_inputs_{year}.tif"
    if not inputs_path.exists():
        print("run 03b_merge_segments.py first (it downloads the shared inputs)", file=sys.stderr)
        return 1
    with rasterio.open(inputs_path) as src:
        data, transform, crs, desc = src.read(), src.transform, src.crs, src.descriptions
    band = {name: i for i, name in enumerate(desc)}
    valid = data[band["valid"]] == 1
    crop = data[band["crop"]]
    months = [f"NDVI_m{m:02d}" for m in ccfg["segmentation_months"]]
    profiles = data[[band[m] for m in months]].astype(np.float32) / ccfg["index_scale"]

    rgb_path = out_dir / f"sam_rgb_{year}.tif"
    if "rgb" in sam_cfg["inputs"] and not rgb_path.exists():
        ee = init_ee(cfg)
        grid = grid_for_bbox(cfg["pilot_bbox"], ccfg["export_crs"], ccfg["export_scale_m"])
        rgb = ee.Image(f"{asset_root(cfg)}/seg_stack_{year}").select(["B4", "B3", "B2"]).unmask(0)
        download_grid(ee, rgb, grid, rgb_path)

    images = {}
    if "ndvi_false_color" in sam_cfg["inputs"]:
        fc = data[[band["NDVI_m05"], band["NDVI_m07"], band["NDVI_m08"]]] / ccfg["index_scale"]
        images["ndvi_false_color"] = to_uint8(fc, 0.1, 0.85)
    if "rgb" in sam_cfg["inputs"]:
        with rasterio.open(rgb_path) as src:
            images["rgb"] = to_uint8(src.read(), 0, 3000)

    ref, ref_stats = load_reference(cfg)
    ref = ref.to_crs(crs)
    ref_raster, ids = rasterize_reference(ref, valid.shape, transform)
    tune, test = split_reference(ref)
    tune_ids = [ids[p] for p in tune["point_id"]]
    test_ids = [ids[p] for p in test["point_id"]]
    share = scfg["overlap_share"]

    generator = None
    results = {}
    for name, image in images.items():
        cache = out_dir / f"sam_labels_{name}.tif"
        if cache.exists():
            with rasterio.open(cache) as src:
                labels = src.read(1)
        else:
            generator = generator or load_generator(sam_cfg)
            print(f"SAM on {name} ...", file=sys.stderr)
            raw = sam_labels(generator, image, sam_cfg["tile_px"], sam_cfg["overlap_px"])
            labels = relabel_connected(raw, valid & (raw > 0))
            with rasterio.open(cache, "w", driver="GTiff", width=labels.shape[1],
                               height=labels.shape[0], count=1, dtype="int32", crs=crs,
                               transform=transform, compress="deflate") as dst:
                dst.write(labels, 1)
        results[name] = {
            "labels": labels,
            "tune": evaluate_raster(ref_raster, tune_ids, labels, share),
            "test": evaluate_raster(ref_raster, test_ids, labels, share),
            "all": evaluate_raster(ref_raster, tune_ids + test_ids, labels, share),
            "coverage": float((labels[valid & (crop == 1)] > 0).mean()),
        }
        print(f"{name}: tune IoU {results[name]['tune']['iou_mean']:.3f}", file=sys.stderr)

    best = max(results, key=lambda n: results[n]["tune"]["iou_mean"])
    labels = results[best]["labels"]
    tid = f"sam_{best}"
    segments = vectorize_labels(labels, transform, crs, label_stats(labels, profiles, crop))
    segments.to_parquet(out_dir / f"segments_{tid}.parquet")
    fields = to_fields(segments, scfg, tid)
    fields.to_parquet(out_dir / f"fields_{tid}.parquet")

    report = {
        "reference": {**ref_stats, "tune": len(tune_ids), "test": len(test_ids)},
        "selected_input": best,
        "inputs": {n: {k: v for k, v in r.items() if k != "labels"} for n, r in results.items()},
        "n_segments": len(segments),
        "n_fields": len(fields),
        "median_field_ha": float(fields["area_ha"].median()),
    }
    (out_dir / "sam_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = [
        f"Selected input: {best}; segments {len(segments)}, fields {len(fields)}, "
        f"median field {report['median_field_ha']:.1f} ha", "",
        "| Input | Split | Mean IoU | Median IoU | IoU>=0.5 | IoU>=0.7 | Over-seg | Under-seg "
        "| Cropland covered |",
        "|---|---|---|---|---|---|---|---|---|",
    ]
    for name, r in results.items():
        for split in ("tune", "test", "all"):
            q = r[split]
            lines.append(
                f"| {name} | {split} ({q['n_reference']}) | {q['iou_mean']:.2f} "
                f"| {q['iou_median']:.2f} | {q['share_iou_ge_0_5']:.0%} | {q['share_iou_ge_0_7']:.0%} "
                f"| {q['over_segmented_share']:.0%} | {q['under_segmented_share']:.0%} "
                f"| {r['coverage']:.0%} |"
            )
    md = "\n".join(lines) + "\n"
    (out_dir / "sam_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

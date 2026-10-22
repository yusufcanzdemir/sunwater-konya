"""Step 02: cloud-masked Sentinel-2 dekadal NDVI/EVI/NDMI composites and segmentation stack.

Usage: python 02_composites.py [--config config.yaml] [--force] [--wait]
Earth Engine assets (under the configured asset folder):
  s2_dekadal_<year>  int16 bands <INDEX>_dNN (index x scale) and GAP_dNN (gap codes)
  seg_stack_<year>   int16 bands NDVI_mMM (monthly median, x scale) + B4, B3, B2
Local outputs (outputs/02_composites/): composites_report.{json,md}, preview PNGs.
Existing assets and running tasks are not resubmitted unless --force. The report is
written once all assets exist (use --wait to block until the export tasks finish).
"""

import argparse
import json
import sys

from lib import s2
from lib.aoi import bbox_polygon
from lib.config import load_config, step_output_dir
from lib.ee_utils import (
    active_task_descriptions, asset_exists, asset_root, download_thumbnail, ensure_folder,
    init_ee, outline, wait_for_tasks,
)
from lib.periods import dekad_labels, dekads

GAP_NAMES = {
    s2.OBSERVED: "observed",
    s2.INTERPOLATED: "interpolated",
    s2.EDGE_FILLED: "edge_filled",
    s2.NO_DATA: "no_data",
}
NDVI_PALETTE = ["8c510a", "d8b365", "f6e8c3", "c7eae5", "5ab4ac", "01665e"]


def season_years(cfg: dict) -> list[int]:
    return [cfg["seasons"]["main"], cfg["seasons"]["comparison"]]


def build_exports(ee, cfg: dict, pilot) -> dict[str, tuple[str, object]]:
    """{task description: (asset id, image)} for every asset of this step."""
    ccfg, scfg = cfg["composites"], cfg["seasons"]
    root = asset_root(cfg)
    seg_year = scfg[ccfg["segmentation_season"]]
    exports = {}
    for year in season_years(cfg):
        periods = dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])
        clear = s2.clear_collection(
            ee, pilot, periods[0][0].isoformat(), periods[-1][1].isoformat(), ccfg
        )
        indexed = clear.map(lambda img: s2.add_indices(ee, img))
        filled, codes = s2.gap_fill(ee, s2.dekad_medians(ee, indexed, periods))
        stack = s2.dekadal_stack(
            ee, filled, codes, dekad_labels(len(periods)), ccfg["index_scale"]
        ).set({
            "season": year,
            "dekad_starts": ",".join(s.isoformat() for s, _ in periods),
            "index_scale": ccfg["index_scale"],
            "clear_threshold": ccfg["clear_threshold"],
        })
        exports[f"s2_dekadal_{year}"] = (f"{root}/s2_dekadal_{year}", stack)
        if year == seg_year:
            seg = s2.segmentation_stack(
                ee, filled, periods, clear, ccfg["segmentation_months"],
                ccfg["segmentation_rgb_month"], year, ccfg["index_scale"],
            ).set({"season": year, "index_scale": ccfg["index_scale"]})
            exports[f"seg_stack_{year}"] = (f"{root}/seg_stack_{year}", seg)
    return exports


def submit(ee, cfg: dict, pilot, exports: dict, force: bool) -> set[str]:
    ccfg = cfg["composites"]
    running = active_task_descriptions(ee)
    submitted = set()
    for desc, (asset_id, image) in exports.items():
        if desc in running:
            print(f"{desc}: task already running", file=sys.stderr)
            submitted.add(desc)
            continue
        if asset_exists(ee, asset_id):
            if not force:
                print(f"{desc}: asset exists, skipping", file=sys.stderr)
                continue
            ee.data.deleteAsset(asset_id)
        task = ee.batch.Export.image.toAsset(
            image=image.clip(pilot), description=desc, assetId=asset_id, region=pilot,
            scale=ccfg["export_scale_m"], crs=ccfg["export_crs"], maxPixels=1e10,
            pyramidingPolicy={".default": "mean"},
        )
        task.start()
        print(f"{desc}: export task started", file=sys.stderr)
        submitted.add(desc)
    return submitted


def gap_report(ee, cfg: dict, pilot, year: int) -> list[dict]:
    """Share of cropland pixels per gap code for every dekad."""
    acfg, scfg = cfg["aoi"], cfg["seasons"]
    periods = dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])
    labels = dekad_labels(len(periods))
    cropland = ee.ImageCollection(acfg["worldcover_id"]).first().eq(acfg["cropland_class"])
    gaps = (
        ee.Image(f"{asset_root(cfg)}/s2_dekadal_{year}")
        .select([f"GAP_{lab}" for lab in labels])
        .updateMask(cropland)
    )
    hist = gaps.reduceRegion(
        reducer=ee.Reducer.frequencyHistogram(), geometry=pilot,
        scale=cfg["composites"]["gap_stats_scale_m"], maxPixels=1e10, tileScale=4,
    ).getInfo()
    rows = []
    for lab, (start, end) in zip(labels, periods):
        counts = {int(float(k)): v for k, v in hist[f"GAP_{lab}"].items()}
        total = sum(counts.values()) or 1
        rows.append({
            "dekad": lab, "start": start.isoformat(), "end": end.isoformat(),
            **{name: round(counts.get(code, 0) / total, 4) for code, name in GAP_NAMES.items()},
        })
    return rows


def render_report_md(report: dict) -> str:
    lines = []
    for year, rows in report["gap_share_cropland"].items():
        filled = [1 - r["observed"] for r in rows]
        lines += [
            f"## Season {year}",
            f"Mean share of cropland pixels without a clear observation per dekad: "
            f"{sum(filled) / len(filled):.1%}",
            "",
            "| Dekad | Period | Observed | Interpolated | Edge-filled | No data |",
            "|---|---|---|---|---|---|",
        ]
        lines += [
            f"| {r['dekad']} | {r['start']}..{r['end']} | {r['observed']:.1%} "
            f"| {r['interpolated']:.1%} | {r['edge_filled']:.1%} | {r['no_data']:.1%} |"
            for r in rows
        ]
        lines.append("")
    return "\n".join(lines)


def write_previews(ee, cfg: dict, pilot, out_dir) -> list[str]:
    scfg, ccfg = cfg["seasons"], cfg["composites"]
    year = scfg["main"]
    scale = ccfg["index_scale"]
    root = asset_root(cfg)
    view = pilot.buffer(1000).bounds(maxError=10)
    border = outline(ee, pilot, "FF2020", 2)
    periods = dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])
    labels = dekad_labels(len(periods))
    dekadal = ee.Image(f"{root}/s2_dekadal_{year}")
    written = []
    for lab, (start, _) in zip(labels, periods):
        if start.day == 11 and start.month in (5, 7, 9):  # mid-May, mid-July, mid-September
            name = f"ndvi_{start.isoformat()}.png"
            img = dekadal.select(f"NDVI_{lab}").divide(scale).visualize(
                min=0, max=0.9, palette=NDVI_PALETTE
            )
            download_thumbnail(ee.ImageCollection([img, border]).mosaic(), view, out_dir / name)
            written.append(name)
    seg_year = scfg[ccfg["segmentation_season"]]
    seg = ee.Image(f"{root}/seg_stack_{seg_year}")
    for name, img in {
        f"seg_rgb_{seg_year}.png": seg.select(["B4", "B3", "B2"]).visualize(
            min=0, max=3000, gamma=1.2
        ),
        f"seg_ndvi_may_jul_aug_{seg_year}.png": seg.select(
            ["NDVI_m05", "NDVI_m07", "NDVI_m08"]
        ).divide(scale).visualize(min=0.1, max=0.85),
    }.items():
        download_thumbnail(ee.ImageCollection([img, border]).mosaic(), view, out_dir / name)
        written.append(name)
    return written


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true", help="delete and re-export assets")
    parser.add_argument("--wait", action="store_true", help="wait for export tasks")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    ee = init_ee(cfg)
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)
    ensure_folder(ee, asset_root(cfg))

    exports = build_exports(ee, cfg, pilot)
    submitted = submit(ee, cfg, pilot, exports, args.force)
    if submitted and args.wait:
        states = wait_for_tasks(ee, submitted)
        failed = {d: s for d, s in states.items() if s != "COMPLETED"}
        if failed:
            print(f"export tasks not completed: {failed}", file=sys.stderr)
            return 1

    missing = [d for d, (asset_id, _) in exports.items() if not asset_exists(ee, asset_id)]
    if missing:
        print(f"assets not ready yet: {', '.join(missing)}; re-run when tasks finish "
              "(or use --wait)", file=sys.stderr)
        return 0

    print("computing gap statistics and previews ...", file=sys.stderr)
    out_dir = step_output_dir(cfg, "02_composites")
    report = {
        "assets": {d: a for d, (a, _) in exports.items()},
        "clear_threshold": cfg["composites"]["clear_threshold"],
        "gap_share_cropland": {
            str(y): gap_report(ee, cfg, pilot, y) for y in season_years(cfg)
        },
        "previews": write_previews(ee, cfg, pilot, out_dir),
    }
    (out_dir / "composites_report.json").write_text(
        json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    md = render_report_md(report)
    (out_dir / "composites_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

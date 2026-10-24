"""Step 04 (data): inputs for the /label web tool.

Usage: python 04_label_data.py [--config config.yaml] [--force]
Reads outputs/03_segmentation/fields.geojson (or fields_corrected.geojson when present).
Outputs:
  outputs/04_labels/label_meta.json           classes and targets from config (for the tool)
  outputs/04_labels/fields_web.geojson        simplified field polygons for the map
  outputs/04_labels/field_series_<year>.json  per-field median NDVI/NDMI per dekad
  outputs/04_labels/rgb_<year>_mMM.jpg + overlays.json   monthly RGB previews (Web Mercator)
  04_labels/label_order.json                  random labelling order (committed, kept stable)
"""

import argparse
import json
import random
import sys

import geopandas as gpd

from lib.aoi import bbox_polygon
from lib.config import PIPELINE_DIR, load_config, step_output_dir
from lib.ee_utils import asset_root, download_thumbnail, init_ee
from lib.field_stats import reduce_fields
from lib.fields import load_fields, simplified
from lib.periods import dekad_labels, dekads
from lib import s2

SERIES_INDICES = ["NDVI", "NDMI"]


def field_series(ee, cfg: dict, fields: gpd.GeoDataFrame, year: int) -> dict:
    lcfg, scfg = cfg["labels"], cfg["seasons"]
    labels = dekad_labels(len(dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])))
    bands = [f"{idx}_{lab}" for idx in SERIES_INDICES for lab in labels]
    image = ee.Image(f"{asset_root(cfg)}/s2_dekadal_{year}").select(bands)
    scale = cfg["composites"]["index_scale"]
    stats = reduce_fields(ee, image, fields, ee.Reducer.median(),
                          cfg["composites"]["export_scale_m"], cfg["composites"]["export_crs"],
                          lcfg["chunk_size"])
    out = {
        fid: {
            idx.lower(): [
                None if p.get(f"{idx}_{lab}") is None else round(p[f"{idx}_{lab}"] / scale, 3)
                for lab in labels
            ]
            for idx in SERIES_INDICES
        }
        for fid, p in stats.items()
    }
    return {"dekad_starts": [s.isoformat() for s, _ in dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])],
            "fields": out}


def write_rgb_overlays(ee, cfg: dict, year: int, out_dir) -> list[dict]:
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)
    w, s, e, n = cfg["pilot_bbox"]
    clear = s2.clear_collection(ee, pilot, f"{year}-01-01", f"{year + 1}-01-01", cfg["composites"])
    month_names = {4: "Nisan", 5: "Mayıs", 6: "Haziran", 7: "Temmuz", 8: "Ağustos",
                   9: "Eylül", 10: "Ekim"}
    meta = []
    for m in cfg["labels"]["rgb_months"]:
        file = f"rgb_{year}_m{m:02d}.jpg"
        start = ee.Date.fromYMD(year, m, 1)
        img = (clear.filterDate(start, start.advance(1, "month")).median()
               .visualize(bands=["B4", "B3", "B2"], min=0, max=3000, gamma=1.2))
        print(f"rendering {file} ...", file=sys.stderr)
        download_thumbnail(img, pilot, out_dir / file, dimensions=cfg["reference"]["overlay_max_px"],
                           crs="EPSG:3857", fmt="jpg")
        meta.append({"id": f"rgb_m{m:02d}", "label": f"{month_names.get(m, m)} {year}",
                     "file": file, "bounds": [[s, w], [n, e]]})
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true", help="recompute series and overlays")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    lcfg = cfg["labels"]
    year = cfg["seasons"][lcfg["season"]]
    out_dir = step_output_dir(cfg, "04_labels")
    fields = load_fields(cfg)
    web = simplified(fields, lcfg["simplify_m"])

    (out_dir / "label_meta.json").write_text(json.dumps({
        "season": year,
        "classes": lcfg["classes"],
        "min_per_class": lcfg["min_per_class"],
        "target_total": lcfg["target_total"],
    }, indent=2, ensure_ascii=False), encoding="utf-8")
    (out_dir / "fields_web.geojson").write_text(
        web[["field_id", "area_ha", "seg_confidence", "geometry"]].to_json(drop_id=True),
        encoding="utf-8",
    )

    order_path = PIPELINE_DIR / lcfg["order_file"]
    if order_path.exists():
        order = json.loads(order_path.read_text(encoding="utf-8"))
        missing = set(fields["field_id"]) - set(order["field_ids"])
        if missing:
            print(f"warning: {len(missing)} fields are not in {order_path.name} "
                  "(fields changed since the order was drawn)", file=sys.stderr)
    else:
        ids = sorted(fields["field_id"])
        random.Random(lcfg["seed"]).shuffle(ids)
        order_path.parent.mkdir(parents=True, exist_ok=True)
        order_path.write_text(json.dumps({"seed": lcfg["seed"], "field_ids": ids}, indent=1),
                              encoding="utf-8")

    series_path = out_dir / f"field_series_{year}.json"
    overlays_path = out_dir / "overlays.json"
    if series_path.exists() and overlays_path.exists() and not args.force:
        print("series and overlays cached; use --force to recompute", file=sys.stderr)
        return 0
    ee = init_ee(cfg)
    series = field_series(ee, cfg, web, year)
    series_path.write_text(json.dumps(series, separators=(",", ":")), encoding="utf-8")
    meta = write_rgb_overlays(ee, cfg, year, out_dir)
    overlays_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"{len(series['fields'])} field series, {len(meta)} overlays", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

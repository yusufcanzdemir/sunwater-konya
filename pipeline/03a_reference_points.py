"""Step 03a: random cropland points and 2025 image overlays for hand-drawn reference fields.

Usage: python 03a_reference_points.py [--config config.yaml] [--force-points]
Outputs:
  reference/reference_points.geojson   committed; never overwritten without --force-points,
                                       because drawn reference fields refer to its point ids
  outputs/03_reference/*.png + overlays.json   Web Mercator overlays of the pilot area
The web tool (/reference, `npm run dev`) reads these and writes reference_fields.geojson.
"""

import argparse
import json
import sys

from lib.aoi import bbox_polygon
from lib.config import PIPELINE_DIR, load_config, step_output_dir
from lib.ee_utils import asset_root, download_thumbnail, init_ee


def sample_points(ee, cfg: dict, pilot) -> dict:
    acfg, rcfg = cfg["aoi"], cfg["reference"]
    cropland = (
        ee.ImageCollection(acfg["worldcover_id"]).first()
        .eq(acfg["cropland_class"]).rename("crop")
    )
    samples = cropland.stratifiedSample(
        numPoints=0, classBand="crop", region=pilot, scale=acfg["cropland_scale_pilot_m"],
        seed=rcfg["seed"], classValues=[1], classPoints=[rcfg["n_points"]], geometries=True,
    ).randomColumn("order", rcfg["seed"]).sort("order")
    features = []
    for i, f in enumerate(samples.getInfo()["features"]):
        features.append({
            "type": "Feature",
            "geometry": f["geometry"],
            "properties": {"point_id": f"R{i + 1:03d}", "order": i + 1},
        })
    return {
        "type": "FeatureCollection",
        "properties": {
            "description": "Random WorldCover cropland points in the pilot area; draw the "
                           "field each point falls in (2025 season boundaries).",
            "seed": rcfg["seed"],
            "target_fields": rcfg["target_fields"],
        },
        "features": features,
    }


def write_overlays(ee, cfg: dict, pilot, out_dir) -> list[dict]:
    year = cfg["seasons"][cfg["composites"]["segmentation_season"]]
    scale = cfg["composites"]["index_scale"]
    seg = ee.Image(f"{asset_root(cfg)}/seg_stack_{year}")
    w, s, e, n = cfg["pilot_bbox"]
    overlays = [
        {
            "id": f"s2_rgb_{year}",
            "label": f"Sentinel-2 Temmuz {year} (gerçek renk)",
            "image": seg.select(["B4", "B3", "B2"]).visualize(min=0, max=3000, gamma=1.2),
        },
        {
            "id": f"s2_ndvi_{year}",
            "label": f"NDVI {year}: Mayıs / Temmuz / Ağustos (yanlış renk)",
            "image": seg.select(["NDVI_m05", "NDVI_m07", "NDVI_m08"]).divide(scale)
            .visualize(min=0.1, max=0.85),
        },
    ]
    meta = []
    for o in overlays:
        file = f"{o['id']}.png"
        print(f"rendering {file} ...", file=sys.stderr)
        download_thumbnail(
            o["image"], pilot, out_dir / file,
            dimensions=cfg["reference"]["overlay_max_px"], crs="EPSG:3857",
        )
        meta.append({"id": o["id"], "label": o["label"], "file": file,
                     "bounds": [[s, w], [n, e]]})
    (out_dir / "overlays.json").write_text(
        json.dumps(meta, indent=2, ensure_ascii=False), encoding="utf-8"
    )
    return meta


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force-points", action="store_true",
                        help="resample points (invalidates existing reference drawings)")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    ee = init_ee(cfg)
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)

    points_path = PIPELINE_DIR / cfg["reference"]["points_file"]
    if points_path.exists() and not args.force_points:
        print(f"{points_path.name} exists, keeping it", file=sys.stderr)
    else:
        points_path.parent.mkdir(parents=True, exist_ok=True)
        points = sample_points(ee, cfg, pilot)
        points_path.write_text(json.dumps(points, indent=2), encoding="utf-8")
        print(f"wrote {len(points['features'])} points to {points_path}", file=sys.stderr)

    out_dir = step_output_dir(cfg, "03_reference")
    meta = write_overlays(ee, cfg, pilot, out_dir)
    print(json.dumps(meta, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

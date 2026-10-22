"""Step 01: study area – Konya Closed Basin polygon, pilot area and cropland mask stats.

Usage: python 01_aoi.py [--config config.yaml] [--force]
Outputs (outputs/01_aoi/): aoi_basin.geojson, aoi_pilot.geojson, basin_map.png,
pilot_map.png, aoi_summary.json. Skips work if the summary exists, unless --force.
"""

import argparse
import json
import sys

from lib.aoi import bbox_polygon, feature_collection, field_count_range
from lib.config import load_config, step_output_dir
from lib.ee_utils import download_thumbnail, init_ee, outline, s2_preview_rgb

ENDORHEIC_SINK = 2  # HydroSHEDS ENDO flag: basin is the sink of an endorheic system


def cropland_km2(ee, cropland, region, scale: int) -> float:
    area = (
        ee.Image.pixelArea()
        .updateMask(cropland)
        .reduceRegion(
            reducer=ee.Reducer.sum(), geometry=region, scale=scale,
            maxPixels=1e11, tileScale=4,
        )
        .getNumber("area")
    )
    return area.divide(1e6).getInfo()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    acfg = cfg["aoi"]
    out_dir = step_output_dir(cfg, "01_aoi")
    summary_path = out_dir / "aoi_summary.json"
    if summary_path.exists() and not args.force:
        print(summary_path.read_text(encoding="utf-8"))
        print("cached; use --force to recompute", file=sys.stderr)
        return 0

    ee = init_ee(cfg)

    print("selecting basin ...", file=sys.stderr)
    seed = ee.Geometry.Point(acfg["basin_seed_point"])
    basin_feat = ee.Feature(
        ee.FeatureCollection(acfg["basin_dataset"]).filterBounds(seed).first()
    )
    basin_props = basin_feat.toDictionary(
        ["HYBAS_ID", "ENDO", "SUB_AREA", "UP_AREA"]
    ).getInfo()
    if basin_props["ENDO"] != ENDORHEIC_SINK:
        print(f"basin at seed point is not an endorheic sink: {basin_props}", file=sys.stderr)
        return 1
    basin = basin_feat.geometry()

    pilot_geojson = bbox_polygon(cfg["pilot_bbox"])
    pilot = ee.Geometry(pilot_geojson, None, False)

    print("computing areas ...", file=sys.stderr)
    basin_km2 = basin.area(maxError=100).divide(1e6).getInfo()
    pilot_km2 = pilot.area(maxError=1).divide(1e6).getInfo()
    pilot_in_basin = (
        pilot.intersection(basin, maxError=10).area(maxError=10).divide(pilot.area(maxError=1))
    ).getInfo()

    worldcover = ee.ImageCollection(acfg["worldcover_id"]).first()
    cropland = worldcover.eq(acfg["cropland_class"]).selfMask()
    pilot_crop_km2 = cropland_km2(ee, cropland, pilot, acfg["cropland_scale_pilot_m"])
    basin_crop_km2 = cropland_km2(ee, cropland, basin, acfg["cropland_scale_basin_m"])
    n_low, n_high = field_count_range(pilot_crop_km2, acfg["mean_field_ha_assumption"])

    print("writing geometries ...", file=sys.stderr)
    (out_dir / "aoi_basin.geojson").write_text(
        json.dumps(feature_collection(basin.getInfo(), {
            "name": "Konya Closed Basin", "source": acfg["basin_dataset"], **basin_props,
        })),
        encoding="utf-8",
    )
    (out_dir / "aoi_pilot.geojson").write_text(
        json.dumps(feature_collection(pilot_geojson, {
            "name": "Pilot area", "bbox": cfg["pilot_bbox"],
        })),
        encoding="utf-8",
    )

    print("rendering previews ...", file=sys.stderr)
    year, month = cfg["seasons"]["main"], acfg["preview_month"]
    basin_view = basin.bounds(maxError=1000)
    download_thumbnail(
        ee.ImageCollection([
            s2_preview_rgb(ee, basin_view, year, month),
            outline(ee, basin, "00BFFF", 3),
            outline(ee, pilot, "FF2020", 3),
        ]).mosaic(),
        basin_view, out_dir / "basin_map.png", dimensions=1400,
    )
    pilot_view = pilot.buffer(2000).bounds(maxError=10)
    download_thumbnail(
        ee.ImageCollection([
            s2_preview_rgb(ee, pilot_view, year, month),
            cropland.visualize(palette=["FFD400"], opacity=0.35),
            outline(ee, pilot, "FF2020", 3),
        ]).mosaic(),
        pilot_view, out_dir / "pilot_map.png", dimensions=1400,
    )

    summary = {
        "basin": {
            "hybas_id": basin_props["HYBAS_ID"],
            "area_km2": round(basin_km2, 1),
            "hydrosheds_sub_area_km2": basin_props["SUB_AREA"],
            "cropland_km2": round(basin_crop_km2, 1),
            "cropland_scale_m": acfg["cropland_scale_basin_m"],
        },
        "pilot": {
            "bbox": cfg["pilot_bbox"],
            "area_km2": round(pilot_km2, 1),
            "fraction_inside_basin": round(pilot_in_basin, 4),
            "cropland_km2": round(pilot_crop_km2, 1),
            "cropland_fraction": round(pilot_crop_km2 / pilot_km2, 3),
        },
        "field_count_estimate": {
            "range": [n_low, n_high],
            "assumption": f"mean field size {acfg['mean_field_ha_assumption']} ha "
                          "(ASSUMPTION, replaced by segmentation in stage 3)",
        },
        "previews": {"rgb": f"Sentinel-2 median {year}-{month:02d}, cloud < 20%",
                     "cropland": "ESA WorldCover 2021 class 40"},
    }
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

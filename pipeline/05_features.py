"""Step 05: per-field features for crop classification (both seasons).

Usage: python 05_features.py [--config config.yaml] [--force]
Output: outputs/05_features/features_<year>.parquet, one row per field with
  <INDEX>_dNN    field median of the gap-filled dekadal NDVI / EVI / NDMI
  gap_share      mean share of interpolated or edge-filled pixel-dekads in the field
  harmonic coefficients, NDVI peak value and day of year, green-season days,
  NDMI July-August mean (lib/features.py), optional Sentinel-1 VV/VH monthly means (dB).
Fields from 03 (fields_corrected.geojson preferred); 2024 uses the same polygons.
"""

import argparse
import sys

import numpy as np
import pandas as pd

from lib.aoi import bbox_polygon
from lib.config import load_config, step_output_dir
from lib.ee_utils import asset_root, init_ee
from lib.features import series_features
from lib.field_stats import inner_buffered, reduce_fields
from lib.fields import load_fields, simplified
from lib.periods import dekad_labels, dekads
from lib.s2 import INDICES


def s2_stats(ee, cfg: dict, fields, year: int, labels: list[str]) -> dict[str, dict]:
    ccfg = cfg["composites"]
    dekadal = ee.Image(f"{asset_root(cfg)}/s2_dekadal_{year}")
    idx = dekadal.select([f"{i}_{lab}" for i in INDICES for lab in labels])
    gap = dekadal.select([f"GAP_{lab}" for lab in labels]).neq(0)
    reducer = ee.Reducer.median().combine(ee.Reducer.mean(), sharedInputs=True)
    return reduce_fields(ee, idx.addBands(gap), fields, reducer, ccfg["export_scale_m"],
                         ccfg["export_crs"], cfg["features"]["chunk_size"])


def s1_stats(ee, cfg: dict, fields, year: int) -> dict[str, dict]:
    """Monthly mean backscatter per field; averaged in linear power, reported in dB."""
    fcfg, ccfg = cfg["features"], cfg["composites"]
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(pilot)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
        .select(["VV", "VH"])
    )
    bands = []
    for m in fcfg["s1_months"]:
        start = ee.Date.fromYMD(year, m, 1)
        linear = (s1.filterDate(start, start.advance(1, "month"))
                  .map(lambda img: ee.Image(10).pow(img.divide(10))).mean())
        bands.append(linear.log10().multiply(10).rename([f"VV_m{m:02d}", f"VH_m{m:02d}"]))
    return reduce_fields(ee, ee.Image.cat(bands), fields, ee.Reducer.mean(),
                         ccfg["export_scale_m"], ccfg["export_crs"], fcfg["chunk_size"])


def build_table(cfg: dict, fields, year: int, s2: dict, s1: dict | None) -> pd.DataFrame:
    scfg, fcfg = cfg["seasons"], cfg["features"]
    periods = dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])
    labels = dekad_labels(len(periods))
    scale = cfg["composites"]["index_scale"]
    rows = []
    for fid, buffered in zip(fields["field_id"], fields["buffered"]):
        p = s2.get(fid, {})
        row: dict = {"field_id": fid, "season": year, "inner_buffered": bool(buffered)}
        series = {}
        for i in INDICES:
            vals = np.array([
                np.nan if p.get(f"{i}_{lab}_median") is None else p[f"{i}_{lab}_median"] / scale
                for lab in labels
            ])
            series[i] = vals
            row.update({f"{i}_{lab}": round(float(v), 4) for lab, v in zip(labels, vals)})
        gaps = [p.get(f"GAP_{lab}_mean") for lab in labels]
        row["gap_share"] = float(np.mean([g for g in gaps if g is not None])) if any(
            g is not None for g in gaps) else np.nan
        row.update(series_features(periods, series, fcfg["green_threshold"], fcfg["harmonics"]))
        if s1 is not None:
            row.update({k: v for k, v in s1.get(fid, {}).items()})
        rows.append(row)
    return pd.DataFrame(rows)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    fcfg, scfg = cfg["features"], cfg["seasons"]
    out_dir = step_output_dir(cfg, "05_features")
    fields = inner_buffered(
        simplified(load_fields(cfg), cfg["labels"]["simplify_m"]),
        fcfg["inner_buffer_m"], fcfg["min_buffered_ha"],
    )
    print(f"{len(fields)} fields, {int(fields['buffered'].sum())} inner-buffered", file=sys.stderr)

    ee = None
    for year in (scfg["main"], scfg["comparison"]):
        path = out_dir / f"features_{year}.parquet"
        if path.exists() and not args.force:
            print(f"{path.name} cached", file=sys.stderr)
            continue
        ee = ee or init_ee(cfg)
        labels = dekad_labels(len(dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])))
        print(f"{year}: Sentinel-2 ...", file=sys.stderr)
        s2 = s2_stats(ee, cfg, fields, year, labels)
        s1 = None
        if fcfg["sentinel1"]:
            print(f"{year}: Sentinel-1 ...", file=sys.stderr)
            s1 = s1_stats(ee, cfg, fields, year)
        table = build_table(cfg, fields, year, s2, s1)
        table.to_parquet(path, index=False)
        missing = table["NDVI_peak"].isna().sum()
        print(f"{year}: {len(table)} fields x {table.shape[1]} columns, "
              f"{missing} without NDVI, mean gap share {table['gap_share'].mean():.3f}",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

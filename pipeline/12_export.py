"""Step 12: export the web data (PLAN.md stage 12).

Usage: python -u 12_export.py [--config config.yaml]
Outputs (outputs/12_export/data/, served as /data/ by the web app):
  fields_<year>.parquet    GeoParquet, one row per field: geometry, class, ET, blue ET with range,
                           reference need, S1 / S2 budgets, status, stress flag, energy, levers
  fields_<year>.pmtiles    vector tiles (layer "fields") with the attributes the map styles on
  fields_<year>.json       attribute table of all fields (no geometry) for filters, cards, CSV, queries
  season_<year>.json       weekly cumulative blue ET of every field, for the whole-map season player
  field/<id>.json          per field, both seasons: daily NDVI, ET, cumulative blue ET and S1 budget line
  basin.json               GRACE / GLDAS monthly series and trends (stage 10)
  metrics.json             validation metrics of stages 3, 6-11
  field_shapes.json        simplified outer rings of every field (Telegram location lookup)
  manifest.json            what was generated, when, from which parameters
Everything except the GeoParquet files is then copied to export.publish_dir (public/data, D20).
"""

import argparse
import json
import shutil
import sys
from datetime import datetime, timezone
from pathlib import Path

import geopandas as gpd
import numpy as np
import pandas as pd
import pyogrio

from lib.budget import crop_calendar
from lib.config import load_config, step_output_dir
from lib.fields import load_fields, simplified

TILE_PROPS = ["field_id", "class", "uncertain", "area_ha", "blue_mm", "ratio_s1", "ratio_s2",
              "status_s1", "status_s2", "stress_flag"]


def read_json(cfg: dict, step: str, name: str) -> dict:
    return json.loads((step_output_dir(cfg, step) / name).read_text(encoding="utf-8"))


def field_table(cfg: dict, year: int, geoms: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    budget = pd.read_parquet(step_output_dir(cfg, "11_budget") / f"budget_{year}.parquet")
    et = pd.read_parquet(step_output_dir(cfg, "08_et") / f"field_et_{year}.parquet",
                         columns=["field_id", "et_mm", "et_mm_low", "et_mm_high", "et0_mm", "peff_mm",
                                  "precip_mm", "crop_days"])
    cls = pd.read_parquet(step_output_dir(cfg, "06_classify") / f"classes_{year}.parquet",
                          columns=["field_id", "class_prob"])
    stress = pd.read_parquet(step_output_dir(cfg, "09_sebal") / f"stress_{year}.parquet",
                             columns=["field_id", "stress_flag", "sebal_rel_median", "rel_obs"])
    df = budget.merge(et, on="field_id").merge(cls, on="field_id").merge(stress, on="field_id", how="left")
    df["stress_flag"] = df["stress_flag"].astype("boolean").fillna(False).astype(bool)
    gdf = geoms[["field_id", "geometry"]].merge(df, on="field_id")
    return gpd.GeoDataFrame(gdf, geometry="geometry", crs=geoms.crs)


def write_pmtiles(gdf: gpd.GeoDataFrame, path, ecfg: dict) -> None:
    if path.exists():
        path.unlink()
    # SAM fields follow the 10 m pixel grid; simplify the staircase edges for the map only
    tiles = simplified(gdf[TILE_PROPS + ["geometry"]].copy(), ecfg["simplify_m"])
    for c in ("area_ha", "blue_mm", "ratio_s1", "ratio_s2"):
        tiles[c] = tiles[c].round(2)
    pyogrio.write_dataframe(tiles, path, driver="PMTiles", layer="fields",
                            dataset_options={"MINZOOM": ecfg["min_zoom"], "MAXZOOM": ecfg["max_zoom"],
                                             "NAME": path.stem})


def attribute_table(gdf: gpd.GeoDataFrame) -> dict:
    """All fields without geometry, column-name header + rows, for filters, cards, CSV and queries."""
    c = gdf.to_crs("EPSG:32636").centroid.to_crs("EPSG:4326")
    df = gdf.drop(columns="geometry").assign(lon=c.x.round(5), lat=c.y.round(5))
    cols = ["field_id", "class", "class_prob", "uncertain", "area_ha", "assessed", "et_mm", "blue_mm",
            "blue_mm_low", "blue_mm_high", "blue_m3", "reference_mm", "budget_s1_mm", "budget_s2_mm",
            "ratio_s1", "ratio_s2", "status_s1", "status_s2", "stress_flag", "energy_kwh", "energy_s1_kwh",
            "lever_evap_mm", "lever_deficit_mm", "lever_deficit_yield_loss", "lever_switch_to",
            "lever_switch_mm", "lon", "lat", "cal_start", "cal_mid_start", "cal_mid_end", "cal_end", "kcb_peak"]
    df = df[cols].copy()
    for col in ("class_prob", "area_ha", "ratio_s1", "ratio_s2", "lever_deficit_yield_loss", "kcb_peak"):
        df[col] = df[col].round(3)
    df = df.astype(object).where(df.notna(), None)
    return {"columns": cols, "rows": df.to_numpy().tolist()}


def calendar(cfg: dict, daily: pd.DataFrame) -> pd.DataFrame:
    """Satellite crop calendar (day offsets from the season start) for the farmer-side engine."""
    kcb = daily.pivot(index="field_id", columns="date", values="kcb")
    cal = crop_calendar(kcb.to_numpy(float), cfg["et"]["crop_present_kcb"], cfg["export"]["calendar_mid_share"])
    df = pd.DataFrame({f"cal_{k}": v for k, v in cal.items() if k != "peak"}, index=kcb.index)
    df["kcb_peak"] = cal["peak"]
    return df.reset_index()


def field_shapes(geoms: gpd.GeoDataFrame, tolerance_m: float) -> dict:
    """Simplified outer rings, for finding the field under a shared location (Telegram)."""
    s = simplified(geoms[["field_id", "geometry"]], tolerance_m)
    out = {}
    for fid, geom in zip(s["field_id"], s.geometry):
        polys = list(geom.geoms) if geom.geom_type == "MultiPolygon" else [geom]
        out[fid] = [[[round(x, 5), round(y, 5)] for x, y in poly.exterior.coords] for poly in polys]
    return out


def series_round(a: np.ndarray, decimals: int) -> list:
    return [None if np.isnan(v) else round(float(v), decimals) for v in a]


def daily_frames(cfg: dict, year: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    daily = pd.read_parquet(step_output_dir(cfg, "08_et") / f"daily_et_{year}.parquet")
    budget = pd.read_parquet(step_output_dir(cfg, "11_budget") / f"daily_budget_{year}.parquet")
    for d in (daily, budget):
        d["date"] = pd.to_datetime(d["date"])
    return daily.merge(budget, on=["field_id", "date"], how="left"), budget


def season_player(daily: pd.DataFrame, step_days: int) -> dict:
    dates = sorted(daily["date"].unique())[::step_days]
    sub = daily[daily["date"].isin(dates)]
    piv = sub.pivot(index="field_id", columns="date", values="cum_blue_mm")
    return {"dates": [pd.Timestamp(d).strftime("%Y-%m-%d") for d in piv.columns],
            "field_ids": piv.index.tolist(),
            "cum_blue_mm": np.rint(piv.to_numpy()).astype(int).tolist()}


def metrics(cfg: dict) -> dict:
    """Compact copy of the validation figures the 'Method and validation' page shows."""
    sam = read_json(cfg, "03_segmentation", "sam_report.json")
    cls = read_json(cfg, "06_classify", "classify_report.json")
    et0 = read_json(cfg, "07_et0", "et0_report.json")
    et = read_json(cfg, "08_et", "et_report.json")
    sebal = read_json(cfg, "09_sebal", "sebal_report.json")
    basin = read_json(cfg, "10_basin", "basin.json")
    budget = read_json(cfg, "11_budget", "budget_report.json")
    return {
        "segmentation": {**{k: sam[k] for k in ("reference", "selected_input", "n_fields", "median_field_ha")},
                         "selected_metrics": sam["inputs"][sam["selected_input"]]},
        "classification": {"accuracy_measured": False,
                           **{k: cls[k] for k in ("seasons", "blind_labels", "plausibility_check")}},
        "et0_crosscheck": et0["crosscheck"],
        "et_ndvikc": et,
        "sebal": {y: {k: s[k] for k in ("overpasses_used", "comparison", "modis_mod16_season_mm_cropland",
                                        "ndvikc_season_et_mm_area_weighted")}
                  for y, s in sebal["seasons"].items()},
        "basin": {k: basin[k] for k in ("series", "trends", "gwsa_grace_period_product_range_cm_yr",
                                        "mean_monthly_grace_uncertainty_cm", "notes")},
        "budget": budget,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    ecfg, scfg = cfg["export"], cfg["seasons"]
    out = step_output_dir(cfg, "12_export") / "data"
    if out.exists():
        shutil.rmtree(out)
    (out / "field").mkdir(parents=True)

    geoms = load_fields(cfg).to_crs("EPSG:4326")
    years = [scfg["main"], scfg["comparison"]]
    per_field: dict[str, dict] = {}
    for year in years:
        print(f"{year}: fields, tiles, daily series", file=sys.stderr)
        gdf = field_table(cfg, year, geoms)
        gdf.to_parquet(out / f"fields_{year}.parquet", index=False)
        write_pmtiles(gdf, out / f"fields_{year}.pmtiles", ecfg)
        daily, _ = daily_frames(cfg, year)
        gdf = gdf.merge(calendar(cfg, daily), on="field_id", how="left")
        (out / f"fields_{year}.json").write_text(json.dumps(attribute_table(gdf), separators=(",", ":")),
                                                 encoding="utf-8")
        (out / f"season_{year}.json").write_text(
            json.dumps(season_player(daily, ecfg["player_step_days"]), separators=(",", ":")), encoding="utf-8")
        start = daily["date"].min().strftime("%Y-%m-%d")
        k = float(gdf["s2_factor"].iloc[0])
        attrs = gdf.drop(columns="geometry").set_index("field_id")
        for fid, g in daily.sort_values(["field_id", "date"]).groupby("field_id", sort=False):
            a = attrs.loc[fid]
            per_field.setdefault(fid, {"field_id": fid, "seasons": {}})["seasons"][str(year)] = {
                "start": start,
                "class": a["class"], "class_prob": round(float(a["class_prob"]), 2), "uncertain": bool(a["uncertain"]),
                "area_ha": round(float(a["area_ha"]), 2), "assessed": bool(a["assessed"]),
                "blue_mm": a["blue_mm"], "blue_mm_range": [a["blue_mm_low"], a["blue_mm_high"]],
                "budget_s1_mm": None if pd.isna(a["budget_s1_mm"]) else a["budget_s1_mm"],
                "budget_s2_mm": None if pd.isna(a["budget_s2_mm"]) else a["budget_s2_mm"],
                "s2_factor": k, "status_s1": a["status_s1"], "status_s2": a["status_s2"],
                "stress_flag": bool(a["stress_flag"]),
                "ndvi": series_round(g["ndvi"].to_numpy(), 2),
                "et_mm": series_round(g["et_mm"].to_numpy(), 1),
                "cum_blue_mm": series_round(g["cum_blue_mm"].to_numpy(), 0),
                "cum_budget_s1_mm": series_round(g["cum_budget_s1_mm"].to_numpy(), 0),
            }
    for fid, rec in per_field.items():
        (out / "field" / f"{fid}.json").write_text(json.dumps(rec, separators=(",", ":"), default=float),
                                                   encoding="utf-8")

    basin = read_json(cfg, "10_basin", "basin.json")
    s = pd.read_parquet(step_output_dir(cfg, "10_basin") / "basin_series.parquet")
    basin["monthly"] = {"month": s["month"].tolist(), "mission": s["mission"].tolist(),
                        **{c: series_round(s[c].to_numpy(), 2)
                           for c in ("twsa_cm", "gwsa_cm", "unc_cm", "lsm_cm")}}
    (out / "basin.json").write_text(json.dumps(basin, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (out / "metrics.json").write_text(json.dumps(metrics(cfg), ensure_ascii=False, separators=(",", ":"),
                                                 default=str), encoding="utf-8")

    files = sorted(p for p in out.rglob("*") if p.is_file())
    sizes = {"field_files": sum(1 for p in files if p.parent.name == "field"),
             "field_mb": round(sum(p.stat().st_size for p in files if p.parent.name == "field") / 1e6, 1),
             **{p.name: round(p.stat().st_size / 1e6, 2) for p in files if p.parent == out}}
    (out / "field_shapes.json").write_text(json.dumps(field_shapes(geoms, ecfg["simplify_m"]), separators=(",", ":")),
                                           encoding="utf-8")
    manifest = {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "season_start_mmdd": scfg["start_mmdd"], "kcb_max": cfg["et"]["kcb_max"],
                "seasons": years, "classes": cfg["labels"]["classes"], "budget_parameters": cfg["budget"],
                "status_scenario_default": "s1", "sizes_mb": sizes}
    (out / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False), encoding="utf-8")
    print(json.dumps(sizes, indent=1))

    publish = (Path(__file__).parent / ecfg["publish_dir"]).resolve()
    if publish.exists():
        shutil.rmtree(publish)
    shutil.copytree(out, publish, ignore=shutil.ignore_patterns(*ecfg["publish_skip"]))
    print(f"published to {publish}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())

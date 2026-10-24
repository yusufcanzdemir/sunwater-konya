"""Step 07: daily reference ET (ET0) and precipitation per weather grid cell, with cross-check.

Usage: python 07_et0.py [--config config.yaml] [--force]
1. A lattice (weather.grid_step_deg) over the pilot area is sent to the Open-Meteo archive;
   each request point snaps to a model grid cell, duplicates are dropped. Responses are cached
   per point (outputs/07_et0/cache/), covering Jan 1 of the comparison year to Dec 31 of the
   main year.
2. Every field is assigned to the cell nearest to its centroid.
3. Cross-check: FAO-56 Penman-Monteith from ERA5-Land daily aggregates at each cell centre.
Outputs (outputs/07_et0/): weather.parquet (cell_id, date, et0_mm, precip_mm, peff_mm),
era5_daily.parquet (cell_id, date, era5_et0_mm, era5_precip_mm), cells.json, field_cells.parquet, et0_report.{json,md}.
"""

import argparse
import json
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd
import requests

from lib.config import load_config, step_output_dir
from lib.ee_utils import init_ee
from lib.fao56 import (
    effective_rain, et0_penman_monteith, net_radiation_reference, sat_vapour_pressure, wind_at_2m,
)
from lib.fields import METRIC_CRS, load_fields
from lib.periods import season_bounds


def lattice(bbox: list[float], step: float) -> list[tuple[float, float]]:
    """Request points (lon, lat) at cell-step spacing covering the bbox, edges included."""
    w, s, e, n = bbox
    lons = np.arange(w, e + step / 2, step)
    lats = np.arange(s, n + step / 2, step)
    return [(round(float(x), 4), round(float(y), 4)) for y in lats for x in lons]


def fetch_open_meteo(wcfg: dict, lon: float, lat: float, start: date, end: date, cache) -> dict:
    path = cache / f"om_{lat:.4f}_{lon:.4f}_{start}_{end}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    resp = requests.get(wcfg["open_meteo_url"], params={
        "latitude": lat, "longitude": lon,
        "start_date": start.isoformat(), "end_date": end.isoformat(),
        "daily": "et0_fao_evapotranspiration,precipitation_sum",
        "timezone": wcfg["timezone"],
    }, timeout=120)
    resp.raise_for_status()
    data = resp.json()
    path.write_text(json.dumps(data), encoding="utf-8")
    return data


def daily_wind_speed(ee, hourly_id: str, start: date, end: date):
    """Daily mean of hourly 10 m wind speed (averaging u/v first would understate speed)."""
    hourly = ee.ImageCollection(hourly_id).select(
        ["u_component_of_wind_10m", "v_component_of_wind_10m"])
    first = ee.Date(start.isoformat())

    def one_day(i):
        d = first.advance(i, "day")
        speed = hourly.filterDate(d, d.advance(1, "day")).map(
            lambda im: im.select(0).hypot(im.select(1)))
        return speed.mean().rename("wind10_mean").set("system:time_start", d.millis())

    return ee.ImageCollection(ee.List.sequence(0, (end - start).days).map(one_day))


def era5_pm(ee, wcfg: dict, cells: pd.DataFrame, start: date, end: date) -> pd.DataFrame:
    """Daily FAO-56 PM ET0 and precipitation from ERA5-Land at the cell centres.

    Net radiation is computed for the grass reference surface from incoming shortwave
    (FAO-56 eqs. 37-40), not taken from ERA5's net radiation of the actual (often bare,
    hot) surface; wind is the daily mean of hourly speeds.
    """
    bands = ["temperature_2m_max", "temperature_2m_min", "dewpoint_temperature_2m",
             "surface_solar_radiation_downwards_sum", "surface_pressure",
             "total_precipitation_sum"]
    # filterDate's end is exclusive
    daily = ee.ImageCollection(wcfg["era5_land_id"]).filterDate(
        start.isoformat(), (end + timedelta(days=1)).isoformat()
    ).select(bands)
    wind = daily_wind_speed(ee, wcfg["era5_land_hourly_id"], start, end)
    frames = []
    for _, c in cells.iterrows():
        point = ee.Geometry.Point([c.lon, c.lat])
        parts = []
        for col in (daily, wind):
            rows = col.getRegion(point, 11132).getInfo()
            df = pd.DataFrame(rows[1:], columns=rows[0])
            df["date"] = pd.to_datetime(df["time"], unit="ms").dt.date
            parts.append(df.drop(columns=["id", "longitude", "latitude", "time"]))
        df = parts[0].merge(parts[1], on="date")
        df["cell_id"], df["lat"], df["elevation_m"] = c.cell_id, c.lat, c.elevation_m
        frames.append(df)
    df = pd.concat(frames).dropna(subset=bands + ["wind10_mean"])
    tmax = df["temperature_2m_max"] - 273.15
    tmin = df["temperature_2m_min"] - 273.15
    ea = sat_vapour_pressure(df["dewpoint_temperature_2m"] - 273.15)
    doy = pd.to_datetime(df["date"]).dt.dayofyear
    rn = net_radiation_reference(df["surface_solar_radiation_downwards_sum"] / 1e6, tmax, tmin,
                                 ea, df["lat"], doy, df["elevation_m"])
    df["era5_et0_mm"] = et0_penman_monteith(
        tmax_c=tmax, tmin_c=tmin, ea_kpa=ea, u2_ms=wind_at_2m(df["wind10_mean"], 10),
        rn_mj=rn, pressure_kpa=df["surface_pressure"] / 1000,
    )
    df["era5_precip_mm"] = df["total_precipitation_sum"] * 1000
    return df[["cell_id", "date", "era5_et0_mm", "era5_precip_mm"]]


def compare(weather: pd.DataFrame, era5: pd.DataFrame, cfg: dict) -> dict:
    scfg = cfg["seasons"]
    m = weather.merge(era5, on=["cell_id", "date"])
    out = {}
    for year in (scfg["main"], scfg["comparison"]):
        s, e = season_bounds(year, scfg["start_mmdd"], scfg["end_mmdd"])
        d = m[(m["date"] >= s) & (m["date"] < e)]
        diff = d["et0_mm"] - d["era5_et0_mm"]
        sums = d.groupby("cell_id")[["et0_mm", "era5_et0_mm", "precip_mm", "era5_precip_mm"]].sum()
        out[str(year)] = {
            "days": int(d["date"].nunique()),
            "daily_et0_bias_mm": round(float(diff.mean()), 3),
            "daily_et0_rmse_mm": round(float(np.sqrt((diff**2).mean())), 3),
            "daily_et0_r": round(float(np.corrcoef(d["et0_mm"], d["era5_et0_mm"])[0, 1]), 3),
            "season_et0_mm_open_meteo": round(float(sums["et0_mm"].mean()), 1),
            "season_et0_mm_era5_pm": round(float(sums["era5_et0_mm"].mean()), 1),
            "season_precip_mm_open_meteo": round(float(sums["precip_mm"].mean()), 1),
            "season_precip_mm_era5": round(float(sums["era5_precip_mm"].mean()), 1),
        }
    return out


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true", help="ignore cached API responses")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    wcfg, scfg = cfg["weather"], cfg["seasons"]
    out_dir = step_output_dir(cfg, "07_et0")
    cache = out_dir / "cache"
    cache.mkdir(exist_ok=True)
    if args.force:
        for f in cache.glob("*.json"):
            f.unlink()
    start = date(scfg["comparison"], 1, 1)
    end = date(scfg["main"], 12, 31)

    print("Open-Meteo ...", file=sys.stderr)
    frames, cells = [], {}
    for lon, lat in lattice(cfg["pilot_bbox"], wcfg["grid_step_deg"]):
        data = fetch_open_meteo(wcfg, lon, lat, start, end, cache)
        cell_id = f"{data['latitude']:.3f}_{data['longitude']:.3f}"
        if cell_id in cells:
            continue
        cells[cell_id] = {"cell_id": cell_id, "lat": data["latitude"], "lon": data["longitude"],
                          "elevation_m": data.get("elevation")}
        d = data["daily"]
        frames.append(pd.DataFrame({
            "cell_id": cell_id,
            "date": pd.to_datetime(d["time"]).date,
            "et0_mm": d["et0_fao_evapotranspiration"],
            "precip_mm": d["precipitation_sum"],
        }))
    weather = pd.concat(frames, ignore_index=True)
    missing = int(weather[["et0_mm", "precip_mm"]].isna().any(axis=1).sum())
    weather = weather.dropna(subset=["et0_mm", "precip_mm"])
    rule = wcfg["effective_rain"]
    weather["peff_mm"] = effective_rain(weather["precip_mm"], rule["threshold_mm"], rule["factor"])
    weather.to_parquet(out_dir / "weather.parquet", index=False)
    cell_df = pd.DataFrame(cells.values())
    (out_dir / "cells.json").write_text(json.dumps(list(cells.values()), indent=1), encoding="utf-8")
    print(f"{len(cells)} cells, {len(weather)} cell-days, {missing} incomplete days dropped",
          file=sys.stderr)

    fields = load_fields(cfg)
    cent = fields.to_crs(METRIC_CRS).centroid.to_crs("EPSG:4326")
    # Degrees are fine for nearest-cell at this scale (cells ~ 0.1 deg apart)
    d2 = ((cent.x.to_numpy()[:, None] - cell_df["lon"].to_numpy()[None]) ** 2
          * np.cos(np.radians(37.8)) ** 2
          + (cent.y.to_numpy()[:, None] - cell_df["lat"].to_numpy()[None]) ** 2)
    field_cells = pd.DataFrame({"field_id": fields["field_id"],
                                "cell_id": cell_df["cell_id"].to_numpy()[d2.argmin(axis=1)]})
    field_cells.to_parquet(out_dir / "field_cells.parquet", index=False)

    print("ERA5-Land cross-check ...", file=sys.stderr)
    era5 = era5_pm(init_ee(cfg), wcfg, cell_df, start, end)
    era5.to_parquet(out_dir / "era5_daily.parquet", index=False)
    report = {
        "cells": len(cells),
        "fields_per_cell": field_cells["cell_id"].value_counts().to_dict(),
        "incomplete_days_dropped": missing,
        "effective_rain_rule": rule,
        "crosscheck": compare(weather, era5, cfg),
    }
    (out_dir / "et0_report.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    lines = ["| Season | Open-Meteo ET0 (mm) | ERA5-Land PM ET0 (mm) | Daily bias | Daily RMSE | r "
             "| Open-Meteo P (mm) | ERA5-Land P (mm) |", "|---|---|---|---|---|---|---|---|"]
    for y, c in report["crosscheck"].items():
        lines.append(f"| {y} | {c['season_et0_mm_open_meteo']} | {c['season_et0_mm_era5_pm']} "
                     f"| {c['daily_et0_bias_mm']} | {c['daily_et0_rmse_mm']} | {c['daily_et0_r']} "
                     f"| {c['season_precip_mm_open_meteo']} | {c['season_precip_mm_era5']} |")
    md = "\n".join(lines) + "\n"
    (out_dir / "et0_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

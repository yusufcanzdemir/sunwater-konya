"""Step 08: field-level actual ET and blue-water use from NDVI-Kc (main method, PLAN.md D3).

Usage: python 08_et_ndvikc.py [--config config.yaml]
Per field and season (Mar 1 - Oct 31), with a low / central / high scenario:
  daily NDVI   Savitzky-Golay over dekads, linear to days
  Kcb          scaled NDVI between NDVI_min and NDVI_max, Kcb_min .. Kcb_max(class)
  Ke           simplified FAO-56 soil evaporation after rain / assumed irrigation wetting
  ET           (Kcb + Ke) * ET0, no water stress (stress is checked by SEBAL in stage 9)
  rainfed      rainfed cereal and fallow: ET capped at season P + initial soil water, blue = 0
  blue ET      max(0, ET - Peff) over the crop-present days (Kcb > et.crop_present_kcb);
               bare-soil evaporation before sowing / after harvest is not groundwater (D16)
Scenario ranges: NDVI_min/max and Kcb_max shifted by config et.sensitivity; ET0 and
precipitation take the daily min / max of Open-Meteo and ERA5-Land; the low blue scenario also
credits the initial soil water. Outputs (outputs/08_et/): field_et_<year>.parquet,
daily_et_<year>.parquet (central scenario), et_report.{json,md}.
"""

import argparse
import json
import sys
from datetime import date, timedelta

import numpy as np
import pandas as pd

from lib.config import load_config, step_output_dir
from lib.et import (
    basal_kc, cap_to_supply, cumulative_blue, interpolation_matrix, irrigation_wetting,
    scaled_fraction, smooth_dekads, soil_evaporation,
)
from lib.fao56 import effective_rain
from lib.fields import load_fields
from lib.periods import dekad_labels, dekads, season_bounds


def ndvi_bounds(ecfg: dict, ndvi: np.ndarray) -> tuple[float, float]:
    lo = ecfg["ndvi_min"]
    hi = ecfg["ndvi_max"]
    if lo == "auto":
        lo = float(np.nanpercentile(ndvi, ecfg["ndvi_min_percentile"]))
    if hi == "auto":
        hi = float(np.nanpercentile(ndvi, ecfg["ndvi_max_percentile"]))
    return round(lo, 3), round(hi, 3)


def cell_matrix(daily: pd.DataFrame, value: str, cells: list[str], days: list[date]) -> np.ndarray:
    """(cells, days) matrix of one weather variable."""
    wide = daily.pivot(index="cell_id", columns="date", values=value)
    return wide.reindex(index=cells, columns=days).to_numpy(dtype=float)


def run_scenario(ndvi_daily, kcb_max, ndvi_min, ndvi_max, et0, rain_wet, irrigated, ecfg):
    frac = scaled_fraction(ndvi_daily, ndvi_min, ndvi_max)
    kcb = basal_kc(frac, ecfg["kcb_min"], kcb_max)
    se = ecfg["soil_evaporation"]
    wet = rain_wet | irrigation_wetting(kcb, irrigated, se["irrigation_interval_days"],
                                        se["crop_present_kcb"])
    ke = soil_evaporation(kcb, frac, wet, se["kc_max"], se["decay_days"])
    return (kcb + ke) * et0, kcb


def season(cfg: dict, year: int, ndvi_lohi: tuple[float, float] | None) -> dict:
    ecfg, scfg = cfg["et"], cfg["seasons"]
    rule = cfg["weather"]["effective_rain"]
    sens = ecfg["sensitivity"]
    periods = dekads(year, scfg["start_mmdd"], scfg["end_mmdd"])
    start, end = season_bounds(year, scfg["start_mmdd"], scfg["end_mmdd"])
    days = [start + timedelta(days=i) for i in range((end - start).days)]

    feats = pd.read_parquet(step_output_dir(cfg, "05_features") / f"features_{year}.parquet")
    classes = pd.read_parquet(step_output_dir(cfg, "06_classify") / f"classes_{year}.parquet")
    wdir = step_output_dir(cfg, "07_et0")
    field_cells = pd.read_parquet(wdir / "field_cells.parquet")
    om = pd.read_parquet(wdir / "weather.parquet")
    era5 = pd.read_parquet(wdir / "era5_daily.parquet")
    areas = load_fields(cfg).set_index("field_id")["area_ha"]
    df = (feats[["field_id"]].merge(classes[["field_id", "class", "uncertain"]], on="field_id")
          .merge(field_cells, on="field_id"))
    df["area_ha"] = df["field_id"].map(areas).to_numpy()

    labels = dekad_labels(len(periods))
    dek = feats.set_index("field_id").loc[df["field_id"], [f"NDVI_{lab}" for lab in labels]]
    dek = dek.to_numpy(dtype=float)
    if ndvi_lohi is None:
        ndvi_lohi = ndvi_bounds(ecfg, dek)
    ndvi_min, ndvi_max = ndvi_lohi

    mid = np.array([(s + (e - s) / 2).toordinal() for s, e in periods], dtype=float)
    w = interpolation_matrix(mid, np.array([d.toordinal() for d in days], dtype=float))
    smoothed = smooth_dekads(dek, ecfg["smoothing"]["window"], ecfg["smoothing"]["polyorder"])
    ndvi_daily = np.clip(smoothed @ w.T, -1, 1)

    cells = sorted(df["cell_id"].unique())
    idx = df["cell_id"].map({c: i for i, c in enumerate(cells)}).to_numpy()
    om_et0 = cell_matrix(om, "et0_mm", cells, days)[idx]
    om_p = cell_matrix(om, "precip_mm", cells, days)[idx]
    e5_et0 = cell_matrix(era5, "era5_et0_mm", cells, days)[idx]
    e5_p = cell_matrix(era5, "era5_precip_mm", cells, days)[idx]
    # ERA5 may lack the newest days; fall back to Open-Meteo there
    e5_et0 = np.where(np.isnan(e5_et0), om_et0, e5_et0)
    e5_p = np.where(np.isnan(e5_p), om_p, e5_p)
    peff = {k: effective_rain(p, rule["threshold_mm"], rule["factor"])
            for k, p in (("om", om_p), ("e5", e5_p))}
    rain_wet = om_p >= ecfg["soil_evaporation"]["rain_wetting_mm"]

    rainfed = df["class"].isin(ecfg["rainfed_classes"]).to_numpy()
    kcb_max = df["class"].map(ecfg["kcb_max"]).to_numpy(dtype=float)
    sw0 = ecfg["initial_soil_water_mm"]
    scenarios = {
        "central": (kcb_max, ndvi_min, ndvi_max, om_et0, om_p),
        "low": (kcb_max - sens["kcb_max_delta"], ndvi_min + sens["ndvi_delta"],
                ndvi_max + sens["ndvi_delta"], np.minimum(om_et0, e5_et0), np.maximum(om_p, e5_p)),
        "high": (kcb_max + sens["kcb_max_delta"], ndvi_min - sens["ndvi_delta"],
                 ndvi_max - sens["ndvi_delta"], np.maximum(om_et0, e5_et0), np.minimum(om_p, e5_p)),
    }
    out = df[["field_id", "class", "uncertain", "cell_id", "area_ha"]].copy()
    out["season"] = year
    peff_daily = {"central": peff["om"],
                  "low": np.maximum(peff["om"], peff["e5"]),
                  "high": np.minimum(peff["om"], peff["e5"])}
    central_daily = {}
    for name, (kmax, lo, hi, et0, p) in scenarios.items():
        et, kcb = run_scenario(ndvi_daily, kmax, lo, hi, et0, rain_wet, ~rainfed, ecfg)
        supply = np.where(rainfed, p.sum(axis=1) + sw0, np.inf)
        et, capped = cap_to_supply(et, supply)
        et_season = et.sum(axis=1)
        cropped = kcb > ecfg["crop_present_kcb"]
        credit = sw0 if name == "low" else 0.0
        blue_raw = (et * cropped).sum(axis=1) - (peff_daily[name] * cropped).sum(axis=1) - credit
        blue = np.where(rainfed, 0.0, np.maximum(blue_raw, 0.0))
        suffix = "" if name == "central" else f"_{name}"
        out[f"et_mm{suffix}"] = et_season.round(1)
        out[f"blue_mm{suffix}"] = blue.round(1)
        out[f"blue_m3{suffix}"] = (blue * out["area_ha"] * 10).round(0)
        if name == "central":
            out["et0_mm"] = et0.sum(axis=1).round(1)
            out["peff_mm"] = peff_daily["central"].sum(axis=1).round(1)
            out["precip_mm"] = p.sum(axis=1).round(1)
            out["crop_days"] = cropped.sum(axis=1)
            out["rainfed_capped"] = capped
            cum = np.where(rainfed[:, None], 0.0,
                           cumulative_blue(et * cropped, peff["om"] * cropped))
            central_daily = {"ndvi": ndvi_daily, "kcb": kcb, "et": et, "cum_blue": cum}
    return {"fields": out, "daily": central_daily, "days": days, "ndvi_lohi": ndvi_lohi}


def daily_table(res: dict) -> pd.DataFrame:
    n, d = res["daily"]["et"].shape
    frame = pd.DataFrame({
        "field_id": np.repeat(res["fields"]["field_id"].to_numpy(), d),
        "date": np.tile(np.array(res["days"], dtype="datetime64[D]"), n),
    })
    for k, v in res["daily"].items():
        frame[f"{k}_mm" if k in ("et", "cum_blue") else k] = v.ravel().astype(np.float32)
    return frame


def summarize(fields: pd.DataFrame, names: dict[str, str]) -> dict:
    by = fields.groupby("class")
    summary = {
        cl: {
            "name": names.get(cl, cl),
            "fields": int(len(g)),
            "area_ha": round(float(g["area_ha"].sum()), 1),
            "et_mm_median": float(g["et_mm"].median()),
            "blue_mm_median": float(g["blue_mm"].median()),
            "blue_mm_median_range": [float(g["blue_mm_low"].median()), float(g["blue_mm_high"].median())],
            "blue_mm3_total": round(float(g["blue_m3"].sum()) / 1e6, 3),
            "blue_mm3_total_range": [round(float(g["blue_m3_low"].sum()) / 1e6, 3),
                                     round(float(g["blue_m3_high"].sum()) / 1e6, 3)],
            "rainfed_capped_share": float(g["rainfed_capped"].mean()),
        }
        for cl, g in by
    }
    return {
        "classes": summary,
        "pilot_blue_mm3": round(float(fields["blue_m3"].sum()) / 1e6, 2),
        "pilot_blue_mm3_range": [round(float(fields["blue_m3_low"].sum()) / 1e6, 2),
                                 round(float(fields["blue_m3_high"].sum()) / 1e6, 2)],
        "season_et0_mm_mean": round(float(fields["et0_mm"].mean()), 1),
        "season_precip_mm_mean": round(float(fields["precip_mm"].mean()), 1),
        "season_peff_mm_mean": round(float(fields["peff_mm"].mean()), 1),
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    scfg = cfg["seasons"]
    out_dir = step_output_dir(cfg, "08_et")
    names = cfg["labels"]["classes"]
    report: dict = {"seasons": {}}
    ndvi_lohi = None  # fixed from the main season, reused for the comparison season
    for year in (scfg["main"], scfg["comparison"]):
        print(f"{year} ...", file=sys.stderr)
        res = season(cfg, year, ndvi_lohi)
        ndvi_lohi = res["ndvi_lohi"]
        res["fields"].to_parquet(out_dir / f"field_et_{year}.parquet", index=False)
        daily_table(res).to_parquet(out_dir / f"daily_et_{year}.parquet", index=False)
        report["seasons"][str(year)] = summarize(res["fields"], names)
    report["ndvi_min"], report["ndvi_max"] = ndvi_lohi
    (out_dir / "et_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False),
                                           encoding="utf-8")

    lines = [f"NDVI_min = {report['ndvi_min']}, NDVI_max = {report['ndvi_max']} "
             "(percentiles of field-dekad NDVI, main season)"]
    for y, s in report["seasons"].items():
        lines += ["", f"## {y}: ET0 {s['season_et0_mm_mean']} mm, P {s['season_precip_mm_mean']} mm, "
                      f"Peff {s['season_peff_mm_mean']} mm; pilot blue water "
                      f"{s['pilot_blue_mm3']} Mm³ ({s['pilot_blue_mm3_range'][0]}–"
                      f"{s['pilot_blue_mm3_range'][1]})", "",
                  "| Class | Fields | ha | ET mm (median) | Blue mm (median, range) | Blue Mm³ (range) | Capped |",
                  "|---|---|---|---|---|---|---|"]
        for cl, c in sorted(s["classes"].items(), key=lambda kv: -kv[1]["blue_mm3_total"]):
            lo, hi = c["blue_mm_median_range"]
            mlo, mhi = c["blue_mm3_total_range"]
            lines.append(f"| {c['name']} | {c['fields']} | {c['area_ha']:.0f} | {c['et_mm_median']:.0f} "
                         f"| {c['blue_mm_median']:.0f} ({lo:.0f}–{hi:.0f}) "
                         f"| {c['blue_mm3_total']:.2f} ({mlo:.2f}–{mhi:.2f}) "
                         f"| {c['rainfed_capped_share']:.0%} |")
    md = "\n".join(lines) + "\n"
    (out_dir / "et_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

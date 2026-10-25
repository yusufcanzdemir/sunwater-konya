"""Step 11: field water budget, scenarios, status, levers and pump energy (PLAN.md stage 11, KK6).

Usage: python -u 11_budget.py [--config config.yaml]
Per season, from the stage 8 daily Kcb and the stage 7 weather:
  measured     blue ET of stage 8 (central, low, high)
  reference    blue ET of the class-typical crop (median Kcb of the class, confident fields)
               under efficient irrigation (drip: wetted fraction budget.efficient_fw)
  S0           budget = measured (comparison base)
  S1           budget = reference
  S2           budget = reference · k, k such that the pilot total is cut by budget.s2_reduction
  status       measured / budget against budget.status_within / status_limit (S1 and S2);
               rainfed cereal and fallow are not assessed
  levers       soil-evaporation (own crop, drip wetting), deficit irrigation (ET cut, FAO-33
               yield loss where Ky is verified), crop change (class median blue ET)
  energy       E = 9.81 · H · (blue / η_irr) / (3600 · η_pump), same formula as src/engine/pump.ts
Outputs (outputs/11_budget/): budget_<year>.parquet, daily_budget_<year>.parquet (cumulative S1
budget line), budget_report.{json,md}.
"""

import argparse
import json
import sys

import numpy as np
import pandas as pd

from lib.budget import (
    class_median_curve, deficit_yield_loss, fraction_from_kcb, pump_energy_kwh, seasonal_blue,
    status, target_factor, wetted_fraction_ke,
)
from lib.config import load_config, step_output_dir
from lib.et import cumulative_blue, irrigation_wetting, soil_evaporation
from lib.fao56 import effective_rain


def matrices(cfg: dict, year: int, field_et: pd.DataFrame) -> dict:
    """(fields, days) Kcb and ET from stage 8, ET0 / precipitation of each field's weather cell."""
    daily = pd.read_parquet(step_output_dir(cfg, "08_et") / f"daily_et_{year}.parquet",
                            columns=["field_id", "date", "kcb", "et_mm"])
    daily["date"] = pd.to_datetime(daily["date"])
    kcb = daily.pivot(index="field_id", columns="date", values="kcb").loc[field_et["field_id"]]
    et = daily.pivot(index="field_id", columns="date", values="et_mm").loc[field_et["field_id"]]
    days = kcb.columns
    w = pd.read_parquet(step_output_dir(cfg, "07_et0") / "weather.parquet")
    w["date"] = pd.to_datetime(w["date"])
    w = w[w["date"].isin(days)]
    et0 = w.pivot(index="cell_id", columns="date", values="et0_mm")[days].loc[field_et["cell_id"]]
    p = w.pivot(index="cell_id", columns="date", values="precip_mm")[days].loc[field_et["cell_id"]]
    return {"kcb": kcb.to_numpy(float), "et": et.to_numpy(float), "et0": et0.to_numpy(float),
            "p": p.to_numpy(float), "days": days}


def blue_of(kcb, kcb_max, et0, peff, rain_wet, irrigated, fw, ecfg) -> tuple[np.ndarray, ...]:
    """Blue ET (mm), crop-period ET and daily cumulative blue ET (as stage 8) for a Kcb curve
    with irrigation wetting a fraction fw."""
    se = ecfg["soil_evaporation"]
    frac = fraction_from_kcb(kcb, ecfg["kcb_min"], kcb_max)
    irr_wet = irrigation_wetting(kcb, irrigated, se["irrigation_interval_days"], se["crop_present_kcb"])
    ke_rain = soil_evaporation(kcb, frac, rain_wet, se["kc_max"], se["decay_days"])
    ke_full = soil_evaporation(kcb, frac, rain_wet | irr_wet, se["kc_max"], se["decay_days"])
    et = (kcb + wetted_fraction_ke(ke_rain, ke_full, fw)) * et0
    cropped = kcb > ecfg["crop_present_kcb"]
    return (seasonal_blue(et, peff, cropped), (et * cropped).sum(axis=1),
            cumulative_blue(et * cropped, peff * cropped))


def season(cfg: dict, year: int) -> tuple[pd.DataFrame, pd.DataFrame]:
    bcfg, ecfg = cfg["budget"], cfg["et"]
    rule = cfg["weather"]["effective_rain"]
    fe = pd.read_parquet(step_output_dir(cfg, "08_et") / f"field_et_{year}.parquet")
    m = matrices(cfg, year, fe)
    peff = effective_rain(m["p"], rule["threshold_mm"], rule["factor"])
    rain_wet = m["p"] >= ecfg["soil_evaporation"]["rain_wetting_mm"]
    classes = fe["class"].to_numpy()
    rainfed = fe["class"].isin(ecfg["rainfed_classes"]).to_numpy()
    irrigated = ~rainfed
    kcb_max = fe["class"].map(ecfg["kcb_max"]).to_numpy(float)
    area = fe["area_ha"].to_numpy()

    # Consistency: stage 8 blue reproduced from its own daily Kcb (fw = 1 is the stage 8 model)
    own_blue, own_et, _ = blue_of(m["kcb"], kcb_max, m["et0"], peff, rain_wet, irrigated, 1.0, ecfg)
    diff = np.abs(own_blue - fe["blue_mm"].to_numpy())[irrigated]
    print(f"  {year}: stage 8 blue reproduced, max abs diff {diff.max():.2f} mm", file=sys.stderr)

    if bcfg["reference_kcb"] == "class_median":
        kcb_ref = class_median_curve(m["kcb"], classes, ~fe["uncertain"].to_numpy())
    else:
        kcb_ref = m["kcb"]
    fw = bcfg["efficient_fw"]
    ref_blue, _, ref_cum = blue_of(kcb_ref, kcb_max, m["et0"], peff, rain_wet, irrigated, fw, ecfg)
    drip_own_blue, _, _ = blue_of(m["kcb"], kcb_max, m["et0"], peff, rain_wet, irrigated, fw, ecfg)

    out = fe[["field_id", "class", "uncertain", "area_ha", "blue_mm", "blue_mm_low", "blue_mm_high",
              "blue_m3"]].copy()
    out["season"] = year
    out["assessed"] = irrigated
    out["reference_mm"] = np.where(irrigated, ref_blue, np.nan).round(1)
    out["budget_s1_mm"] = out["reference_mm"]
    ref_m3 = np.where(irrigated, ref_blue * area * 10, 0.0)
    k = target_factor(ref_m3, float(out.loc[irrigated, "blue_m3"].sum()), bcfg["s2_reduction"])
    out["budget_s2_mm"] = (out["reference_mm"] * k).round(1)
    for sc in ("s1", "s2"):
        budget = out[f"budget_{sc}_mm"].to_numpy()
        with np.errstate(invalid="ignore", divide="ignore"):
            for suf in ("", "_low", "_high"):
                ratio = np.where(irrigated & (budget > 0), out[f"blue_mm{suf}"] / budget, np.nan)
                out[f"ratio_{sc}{suf}"] = np.round(ratio, 3)
        out[f"status_{sc}"] = status(out[f"ratio_{sc}"], bcfg["status_within"], bcfg["status_limit"])

    # Levers
    out["lever_evap_mm"] = np.where(irrigated, np.maximum(own_blue - drip_own_blue, 0), np.nan).round(1)
    d = bcfg["deficit_et_reduction"]
    out["lever_deficit_mm"] = np.where(irrigated, np.minimum(d * own_et, out["blue_mm"]), np.nan).round(1)
    out["lever_deficit_yield_loss"] = [
        round(deficit_yield_loss(bcfg["ky"][c], d), 3) if irr and c in bcfg["ky"] else np.nan
        for c, irr in zip(classes, irrigated)]
    med = out[irrigated & ~out["uncertain"]].groupby("class")["blue_mm"].median()
    target = out["class"].map(bcfg["crop_switch"])
    out["lever_switch_to"] = target
    out["lever_switch_mm"] = np.where(target.notna(), out["blue_mm"] - target.map(med), np.nan).round(1)
    for col in ("lever_evap", "lever_deficit", "lever_switch"):
        out[f"{col}_m3"] = (out[f"{col}_mm"] * out["area_ha"] * 10).round(0)

    # Pump energy, measured and at the S1 budget
    eff = bcfg["irrigation_efficiency"][bcfg["default_method"]]
    out["energy_kwh"] = pump_energy_kwh(out["blue_m3"], bcfg["head_m"], bcfg["pump_efficiency"], eff).round(0)
    out["energy_s1_kwh"] = pump_energy_kwh(np.nan_to_num(out["budget_s1_mm"]) * out["area_ha"] * 10,
                                           bcfg["head_m"], bcfg["pump_efficiency"], eff).round(0)
    out["s2_factor"] = round(k, 4)
    # Daily cumulative S1 budget line for the field charts (S2 line = S1 line · s2_factor)
    ref_cum = np.where(irrigated[:, None], ref_cum, np.nan)
    daily = pd.DataFrame({"field_id": np.repeat(out["field_id"].to_numpy(), len(m["days"])),
                          "date": np.tile(m["days"].to_numpy(), len(out)),
                          "cum_budget_s1_mm": ref_cum.ravel().astype(np.float32)})
    return out, daily


def summarize(df: pd.DataFrame, cfg: dict) -> dict:
    bcfg = cfg["budget"]
    a = df[df["assessed"]]
    mm3 = lambda col: round(float((a[col] * a["area_ha"] * 10).sum()) / 1e6, 2)  # noqa: E731
    s = {"fields_assessed": int(len(a)), "fields_not_assessed": int((~df["assessed"]).sum()),
         "measured_blue_mm3": round(float(a["blue_m3"].sum()) / 1e6, 2),
         "s1_budget_mm3": mm3("budget_s1_mm"), "s2_budget_mm3": mm3("budget_s2_mm"),
         "s2_factor": float(df["s2_factor"].iloc[0])}
    for sc in ("s1", "s2"):
        counts = a[f"status_{sc}"].value_counts().to_dict()
        area = a.groupby(f"status_{sc}")["area_ha"].sum().round(0).to_dict()
        s[f"status_{sc}"] = {"fields": counts, "area_ha": area}
    s["classes"] = {}
    for cl, g in a.groupby("class"):
        s["classes"][cl] = {
            "fields": int(len(g)), "measured_mm_median": round(float(g["blue_mm"].median())),
            "reference_mm_median": round(float(g["reference_mm"].median())),
            "ratio_s1_median": round(float(g["ratio_s1"].median()), 2),
            "over_s1_share": round(float((g["status_s1"] == "over").mean()), 3),
            "over_s2_share": round(float((g["status_s2"] == "over").mean()), 3),
            "lever_evap_mm_median": round(float(g["lever_evap_mm"].median())),
            "lever_deficit_mm_median": round(float(g["lever_deficit_mm"].median())),
            "lever_switch_mm_median": (round(float(g["lever_switch_mm"].median()))
                                       if g["lever_switch_mm"].notna().any() else None),
            "yield_loss_deficit": (float(g["lever_deficit_yield_loss"].iloc[0])
                                   if g["lever_deficit_yield_loss"].notna().any() else None),
        }
    s["levers_mm3"] = {c: round(float(a[f"lever_{c}_m3"].clip(lower=0).sum()) / 1e6, 2)
                       for c in ("evap", "deficit", "switch")}
    s["energy_gwh"] = round(float(a["energy_kwh"].sum()) / 1e6, 1)
    s["energy_s1_gwh"] = round(float(a["energy_s1_kwh"].sum()) / 1e6, 1)
    s["energy_assumptions"] = {"method": bcfg["default_method"],
                               "irrigation_efficiency": bcfg["irrigation_efficiency"][bcfg["default_method"]],
                               "head_m": bcfg["head_m"], "pump_efficiency": bcfg["pump_efficiency"]}
    return s


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    scfg = cfg["seasons"]
    out_dir = step_output_dir(cfg, "11_budget")
    names = cfg["labels"]["classes"]
    report = {"parameters": cfg["budget"], "seasons": {}}
    lines = []
    for year in (scfg["main"], scfg["comparison"]):
        df, daily = season(cfg, year)
        df.to_parquet(out_dir / f"budget_{year}.parquet", index=False)
        daily.to_parquet(out_dir / f"daily_budget_{year}.parquet", index=False)
        s = summarize(df, cfg)
        report["seasons"][str(year)] = s
        lines += [f"## {year}",
                  f"Assessed {s['fields_assessed']} irrigated fields ({s['fields_not_assessed']} rainfed / fallow "
                  f"not assessed). Blue water: measured {s['measured_blue_mm3']} Mm³, S1 reference "
                  f"{s['s1_budget_mm3']} Mm³, S2 budget {s['s2_budget_mm3']} Mm³ (k {s['s2_factor']}).",
                  f"Status S1: {s['status_s1']['fields']}",
                  f"Status S2: {s['status_s2']['fields']}",
                  f"Levers (pilot, Mm³): soil evaporation {s['levers_mm3']['evap']}, deficit "
                  f"{s['levers_mm3']['deficit']}, crop change {s['levers_mm3']['switch']}",
                  f"Pump energy {s['energy_gwh']} GWh (at S1 {s['energy_s1_gwh']} GWh), assumptions "
                  f"{s['energy_assumptions']}", "",
                  "| Class | Fields | Measured mm | Reference mm | Ratio S1 | Over S1 | Over S2 | Evap lever mm "
                  "| Deficit lever mm (yield loss) | Switch lever mm |",
                  "|---|---|---|---|---|---|---|---|---|---|"]
        for cl, c in s["classes"].items():
            yl = f" ({c['yield_loss_deficit']:.0%})" if c["yield_loss_deficit"] is not None else " (Ky n/a)"
            lines.append(f"| {names.get(cl, cl)} | {c['fields']} | {c['measured_mm_median']} | "
                         f"{c['reference_mm_median']} | {c['ratio_s1_median']} | {c['over_s1_share']:.0%} | "
                         f"{c['over_s2_share']:.0%} | {c['lever_evap_mm_median']} | "
                         f"{c['lever_deficit_mm_median']}{yl} | {c['lever_switch_mm_median']} |")
        lines.append("")
    (out_dir / "budget_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str),
                                               encoding="utf-8")
    md = "\n".join(lines)
    (out_dir / "budget_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Step 10: basin water-storage context, GRACE / GRACE-FO minus GLDAS (PLAN.md stage 10).

Usage: python -u 10_basin_context.py [--config config.yaml] [--force]
1. Monthly basin-mean total water storage anomaly (TWSA, cm) from the JPL mascon CRI product
   (main), the unfiltered mascon (sensitivity) and the CSR / GFZ / JPL spherical-harmonic
   solutions (GRACE period only), with the monthly mascon uncertainty.
2. Monthly basin-mean GLDAS Noah soil moisture (0-200 cm), snow and canopy water, cached in
   outputs/10_basin/gldas_monthly.parquet.
3. Groundwater anomaly GWSA = TWSA - (SM + SWE + CW anomalies), all against the same baseline.
4. Trends with seasonal harmonics: whole record, GRACE and GRACE-FO separately; volume over
   the basin area. Uncertainty: regression SE (autocorrelation-inflated) and a Monte Carlo of
   the monthly GRACE uncertainty; product spread reported separately.
Outputs (outputs/10_basin/): basin_series.parquet, basin.json, basin_report.md, basin_storage.png.
Subsidence: EGMS does not cover Türkiye (PLAN.md D9); no layer, literature only (stage 15).
"""

import argparse
import json
import sys
from datetime import date

import numpy as np
import pandas as pd

from lib.basin import anomaly, cm_per_year_to_km3, decimal_year, fit_trend
from lib.config import load_config, step_output_dir
from lib.ee_utils import init_ee

SH_BANDS = ["lwe_thickness_csr", "lwe_thickness_gfz", "lwe_thickness_jpl"]


def basin_geometry(ee, cfg: dict):
    gj = json.loads((step_output_dir(cfg, "01_aoi") / "aoi_basin.geojson").read_text(encoding="utf-8"))
    return ee.Geometry(gj["features"][0]["geometry"], None, False)


def grace_series(ee, collection_id: str, bands: list[str], basin, scale: int) -> pd.DataFrame:
    """Basin mean per image, dated at the middle of the image's time span."""
    def per_image(img):
        mean = img.select(bands).reduceRegion(ee.Reducer.mean(), basin, scale, maxPixels=1e9)
        mid = ee.Number(img.get("system:time_start")).add(img.get("system:time_end")).divide(2)
        return ee.Feature(None, mean).set("t_ms", mid)

    feats = ee.ImageCollection(collection_id).map(per_image).getInfo()["features"]
    df = pd.DataFrame([f["properties"] for f in feats])
    df["date"] = pd.to_datetime(df.pop("t_ms"), unit="ms").dt.normalize()
    return df.sort_values("date").reset_index(drop=True)


def gldas_year(ee, cfg: dict, basin, year: int) -> list[dict]:
    bcfg = cfg["basin"]
    col = ee.ImageCollection(bcfg["gldas_id"]).select(bcfg["gldas_bands"])

    def per_month(m):
        start = ee.Date.fromYMD(year, ee.Number(m), 1)
        mean = col.filterDate(start, start.advance(1, "month")).mean().reduceRegion(
            ee.Reducer.mean(), basin, bcfg["gldas_scale_m"], maxPixels=1e9)
        return ee.Feature(None, mean).set("month", m)

    feats = ee.FeatureCollection(ee.List.sequence(1, 12).map(per_month)).getInfo()["features"]
    return [{"date": date(year, int(f["properties"].pop("month")), 15), **f["properties"]} for f in feats]


def gldas_series(ee, cfg: dict, basin, last: pd.Timestamp, out_dir, force: bool) -> pd.DataFrame:
    path = out_dir / "gldas_monthly.parquet"
    cached = pd.read_parquet(path) if path.exists() and not force else pd.DataFrame(columns=["date"])
    have = set(pd.to_datetime(cached["date"]).dt.year) if len(cached) else set()
    rows = []
    for year in range(pd.Timestamp(cfg["basin"]["start"]).year, last.year + 1):
        if year in have and (year < last.year or len(cached[pd.to_datetime(cached["date"]).dt.year == year]) == 12):
            continue
        print(f"  GLDAS {year}", file=sys.stderr)
        rows += gldas_year(ee, cfg, basin, year)
    if rows:
        new = pd.DataFrame(rows)
        new["date"] = pd.to_datetime(new["date"])
        keep = cached[~pd.to_datetime(cached["date"]).dt.year.isin(new["date"].dt.year)] if len(cached) else None
        cached = pd.concat([keep, new], ignore_index=True) if keep is not None else new
        cached = cached.sort_values("date").reset_index(drop=True)
        cached.to_parquet(path, index=False)
    cached["date"] = pd.to_datetime(cached["date"])
    return cached


def mission(d: pd.Series, bcfg: dict) -> pd.Series:
    return np.where(d < pd.Timestamp(bcfg["grace_end"]), "GRACE",
                    np.where(d >= pd.Timestamp(bcfg["fo_start"]), "GRACE-FO", "gap"))


def trend_entry(df: pd.DataFrame, col: str, area: float, mc: int = 0, unc_col: str | None = None,
                seed: int = 0) -> dict:
    d = df.dropna(subset=[col])
    t = decimal_year(d["date"])
    fit = fit_trend(t, d[col].to_numpy())
    out = {"slope_cm_yr": round(fit["slope"], 3), "se_cm_yr": round(fit["se"], 3), "r1": round(fit["r1"], 2),
           "months": fit["n"], "from": d["date"].min().strftime("%Y-%m"), "to": d["date"].max().strftime("%Y-%m"),
           "annual_amplitude_cm": round(fit["amplitude_annual"], 2)}
    se_total = fit["se"]
    if mc and unc_col:
        rng = np.random.default_rng(seed)
        y, u = d[col].to_numpy(), d[unc_col].to_numpy()
        slopes = [fit_trend(t, y + rng.normal(0, u))["slope"] for _ in range(mc)]
        out["se_mc_cm_yr"] = round(float(np.std(slopes)), 3)
        se_total = float(np.hypot(fit["se"], np.std(slopes)))
    out["ci95_cm_yr"] = [round(fit["slope"] - 1.96 * se_total, 3), round(fit["slope"] + 1.96 * se_total, 3)]
    out["km3_yr"] = round(cm_per_year_to_km3(fit["slope"], area), 3)
    out["ci95_km3_yr"] = [round(cm_per_year_to_km3(v, area), 3) for v in out["ci95_cm_yr"]]
    return out


def plot(series: pd.DataFrame, report: dict, bcfg: dict, path) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    ink, muted, grid, surface = "#0b0b0b", "#898781", "#e1e0d9", "#fcfcfb"
    fig, ax = plt.subplots(figsize=(11, 4.8), facecolor=surface)
    ax.set_facecolor(surface)
    ax.axvspan(pd.Timestamp(bcfg["grace_end"]), pd.Timestamp(bcfg["fo_start"]), color=grid, lw=0)
    ax.text(pd.Timestamp("2017-12-01"), 0.97, "GRACE → GRACE-FO\nveri boşluğu", transform=ax.get_xaxis_transform(),
            ha="center", va="top", fontsize=8, color=muted)
    for col, color, label in [("twsa_cm", "#2a78d6", "Toplam su (TWSA)"),
                              ("gwsa_cm", "#eb6834", "Yeraltı suyu (GWSA)")]:
        for _, seg in series.groupby("mission"):
            if seg["mission"].iloc[0] == "gap":
                continue
            ax.plot(seg["date"], seg[col], color=color, lw=1.6, label=label)
            label = None
    # Groundwater trend per mission: the decline is not uniform over the record
    for key, name, label_y in [("grace", "GRACE", -20.0), ("grace_fo", "GRACE-FO", 12.0)]:
        seg = series[(series["mission"] == name)].dropna(subset=["gwsa_cm"])
        tr = report["trends"]["gwsa_main"][key]
        t = pd.to_datetime([seg["date"].min(), seg["date"].max()])
        ty = decimal_year(t)
        fit = fit_trend(decimal_year(seg["date"]), seg["gwsa_cm"].to_numpy())
        y = fit["intercept"] + fit["slope"] * (ty - fit["t0"])
        ax.plot(t, y, color=ink, lw=1, ls="--")
        ax.text(t[0] + pd.Timedelta(days=1500 if key == "grace" else 30), label_y, f"yeraltı suyu eğilimi {tr['slope_cm_yr']:+.1f} cm/yıl "
                f"(%95: {tr['ci95_cm_yr'][0]:+.1f} – {tr['ci95_cm_yr'][1]:+.1f})", color=ink, fontsize=8)
    ax.axhline(0, color=muted, lw=0.6)
    ax.grid(axis="y", color=grid, lw=0.6)
    for s in ("top", "right"):
        ax.spines[s].set_visible(False)
    for s in ("left", "bottom"):
        ax.spines[s].set_color(muted)
    ax.tick_params(colors=muted, labelsize=9)
    ax.set_ylabel("Eşdeğer su kalınlığı anomalisi (cm)", color=muted, fontsize=9)
    ax.set_title("Konya Kapalı Havzası su depolama anomalisi (GRACE/GRACE-FO JPL mascon CRI − GLDAS Noah), "
                 f"taban {bcfg['baseline'][0][:4]}–{int(bcfg['baseline'][1][:4]) - 1}",
                 fontsize=10, color=ink, loc="left")
    ax.legend(frameon=False, fontsize=9, loc="lower left")
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--force", action="store_true", help="refetch GLDAS months")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    bcfg = cfg["basin"]
    out_dir = step_output_dir(cfg, "10_basin")
    ee = init_ee(cfg)
    basin = basin_geometry(ee, cfg)
    area = json.loads((step_output_dir(cfg, "01_aoi") / "aoi_summary.json").read_text(encoding="utf-8"))[
        "basin"]["area_km2"]

    print("GRACE mascon CRI / mascon / SH", file=sys.stderr)
    main_s = grace_series(ee, bcfg["grace_main"], ["lwe_thickness", "uncertainty"], basin, bcfg["grace_scale_m"])
    alt_s = grace_series(ee, bcfg["grace_alt"], ["lwe_thickness"], basin, bcfg["grace_scale_m"])
    sh_s = grace_series(ee, bcfg["grace_sh"], SH_BANDS, basin, bcfg["grace_scale_m"])
    sh_s[SH_BANDS] = sh_s[SH_BANDS] * bcfg["grace_sh_to_cm"]
    for df in (main_s, alt_s, sh_s):
        df["month"] = df["date"].dt.to_period("M")
    s = main_s.rename(columns={"lwe_thickness": "tws_cri", "uncertainty": "unc_cm"})
    s = s.merge(alt_s[["month", "lwe_thickness"]].rename(columns={"lwe_thickness": "tws_mascon"}), on="month", how="left")
    s = s.merge(sh_s[["month", *SH_BANDS]].rename(columns=lambda c: c.replace("lwe_thickness_", "tws_")),
                on="month", how="left")
    s = s[s["date"] >= pd.Timestamp(bcfg["start"])].drop_duplicates("month").reset_index(drop=True)

    gl = gldas_series(ee, cfg, basin, s["date"].max(), out_dir, args.force)
    gl["month"] = gl["date"].dt.to_period("M")
    sm_bands = [b for b in bcfg["gldas_bands"] if b.startswith("SoilMoi")]
    gl["sm_mm"] = gl[sm_bands].sum(axis=1)
    s = s.merge(gl[["month", "sm_mm", "SWE_inst", "CanopInt_inst"]].rename(
        columns={"SWE_inst": "swe_mm", "CanopInt_inst": "cw_mm"}), on="month", how="left")

    base = tuple(bcfg["baseline"])
    for col in ["tws_cri", "tws_mascon", "tws_csr", "tws_gfz", "tws_jpl"]:
        s[col] = anomaly(s[col], s["date"], base)
    for col in ["sm_mm", "swe_mm", "cw_mm"]:
        s[col.replace("_mm", "a_cm")] = anomaly(s[col], s["date"], base) / 10.0
    s["lsm_cm"] = s["sma_cm"] + s["swea_cm"] + s["cwa_cm"]
    s["twsa_cm"] = s["tws_cri"]
    s["gwsa_cm"] = s["tws_cri"] - s["lsm_cm"]
    s["gwsa_mascon_cm"] = s["tws_mascon"] - s["lsm_cm"]
    s["mission"] = mission(s["date"], bcfg)
    s["month"] = s["month"].astype(str)
    s.to_parquet(out_dir / "basin_series.parquet", index=False)

    mc = bcfg["monte_carlo"]
    periods = {"full": s, "grace": s[s["mission"] == "GRACE"], "grace_fo": s[s["mission"] == "GRACE-FO"]}
    trends = {
        "twsa_main": {k: trend_entry(d, "twsa_cm", area, mc, "unc_cm") for k, d in periods.items()},
        "gwsa_main": {k: trend_entry(d, "gwsa_cm", area, mc, "unc_cm") for k, d in periods.items()},
        "lsm": {k: trend_entry(d, "lsm_cm", area) for k, d in periods.items()},
        "gwsa_mascon_unfiltered": {"full": trend_entry(s, "gwsa_mascon_cm", area)},
    }
    grace_only = periods["grace"]
    for c in ["csr", "gfz", "jpl"]:
        g = grace_only.assign(gw=grace_only[f"tws_{c}"] - grace_only["lsm_cm"])
        trends[f"gwsa_sh_{c}"] = {"grace": trend_entry(g, "gw", area)}
    product_slopes_grace = [trends["gwsa_main"]["grace"]["slope_cm_yr"]] + [
        trends[f"gwsa_sh_{c}"]["grace"]["slope_cm_yr"] for c in ["csr", "gfz", "jpl"]]

    missing = pd.period_range(s["month"].min(), s["month"].max(), freq="M").astype(str)
    missing = [m for m in missing if m not in set(s["month"])]
    report = {
        "basin_area_km2": area,
        "series": {"from": s["month"].min(), "to": s["month"].max(), "months": int(len(s)),
                   "missing_months": len(missing), "gap": [bcfg["grace_end"], bcfg["fo_start"]]},
        "baseline": list(base),
        "sources": {"grace": bcfg["grace_main"], "grace_sensitivity": [bcfg["grace_alt"], bcfg["grace_sh"]],
                    "gldas": bcfg["gldas_id"]},
        "trends": trends,
        "gwsa_grace_period_product_range_cm_yr": [min(product_slopes_grace), max(product_slopes_grace)],
        "mean_monthly_grace_uncertainty_cm": round(float(s["unc_cm"].mean()), 2),
        "notes": [
            "GRACE mascon resolution (~3°, ~300 km) is coarser than the basin; values are a basin-scale trend.",
            "GLDAS Noah has no irrigation and no groundwater store; GWSA is a residual.",
            "Surface water (lakes Beyşehir, Tuz Gölü and reservoirs) is not removed and stays in GWSA.",
            "Subsidence: EGMS does not cover Türkiye (D9); no layer, published InSAR studies cited in stage 15.",
        ],
    }
    (out_dir / "basin.json").write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
    plot(s, report, bcfg, out_dir / "basin_storage.png")

    lines = [f"# Basin storage (GRACE/GRACE-FO − GLDAS), {report['series']['from']} – {report['series']['to']}",
             f"Basin area {area:,.0f} km²; {len(s)} months, {len(missing)} missing (incl. the "
             f"{bcfg['grace_end'][:7]} – {bcfg['fo_start'][:7]} gap); baseline {base[0]} – {base[1]}; "
             f"mean monthly GRACE uncertainty {report['mean_monthly_grace_uncertainty_cm']} cm.", "",
             "| Series | Period | Trend cm/yr | 95% CI cm/yr | km³/yr | 95% CI km³/yr | r1 |", "|---|---|---|---|---|---|---|"]
    for key, per in trends.items():
        for p, e in per.items():
            lines.append(f"| {key} | {p} {e['from']}–{e['to']} | {e['slope_cm_yr']} | {e['ci95_cm_yr']} "
                         f"| {e['km3_yr']} | {e['ci95_km3_yr']} | {e['r1']} |")
    lines += ["", f"GWSA GRACE-period trend across products (JPL CRI, CSR, GFZ, JPL SH): "
                  f"{report['gwsa_grace_period_product_range_cm_yr']} cm/yr", ""] + [f"- {n}" for n in report["notes"]]
    md = "\n".join(lines)
    (out_dir / "basin_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

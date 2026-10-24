"""Step 09: SEBAL ET on Landsat overpasses, compared with NDVI-Kc ET field by field (KK5).

Usage: python -u 09_sebal_validation.py [--config config.yaml] [--season 2025]
For every Landsat 8/9 overpass in the season with enough clear sky over the pilot area:
  meteorology at overpass from ERA5-Land hourly (pilot mean), daily from ERA5-Land daily;
  automatic hot / cold anchors on cropland; SEBAL with stability iteration (lib/sebal.py);
  daily ET = EF * Rn24 / λ; field means at 30 m on inner-buffered fields.
Per-overpass results are cached in outputs/09_sebal/scenes/. Then, against the central NDVI-Kc
daily ET of the same date: class bias / RMSE / ratio, a water-stress flag per field, and a
MODIS MOD16 seasonal cross-check. Outputs: field_sebal_<year>.parquet, stress_<year>.parquet,
sebal_report.{json,md}.
"""

import argparse
import json
import sys
from dataclasses import dataclass
from datetime import datetime, timezone

import numpy as np
import pandas as pd
from rasterio import features

from lib import sebal
from lib.aoi import bbox_polygon
from lib.config import load_config, step_output_dir
from lib.ee_utils import init_ee
from lib.fao56 import extraterrestrial_radiation
from lib.ee_download import Grid, fetch_grid, grid_for_bbox
from lib.field_stats import inner_buffered
from lib.fields import load_fields, simplified
from lib.periods import season_bounds


def overpasses(ee, cfg: dict, pilot, year: int) -> list[dict]:
    """Overpasses as (sensor, date) groups: the pilot area can straddle two scenes of one pass."""
    scfg, bcfg = cfg["seasons"], cfg["sebal"]
    start, end = season_bounds(year, scfg["start_mmdd"], scfg["end_mmdd"])
    col = ee.ImageCollection(bcfg["collections"][0])
    for cid in bcfg["collections"][1:]:
        col = col.merge(ee.ImageCollection(cid))
    col = (col.filterBounds(pilot).filterDate(start.isoformat(), end.isoformat())
           .filter(ee.Filter.lt("CLOUD_COVER", bcfg["max_scene_cloud"])).sort("system:time_start"))
    times = col.aggregate_array("system:time_start").getInfo()
    products = col.aggregate_array("LANDSAT_PRODUCT_ID").getInfo()
    groups: dict[str, dict] = {}
    for t, p in zip(times, products):
        key = f"{p[:4]}_{p[17:25]}"  # e.g. LC08_20250702
        g = groups.setdefault(key, {"key": key, "time_ms": t, "products": []})
        g["products"].append(p)
    return list(groups.values())


def met_scalars(ee, cfg: dict, pilot, time_ms: int) -> dict:
    """Pilot-mean meteorology at overpass (ERA5-Land hourly) and for the day (daily aggregate)."""
    wcfg = cfg["weather"]
    t = ee.Date(time_ms)
    hour = ee.Date.fromYMD(t.get("year"), t.get("month"), t.get("day")).advance(t.get("hour"), "hour")
    hourly = ee.ImageCollection(wcfg["era5_land_hourly_id"]).filterDate(hour, hour.advance(2, "hour"))
    inst = hourly.mean()
    rad = hourly.select(["surface_solar_radiation_downwards_hourly",
                         "surface_thermal_radiation_downwards_hourly"]).mean().divide(3600)
    day = ee.Date.fromYMD(t.get("year"), t.get("month"), t.get("day"))
    daily = ee.ImageCollection(wcfg["era5_land_id"]).filterDate(day, day.advance(1, "day")).first()
    img = ee.Image.cat([
        inst.select(["temperature_2m", "surface_pressure"]),
        inst.select("u_component_of_wind_10m").hypot(inst.select("v_component_of_wind_10m")).rename("u10"),
        rad.rename(["rs_in", "rl_in"]),
        daily.select(["temperature_2m", "surface_solar_radiation_downwards_sum"]).rename(["t_day", "rs_day"]),
    ])
    return img.reduceRegion(ee.Reducer.mean(), pilot, 11132).getInfo()


def anchors(ee, inp, rn, g, cropland, region, acfg: dict, scale: int) -> dict:
    """Mean Ts, Rn-G, zom of the cold and hot anchor pixel sets."""
    stack = inp.addBands(rn.subtract(g).rename("avail")).updateMask(cropland)
    pct = stack.select("ndvi").reduceRegion(
        ee.Reducer.percentile([acfg["cold_ndvi_pct"], acfg["hot_ndvi_pct"]]), region, scale,
        maxPixels=1e9, tileScale=4).getInfo()
    cold_set = stack.updateMask(stack.select("ndvi").gte(pct[f"ndvi_p{acfg['cold_ndvi_pct']}"]))
    hot_set = stack.updateMask(stack.select("ndvi").lte(pct[f"ndvi_p{acfg['hot_ndvi_pct']}"]))
    ts_cold_max = cold_set.select("ts").reduceRegion(
        ee.Reducer.percentile([acfg["cold_ts_pct"]]), region, scale, maxPixels=1e9, tileScale=4)
    ts_hot_min = hot_set.select("ts").reduceRegion(
        ee.Reducer.percentile([acfg["hot_ts_pct"]]), region, scale, maxPixels=1e9, tileScale=4)
    cold = cold_set.updateMask(cold_set.select("ts").lte(ee.Number(ts_cold_max.values().get(0))))
    hot = hot_set.updateMask(hot_set.select("ts").gte(ee.Number(ts_hot_min.values().get(0))))
    mean = ee.Reducer.mean()
    out = ee.Dictionary({
        "cold": cold.select(["ts", "avail", "ndvi"]).reduceRegion(mean, region, scale, maxPixels=1e9, tileScale=4),
        "hot": hot.select(["ts", "avail", "zom", "ndvi"]).reduceRegion(mean, region, scale, maxPixels=1e9, tileScale=4),
    }).getInfo()
    return out


NODATA = -999999


@dataclass
class Zones:
    """Fields rasterized on the SEBAL grid: raster of 1-based field indices (0 = none)."""
    grid: Grid
    raster: np.ndarray
    field_ids: list[str]
    pixels: np.ndarray  # rasterized pixel count per field


def field_zones(cfg: dict, fields) -> Zones:
    grid = grid_for_bbox(cfg["pilot_bbox"], cfg["composites"]["export_crs"], cfg["sebal"]["scale_m"])
    metric = fields.to_crs(grid.crs)
    raster = features.rasterize(
        ((geom, i + 1) for i, geom in enumerate(metric.geometry)),
        out_shape=(grid.height, grid.width), transform=grid.transform, fill=0, dtype="int32",
    )
    pixels = np.bincount(raster.ravel(), minlength=len(fields) + 1)[1:]
    return Zones(grid, raster, list(fields["field_id"]), pixels)


def process_overpass(ee, cfg: dict, pilot, zones, cropland, ov: dict) -> tuple[pd.DataFrame, dict]:
    bcfg = cfg["sebal"]
    # Product ids start with the sensor code that also names the collection (LC08 / LC09)
    collection = next(c for c in bcfg["collections"] if c.split("/")[1] == ov["key"][:4])
    img = (ee.ImageCollection(collection)
           .filter(ee.Filter.inList("LANDSAT_PRODUCT_ID", ov["products"])).mosaic())
    inp = sebal.landsat_inputs(ee, img).clip(pilot)
    clear = inp.select("ts").mask().unmask(0).reduceRegion(
        ee.Reducer.mean(), pilot, 120, maxPixels=1e9).getInfo()["ts"]
    when = datetime.fromtimestamp(ov["time_ms"] / 1000, tz=timezone.utc)
    meta = {"overpass": ov["key"], "products": ov["products"], "date": when.date().isoformat(),
            "clear_fraction": clear}
    if clear < bcfg["min_clear_fraction"]:
        return pd.DataFrame(), {**meta, "skipped": "cloudy"}

    m = met_scalars(ee, cfg, pilot, ov["time_ms"])
    t_air, p_air = m["temperature_2m"], m["surface_pressure"]
    rho = p_air / (287.05 * t_air)
    u200 = sebal.wind_at_blend(m["u10"])
    rn, g = sebal.energy_terms(ee, inp, m["rs_in"], m["rl_in"])
    anc = anchors(ee, inp, rn, g, cropland, pilot, bcfg["anchors"], bcfg["scale_m"])
    cold, hot = anc["cold"], anc["hot"]
    if not cold.get("ts") or not hot.get("ts") or hot["ts"] <= cold["ts"] or hot["avail"] <= 0:
        return pd.DataFrame(), {**meta, "skipped": "anchors", "anchors": anc}
    dt_hot, rah_hot, l_hot = sebal.solve_hot_pixel(hot["avail"], hot["ts"], hot["zom"], u200, rho)
    a, b = sebal.dt_coefficients(cold["ts"], hot["ts"], dt_hot)
    h = sebal.pixel_h(ee, inp.select("ts"), inp.select("zom"), a, b, u200, rho)
    avail = rn.subtract(g)
    ef = avail.subtract(h).divide(avail).clamp(0, bcfg["ef_max"])
    doy = when.timetuple().tm_yday
    lat = sum(cfg["pilot_bbox"][1::2]) / 2
    ra24 = float(extraterrestrial_radiation(lat, doy)) * 1e6 / 86400
    rs24 = m["rs_day"] / 86400
    tau = rs24 / ra24
    rn24 = inp.select("albedo").multiply(-1).add(1).multiply(rs24).subtract(110 * tau)
    t_day_c = m["t_day"] - 273.15
    et24 = ef.multiply(rn24).multiply(86400 / sebal.latent_heat(t_day_c)).rename("et")

    # One request per overpass: the ET map on the 30 m grid, field means computed locally
    arr = fetch_grid(ee, et24.multiply(1000).round().unmask(NODATA), zones.grid, quiet=True)[0]
    valid = (arr != NODATA) & (zones.raster > 0)
    ids = zones.raster[valid]
    n = len(zones.field_ids) + 1
    count = np.bincount(ids, minlength=n)
    total = np.bincount(ids, weights=arr[valid] / 1000.0, minlength=n)
    with np.errstate(invalid="ignore", divide="ignore"):
        mean = total / count
    rows = pd.DataFrame({"field_id": zones.field_ids, "sebal_et_mm": mean[1:],
                         "n_pixels": count[1:]})
    rows.loc[rows["n_pixels"] == 0, "sebal_et_mm"] = np.nan
    rows["date"] = when.date()
    rows["overpass"] = ov["key"]
    meta.update({
        "met": m, "rho": rho, "u200": u200, "anchors": anc, "dt_hot": dt_hot, "rah_hot": rah_hot,
        "L_hot": l_hot, "a": a, "b": b, "rs24_wm2": rs24, "tau_sw": tau,
    })
    return rows, meta


def modis_season_mm(ee, cfg: dict, pilot, cropland, year: int) -> float:
    scfg = cfg["seasons"]
    start, end = season_bounds(year, scfg["start_mmdd"], scfg["end_mmdd"])
    col = ee.ImageCollection(cfg["sebal"]["modis_id"]).filterDate(start.isoformat(), end.isoformat())
    total = col.select("ET").sum().multiply(0.1).updateMask(cropland)
    return total.reduceRegion(ee.Reducer.mean(), pilot, 500, maxPixels=1e9).getInfo()["ET"]


def compare(cfg: dict, year: int, sebal_rows: pd.DataFrame, zones: Zones) -> tuple[dict, pd.DataFrame]:
    bcfg = cfg["sebal"]
    et_dir = step_output_dir(cfg, "08_et")
    daily = pd.read_parquet(et_dir / f"daily_et_{year}.parquet", columns=["field_id", "date", "et_mm", "kcb"])
    daily["date"] = pd.to_datetime(daily["date"]).dt.date
    field_et = pd.read_parquet(et_dir / f"field_et_{year}.parquet")
    exp_map = dict(zip(zones.field_ids, zones.pixels))
    s = sebal_rows.dropna(subset=["sebal_et_mm"]).copy()
    s["valid_share"] = s["n_pixels"] / s["field_id"].map(exp_map)
    s = s[(s["n_pixels"] >= bcfg["min_field_pixels"]) & (s["valid_share"] >= bcfg["min_field_valid"])]
    m = s.merge(daily, on=["field_id", "date"]).merge(field_et[["field_id", "class"]], on="field_id")
    m["cropped"] = m["kcb"] > cfg["et"]["crop_present_kcb"]

    def stats(d: pd.DataFrame) -> dict:
        if d.empty:
            return {"n": 0}
        diff = d["et_mm"] - d["sebal_et_mm"]
        return {"n": int(len(d)), "fields": int(d["field_id"].nunique()),
                "ndvikc_mean": round(float(d["et_mm"].mean()), 2),
                "sebal_mean": round(float(d["sebal_et_mm"].mean()), 2),
                "bias_mm": round(float(diff.mean()), 2),
                "rmse_mm": round(float(np.sqrt((diff**2).mean())), 2),
                "ratio_sebal_to_ndvikc": round(float(d["sebal_et_mm"].sum() / d["et_mm"].sum()), 3),
                "r": round(float(np.corrcoef(d["et_mm"], d["sebal_et_mm"])[0, 1]), 3) if len(d) > 2 else None}

    by_class = {cl: {"all": stats(g), "cropped": stats(g[g["cropped"]])} for cl, g in m.groupby("class")}
    crop = m[m["cropped"] & (m["et_mm"] > 1)].copy()
    crop["ratio"] = crop["sebal_et_mm"] / crop["et_mm"]
    agg = crop.groupby("field_id")["ratio"].agg(["median", "size"])
    stress = (agg["median"] < bcfg["stress_ratio"]) & (agg["size"] >= bcfg["stress_min_obs"])
    stress_df = pd.DataFrame({"field_id": agg.index, "season": year, "sebal_ratio_median": agg["median"].round(3),
                              "sebal_obs": agg["size"], "stress_flag": stress.to_numpy()})
    stress_share = (stress_df.merge(field_et[["field_id", "class"]], on="field_id")
                    .groupby("class")["stress_flag"].mean().round(3).to_dict())
    return {"overall": {"all": stats(m), "cropped": stats(m[m["cropped"]])}, "classes": by_class,
            "stress_share_by_class": stress_share,
            "fields_with_obs": int(agg.shape[0]), "stress_fields": int(stress.sum())}, stress_df


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--config", default=None)
    parser.add_argument("--season", type=int, action="append", help="limit to season(s)")
    args = parser.parse_args()
    sys.stdout.reconfigure(encoding="utf-8")

    cfg = load_config(args.config)
    scfg, acfg = cfg["seasons"], cfg["aoi"]
    years = args.season or [scfg["main"], scfg["comparison"]]
    out_dir = step_output_dir(cfg, "09_sebal")
    scene_dir = out_dir / "scenes"
    scene_dir.mkdir(exist_ok=True)
    ee = init_ee(cfg)
    pilot = ee.Geometry(bbox_polygon(cfg["pilot_bbox"]), None, False)
    cropland = ee.ImageCollection(acfg["worldcover_id"]).first().eq(acfg["cropland_class"])
    fields = inner_buffered(simplified(load_fields(cfg), cfg["labels"]["simplify_m"]),
                            cfg["features"]["inner_buffer_m"], cfg["features"]["min_buffered_ha"])
    zones = field_zones(cfg, fields)

    report = {"seasons": {}}
    for year in years:
        ovs = overpasses(ee, cfg, pilot, year)
        print(f"{year}: {len(ovs)} candidate overpasses", file=sys.stderr)
        metas, frames = [], []
        for i, ov in enumerate(ovs):
            cache = scene_dir / f"{ov['key']}.parquet"
            meta_path = scene_dir / f"{ov['key']}.json"
            if meta_path.exists():
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                rows = pd.read_parquet(cache) if cache.exists() else pd.DataFrame()
            else:
                rows, meta = process_overpass(ee, cfg, pilot, zones, cropland, ov)
                if not rows.empty:
                    rows.to_parquet(cache, index=False)
                meta_path.write_text(json.dumps(meta, indent=1, default=str), encoding="utf-8")
            metas.append(meta)
            if not rows.empty:
                rows["date"] = pd.to_datetime(rows["date"]).dt.date
                frames.append(rows)
            print(f"  [{i + 1}/{len(ovs)}] {meta['date']} clear {meta['clear_fraction']:.2f} "
                  f"{meta.get('skipped', 'ok')}", file=sys.stderr)
        sebal_rows = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()
        sebal_rows.to_parquet(out_dir / f"field_sebal_{year}.parquet", index=False)
        comp, stress_df = compare(cfg, year, sebal_rows, zones)
        stress_df.to_parquet(out_dir / f"stress_{year}.parquet", index=False)
        field_et = pd.read_parquet(step_output_dir(cfg, "08_et") / f"field_et_{year}.parquet")
        report["seasons"][str(year)] = {
            "overpasses_used": sum(1 for mt in metas if "skipped" not in mt),
            "overpasses_skipped": {k: sum(1 for mt in metas if mt.get("skipped") == k) for k in ("cloudy", "anchors")},
            "comparison": comp,
            "modis_mod16_season_mm_cropland": round(modis_season_mm(ee, cfg, pilot, cropland, year), 1),
            "ndvikc_season_et_mm_area_weighted": round(float(np.average(
                field_et["et_mm"], weights=field_et["area_ha"])), 1),
        }
    (out_dir / "sebal_report.json").write_text(json.dumps(report, indent=2, ensure_ascii=False, default=str),
                                              encoding="utf-8")
    names = cfg["labels"]["classes"]
    lines = []
    for y, s in report["seasons"].items():
        o = s["comparison"]["overall"]["cropped"]
        lines += [f"## {y}: {s['overpasses_used']} overpasses used, skipped {s['overpasses_skipped']}",
                  f"Cropped days overall: SEBAL/NDVI-Kc ratio {o.get('ratio_sebal_to_ndvikc')}, bias "
                  f"{o.get('bias_mm')} mm/day, RMSE {o.get('rmse_mm')}, r {o.get('r')}, n {o.get('n')}",
                  f"MODIS MOD16 season ET on cropland {s['modis_mod16_season_mm_cropland']} mm vs NDVI-Kc "
                  f"area-weighted {s['ndvikc_season_et_mm_area_weighted']} mm",
                  f"Water-stress flags: {s['comparison']['stress_fields']} of "
                  f"{s['comparison']['fields_with_obs']} fields", "",
                  "| Class | n (cropped) | NDVI-Kc mm/d | SEBAL mm/d | Ratio | Bias | RMSE | r | Stress share |",
                  "|---|---|---|---|---|---|---|---|---|"]
        for cl, c in s["comparison"]["classes"].items():
            d = c["cropped"]
            if not d.get("n"):
                continue
            lines.append(f"| {names.get(cl, cl)} | {d['n']} | {d['ndvikc_mean']} | {d['sebal_mean']} "
                         f"| {d['ratio_sebal_to_ndvikc']} | {d['bias_mm']} | {d['rmse_mm']} | {d['r']} "
                         f"| {s['comparison']['stress_share_by_class'].get(cl, 0):.0%} |")
        lines.append("")
    md = "\n".join(lines)
    (out_dir / "sebal_report.md").write_text(md, encoding="utf-8")
    print(md)
    return 0


if __name__ == "__main__":
    sys.exit(main())

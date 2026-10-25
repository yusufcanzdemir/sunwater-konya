# Methodology

How every number in the panel and the Telegram messages is produced. All parameters live in
`pipeline/config.yaml` (one source of truth); decision numbers (D1–D22) refer to the decision log
in `PLAN.md`. Validation results are in `docs/VALIDATION.md`, data sources and licences in
`docs/DATA_SOURCES.md`.

Two rules shape the whole method (PLAN.md §1):

- Nothing unmeasured is shown as measured. Every figure comes from a data source or a computation;
  assumptions are labelled "varsayım" in the interface.
- Unverified figures are not used. Numbers such as sinkhole counts, groundwater-level declines or
  unlicensed-well counts appear nowhere unless taken from a verified, dated source.

The central quantity is **blue water use (blue ET)**: actual evapotranspiration minus effective
rainfall over the period the crop is in the field. In a closed basin this is the water that is
consumed from groundwater; it is not the pumped volume (pumped water that percolates back is not
consumed and is not seen by satellites).

## 1. Study area

- **Basin:** the Konya Closed Basin as one HydroSHEDS level-5 polygon (the coarsest level where the
  endorheic basin, including the Tuz Gölü and Beyşehir sub-basins, is a single polygon), selected by
  a seed point at Konya city centre; 58,374 km².
- **Pilot area:** bbox 33.30–33.60°E, 37.70–37.90°N, north/north-west of Karapınar, 586 km², of
  which 314 km² (54%) is cropland in ESA WorldCover 2021 (class 40) (D4).
- **Seasons:** 2025 (main) and 2024 (comparison), each 1 March – 31 October (D5).

## 2. Sentinel-2 composites (stage 2)

- Sentinel-2 L2A surface reflectance (`COPERNICUS/S2_SR_HARMONIZED`), cloud-masked with Cloud
  Score+ (`cs_cdf` ≥ 0.6).
- Indices per image: NDVI = (B8 − B4)/(B8 + B4); EVI = 2.5 (B8 − B4)/(B8 + 6 B4 − 7.5 B2 + 1);
  NDMI = (B8 − B11)/(B8 + B11); clamped to [−1, 1].
- Dekadal (days 1–10, 11–20, 21–end) median composites, 24 dekads per season, 10 m, UTM 36N.
  Cloud gaps are filled per pixel by linear interpolation between the nearest clear dekads before
  and after (at the season edges the nearest clear dekad is copied), and every filled pixel-dekad
  keeps a gap code; the share of filled
  values is carried to the field features (`gap_share`).
- Segmentation input: monthly NDVI medians April–September and the July RGB of the main season.

## 3. Field boundaries (stage 3, D10)

- Segment Anything (ViT-H) automatic mask generation on 512 px tiles (128 px overlap) of the 10 m
  pilot image. Input chosen on the tuning half of the reference: NDVI false colour from the May,
  July and August NDVI (`points_per_side` 32, `pred_iou_thresh` 0.86,
  `stability_score_thresh` 0.92).
- Masks are merged across tiles into a label raster, vectorised, and kept when ≥ 0.5 ha and ≥ 50%
  WorldCover cropland; 3,448 fields, median 6.7 ha.
- Reference: 66 hand-drawn fields at random cropland points (odd numbers tune, even numbers test,
  D12). Scored with intersection over union (IoU) of the best-matching segment.
- Alternatives tried and rejected: SNIC superpixels (three sizes) and SNIC with profile/edge-based
  merging (D11).

## 4. Field features (stage 5)

Per field and season, on the polygon shrunk by 10 m (the outer pixel ring mixes with
neighbours; fields smaller than 0.2 ha after shrinking keep the original polygon):

- field median of the gap-filled dekadal NDVI, EVI and NDMI, and the share of filled values;
- second-order harmonic regression coefficients of each index;
- NDVI peak value and day of year, green-season length (NDVI > 0.4), July–August NDMI mean;
- monthly Sentinel-1 VV/VH means (dB), April–September.

2024 uses the 2025 field polygons.

## 5. Crop classes (stage 6, D13–D15)

No ground truth is available, so classes are not trained on labels:

1. Gaussian mixture model (20 components, diagonal covariance) on the dekadal NDVI + NDMI curves
   of both seasons.
2. Each component's mean curve is named by explicit phenology rules (`classify.rules`): fallow
   (never greener than NDVI 0.30), alfalfa (green in April and through summer with ≥ 2 cutting
   dips), winter cereal family (green in May, harvested by June–July), irrigated vs rainfed cereal
   (spring peak NDVI, NDMI), cereal + second crop (re-greening after harvest), sugar beet (still
   green in September–October), sunflower (peak by July, strong drop by end of August), maize.
   These are rules of thumb from the labelling guide, not calibrated thresholds.
3. Class probability = sum of the field's posteriors over components with that class. A field is
   flagged uncertain when the probability is below 0.7 or when the same rules applied to its own
   curve give a different class (13% of fields).

Classes are shown as "estimated from the satellite curve, accuracy not measured" (D15).

## 6. Reference ET and precipitation (stage 7)

- Daily FAO-56 Penman–Monteith reference ET (ET₀) and precipitation from the Open-Meteo historical
  archive at a 0.1° lattice over the pilot area (11 distinct model cells); each field takes the
  cell nearest to its centroid.
- Cross-check: ET₀ recomputed with FAO-56 Penman–Monteith from ERA5-Land daily aggregates
  (hourly wind averaged as speed) at the same cell centres; precipitation compared directly.
- Effective rainfall (same rule as the farmer-side engine, `src/engine/waterBalance.ts`):
  Peff = 0 if P < 5 mm, otherwise 0.8 · P.

## 7. Actual ET and blue water: NDVI-Kc (stage 8, main method, D3, D16)

Per field and day, 1 March – 31 October:

1. Daily NDVI: Savitzky–Golay smoothing over dekads (window 5, order 2), linear interpolation to
   days.
2. Canopy fraction f = (NDVI − NDVI_min) / (NDVI_max − NDVI_min), clamped to [0, 1]. NDVI_min =
   0.078 and NDVI_max = 0.911 are the 2nd and 99th percentiles of all field-dekad NDVI in 2025, used
   for both seasons.
3. Basal crop coefficient Kcb = Kcb_min + (Kcb_max − Kcb_min) · f with Kcb_min = 0.15 and Kcb_max
   by class from FAO-56 Table 17 (sugar beet, maize, alfalfa, cereal + second crop 1.15; winter
   cereals 1.10; sunflower, fallow, other 1.00).
4. Soil evaporation, simplified FAO-56 dual-coefficient form:
   Ke = min(Kr · (Kc_max − Kcb), (1 − f) · Kc_max), Kc_max = 1.20,
   Kr = exp(−days since wetting / 3). The surface is wetted by rain ≥ 5 mm and, for irrigated
   classes while Kcb > 0.30, by irrigation every 7 days (assumption).
5. ET = (Kcb + Ke) · ET₀; no water stress is modelled.
6. Rainfed cereal and fallow: season ET capped at season precipitation + 100 mm initial
   plant-available soil water (assumption); blue ET = 0.
7. Blue ET = max(0, Σ (ET − Peff)) over crop-present days (Kcb > 0.30). Bare-soil evaporation
   before sowing and after harvest is supplied by rain and stored soil water, not groundwater (D16).
8. Range (low / high): NDVI_min and NDVI_max ± 0.05, Kcb_max ∓ 0.10, the daily minimum / maximum
   of the two ET₀ and precipitation sources; the low case also credits the 100 mm initial soil
   water.

Volumes: 1 mm over 1 ha = 10 m³.

## 8. Independent check: SEBAL on Landsat (stage 9, D17)

Own implementation of classic SEBAL (`pipeline/lib/sebal.py`) on every Landsat 8/9 Collection 2
Level-2 overpass with ≥ 50% clear sky over the pilot area:

- Inputs: surface reflectance and land-surface temperature from the L2 product; NDVI, SAVI;
  LAI = −ln((0.69 − SAVI)/0.59)/0.91; broadband albedo from the Liang (2001) narrow-to-broadband
  coefficients (derived for Landsat TM/ETM+, applied to the matching OLI bands);
  emissivity 0.95 + 0.01 · LAI (0.98 for LAI ≥ 3); momentum roughness zom = exp(5.62 · SAVI − 5.809).
- Instantaneous net radiation Rn from ERA5-Land incoming short- and long-wave radiation (pilot
  mean at overpass hour); soil heat flux G/Rn = (Ts − 273.15)/α · (0.0038 α + 0.0074 α²) ·
  (1 − 0.98 NDVI⁴).
- Anchors on WorldCover cropland: cold = NDVI ≥ 95th percentile and LST ≤ 20th percentile among
  them (H = 0); hot = NDVI ≤ 10th percentile and LST ≥ 80th percentile among them (H = Rn − G).
- Sensible heat H = ρ cₚ dT / r_ah with dT = a + b · Ts through the two anchors; Monin–Obukhov
  stability corrections iterated at the hot pixel and per pixel; blending height 200 m, wind from
  ERA5-Land 10 m.
- Evaporative fraction EF = (Rn − G − H)/(Rn − G), clamped to [0, 1.05]; daily
  ET = EF · Rn24 / λ with Rn24 = (1 − α) Rs24 − 110 τsw (daily form used in SEBAL).
- Field means on the 30 m grid inside a 10 m inner buffer (≥ 4 pixels and ≥ 70% valid).

Use (KK5): no calibration factor. The water-stress flag is relative to peers: SEBAL ET of a field
divided by the median of the same class on the same overpass (≥ 10 fields); flagged when the median
of these ratios is below 0.75 (assumption) over ≥ 3 crop-present overpasses; rainfed classes are
not flagged. Cross-check: MODIS MOD16A2GF seasonal ET over cropland.

## 9. Basin water storage: GRACE / GRACE-FO (stage 10, D8, D18)

- Monthly basin-mean total water storage anomaly (TWSA) from the JPL mascon RL06.3Mv04 CRI product
  (0.5° grid of ~3° mascons). Sensitivity: unfiltered JPL mascon; CSR, GFZ and JPL spherical-harmonic
  land grids (GRACE period only; delivered in metres, converted to cm).
- Groundwater storage anomaly GWSA = TWSA − (soil moisture 0–200 cm + snow water + canopy water)
  anomalies from GLDAS-2.1 Noah (monthly means of 3-hourly fields). All anomalies against the
  2004–2009 mean.
- Trend: ordinary least squares with annual and semi-annual harmonics; standard error multiplied by
  √((1 + r₁)/(1 − r₁)) for the lag-1 autocorrelation r₁ of the residuals; combined with the spread
  of trends from 500 Monte Carlo draws of the monthly mascon uncertainty; 95% interval = ±1.96 σ.
  Reported for the whole record and separately for GRACE (2003–2017) and GRACE-FO (2018–2024).
- Volume = trend (cm/yr) × 10⁻⁵ × basin area (km²) → km³/yr.
- Land subsidence: EGMS does not cover Türkiye (D9); no layer, published InSAR studies cited
  instead (`docs/DATA_SOURCES.md`).

## 10. Water budget (stage 11, D19)

- **Reference need** of a field: the day-by-day median Kcb curve of its class (confident fields
  only) with soil evaporation under drip irrigation, where irrigation wets only a fraction
  fw = 0.35 of the soil (FAO-56 Table 20, trickle 0.3–0.4):
  Ke_ref = Ke_rain + fw · (Ke_rain+irrigation − Ke_rain). Blue ET as in §7 with this curve and the
  field's own ET₀ and rainfall.
- **Scenarios:** S0 measured blue ET; S1 budget = reference need; S2 budget = k · reference need,
  with k such that the pilot total is 20% below the measured total (assumption, policy target).
- **Status:** ratio = measured blue ET / budget; ≤ 1.00 within budget, ≤ 1.15 borderline, above
  over budget. Rainfed classes are not assessed. Because satellites see consumption, not
  percolation losses, S1 "over" means "saving potential against efficient irrigation".
- **Levers** (per field): soil evaporation (own Kcb with drip wetting vs measured); deficit
  irrigation (seasonal ET − 10%), with relative yield loss 1 − Ya/Ym = Ky · (1 − ETa/ETm) using
  seasonal Ky only where verified (maize 1.25, sugar beet 0.85 = midpoint of 0.80/0.90,
  sunflower 0.95, winter wheat 1.00; none for alfalfa); crop change (difference to the class
  median blue ET of an alternative crop in the pilot).
- **Pump energy** (same formula as `src/engine/pump.ts`): E = 9.81 · H · (V_blue / η_irr) /
  (3600 · η_pump) kWh with head H = 120 m, η_pump = 0.50 and sprinkler η_irr = 0.72 — all
  assumptions, editable per field.

## 11. Farmer channel (stage 14, D22)

- Linking: the field containing the shared location, otherwise the nearest field centroids within
  1 km; confirmation with an Esri World Imagery snapshot.
- Season summary: measured blue ET (with range), the median of confident fields of the same class,
  and the S1 reference; worded by Gemini under a numeric check (every number in the text must be in
  the payload, no technical terms), otherwise a fixed template; rainfed fields always get the
  template.
- Weekly plan: the existing FAO-56 water-balance and solar-pumping engine
  (`src/engine/`), calibrated with the field's satellite season: planting = first crop-present day
  − the Kc_ini stage length (not before 1 March); development, mid and late stage lengths from the
  days Kcb rises above 0.30, reaches and leaves 90% of its peak, and falls below 0.30; Kc_mid scaled
  by peak Kcb / class Kcb_max. Method, soil, pump and solar values are the demo assumptions.

## 12. Key parameters

| Parameter | Value | Status |
|---|---|---|
| Season | 1 Mar – 31 Oct | decision (D5) |
| Cloud Score+ threshold | cs_cdf ≥ 0.6 | method choice |
| NDVI_min / NDVI_max | 0.078 / 0.911 | measured (pilot percentiles) |
| Kcb_min / Kcb_max | 0.15 / FAO-56 Table 17 by class | literature |
| Kc_max (soil evaporation) | 1.20 | literature (FAO-56) |
| Irrigation wetting interval | 7 days | assumption |
| Initial soil water (rainfed cap) | 100 mm | assumption |
| Effective rain | P ≥ 5 mm → 0.8 P | assumption (prototype rule) |
| Crop-present threshold | Kcb > 0.30 | method choice (D16) |
| SEBAL stress flag | < 0.75 of class-day median, ≥ 3 overpasses | assumption (D17) |
| Drip wetted fraction fw | 0.35 | literature (FAO-56 Table 20) |
| Status thresholds | 1.00 / 1.15 | decision (KK6) |
| S2 reduction | 20% | assumption, policy target (KK6) |
| Pumping head / pump efficiency / irrigation efficiency | 120 m / 0.50 / 0.72 | assumption (KK6) |
| Deficit lever | −10% seasonal ET | scenario |
| Ky (maize, sugar beet, sunflower, wheat) | 1.25, 0.85, 0.95, 1.00 | literature (FAO-33 via FAO/IAEA) |

## References

<!-- REFERENCES -->

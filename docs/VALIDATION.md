# Validation

Accuracy metrics and cross-checks for every model output (PLAN.md rule 4). Sections are added as
stages finish; the "Method and Validation" page in the panel is built from `metrics.json`.

## 1. Field segmentation (stage 3, decision gate KK2)

### Reference data
- 70 random points on ESA WorldCover 2021 cropland in the pilot area (seed 42,
  `pipeline/reference/reference_points.geojson`).
- The field containing each point was drawn by hand in the `/reference` web tool on 2025
  Sentinel-2 composites (NDVI May/Jul/Aug false colour, July RGB) and Esri imagery.
- 66 fields drawn; 4 points skipped (3 not on a field, 1 duplicate of an already drawn field).
  Field sizes: median 9.5 ha, range 1.4–58.8 ha.
- Split: odd point numbers (33) for tuning and method selection, even numbers (33) held out
  for testing. Points are in random order, so the split is random but reproducible.

### Metrics
For each reference field: best-match IoU over all segments (before area/cropland
filtering); over-segmented = more than one segment has at least 50% of its area inside the
field; under-segmented = more than 30% of the best-matching segment lies outside the field.

### Results on the held-out test half (33 fields)

| Method | Mean IoU | Median IoU | IoU ≥ 0.5 | IoU ≥ 0.7 | Over-seg. | Under-seg. |
|---|---|---|---|---|---|---|
| SNIC, size 20 | 0.50 | 0.45 | 39% | 27% | 82% | 12% |
| SNIC, size 30 | 0.60 | 0.65 | 58% | 42% | 48% | 33% |
| SNIC, size 45 | 0.40 | 0.41 | 24% | 6% | 24% | 82% |
| SNIC size 20 + boundary-aware merging (tuned) | 0.57 | 0.58 | 52% | 42% | 52% | 42% |
| **SAM ViT-H, NDVI false colour (selected)** | **0.68** | **0.75** | **73%** | **61%** | 64% | **18%** |
| SAM ViT-H, true colour | 0.72 | 0.89 | 82% | 64% | 73% | 9% |

The SAM input was chosen on the tuning half (false colour 0.685 vs true colour 0.666 mean
IoU) before looking at the test half; the test-half difference between the two inputs is
within the noise of 33 fields, so the pre-registered choice was kept.

### Known limits
- 10 m pixels: boundaries narrower than a pixel are often invisible.
- SAM splits many fields into a main mask plus small in-field masks (over-segmentation 64%).
  This fragments per-field reporting but does not bias total consumption, because ET is
  computed per pixel and summed.
- SAM assigns 93% of cropland pixels to a segment; the rest (edges, very small parcels) is
  not reported as fields.
- 33 test fields give coarse estimates: one field changes a share by about 3 percentage points.

Sources: `pipeline/outputs/03_segmentation/segmentation_report.json`, `merge_report.json`,
`sam_report.json`.

## 2. Crop classification (stages 4–6, PLAN.md D13–D14)

### Method
No ground-truth crop data was available, and manual labelling of 300–500 fields proved too
slow and uncertain for the team (9 fields were labelled blind before the method changed). The
classes are therefore derived without training labels:

1. Gaussian mixture (20 components, diagonal covariance) on the 24-dekad NDVI and NDMI curves
   of all fields in both seasons (2024 uses the 2025 field polygons).
2. Each component's mean curve is named by explicit phenology rules
   (`pipeline/lib/phenology.py`, thresholds in `config.yaml` → `classify.rules`). The
   thresholds are rules of thumb, not calibrated against ground truth.
3. The same rules are applied to every field's own curve. Fields in components whose mean
   matches no rule take their own-curve class; a field is flagged **uncertain** when its
   own-curve class differs from its final class. GMM posteriors are not used as a confidence
   measure, because in 48 dimensions they are almost always 0 or 1.

While inspecting the component means, three rule errors were found and fixed (each now has a
test): cereals harvested in June were missed as cereal + second crop; post-harvest weed
regrowth was read as alfalfa cuts; the averaged curve of alfalfa fields was read as a cereal.

### Results (3,448 fields)

| Class | 2025 fields | 2025 ha | 2024 fields | 2024 ha |
|---|---|---|---|---|
| Maize | 915 | 8,263 | 775 | 7,583 |
| Irrigated winter cereal | 739 | 7,329 | 963 | 8,535 |
| Sugar beet | 670 | 5,833 | 493 | 4,239 |
| Alfalfa | 344 | 2,119 | 283 | 1,824 |
| Cereal + second crop | 300 | 1,746 | 377 | 2,414 |
| Fallow / bare | 181 | 1,298 | 128 | 922 |
| Sunflower | 143 | 1,459 | 206 | 1,905 |
| Rainfed winter cereal | 120 | 617 | 179 | 1,027 |
| Other | 36 | 170 | 44 | 386 |

Uncertain: 12.7% of fields in 2025, 12.5% in 2024. Disagreements concentrate on the expected
hard pairs: sugar beet vs. maize, sunflower vs. maize, rainfed cereal vs. fallow.

### Checks — classification accuracy is NOT measured
- **Blind labels (independent but tiny):** 5 of 8 labels made before the proposals existed
  agree with the final class (95% CI 31–86%). Disagreements: irrigated vs. rainfed cereal,
  sugar beet vs. other, other vs. sugar beet.
- **Plausibility check (not independent):** in 50 random 2025 fields the checker saw the curve
  and images, then the proposal, and answered agree / disagree / unsure: 47 agree, 3 unsure,
  0 disagree. The checker reported accepting some proposals they were unsure about, and seeing
  the proposal can anchor the judgement. The result is reported only as "no obvious errors
  found", not as an agreement rate.
- Consequence for the product: crop classes are shown as "estimated from the satellite curve,
  accuracy not measured"; uncertain fields are marked. Measured water use (stage 8) is computed
  per pixel from NDVI and does not depend on the class; the class affects the reference demand
  and budget (stage 11).
- Improving this requires ground truth (e.g. farmer-reported crops or ÇKS records for a few
  dozen fields).

Sources: `pipeline/outputs/06_classify/classify_report.json`, `cluster_profiles.png`,
`pipeline/04_labels/labels.csv`, `pipeline/04_labels/checks.csv`.

## 3. Reference evapotranspiration and precipitation (stage 7)

Daily FAO-56 grass reference ET0 and precipitation come from the Open-Meteo historical API for
the 11 weather grid cells covering the pilot area (fields are assigned to the nearest cell).
Effective rain uses the web engine's rule: Peff = 0 if P < 5 mm, else 0.8 · P.

Cross-check: FAO-56 Penman–Monteith computed independently from ERA5-Land at the same cells,
with net radiation for the grass reference surface from incoming shortwave (FAO-56 eqs. 37–40)
and wind as the daily mean of hourly speeds. A first version that used ERA5's own net radiation
(bare, hot surface) and daily-mean wind vectors gave 28–33% lower ET0; both are method errors
for a reference ET and were corrected. The FAO-56 functions are tested against the worked
examples 8, 11, 14 and 18 of the FAO-56 manual.

| Season (Mar–Oct) | Open-Meteo ET0 | ERA5-Land PM ET0 | Daily bias | Daily RMSE | r | Open-Meteo P | ERA5-Land P |
|---|---|---|---|---|---|---|---|
| 2025 | 1,324 mm | 1,279 mm | +0.18 mm | 0.40 mm | 0.985 | 113 mm | 135 mm |
| 2024 | 1,356 mm | 1,229 mm | +0.52 mm | 0.65 mm | 0.983 | 131 mm | 186 mm |

- ET0 agrees within 3.5% (2025) and 10% (2024); the difference is carried into the
  uncertainty range of seasonal ET (stage 8).
- Precipitation differs more (19% in 2025, 42% in 2024). Seasonal rain is small next to ET0,
  but it feeds effective rain and therefore blue-water use; stage 8 reports blue ET with both
  sources as a range.

Sources: `pipeline/outputs/07_et0/et0_report.json`.

## 4. Actual ET and blue-water use, NDVI-Kc (stage 8)

Method summary (details in `pipeline/08_et_ndvikc.py` and `config.yaml` → `et`): daily NDVI
(Savitzky–Golay over dekads, linear to days) → Kcb by scaled NDVI between NDVI_min = 0.078 and
NDVI_max = 0.911 (2nd / 99th percentile of all field-dekad NDVI in 2025) and Kcb_min = 0.15 ..
Kcb_max (FAO-56 Table 17 by class) → plus simplified FAO-56 soil evaporation → ET = (Kcb + Ke) ·
ET0, no water stress. Rainfed cereal and fallow are capped at season precipitation + 100 mm
initial soil water and have zero blue ET. Blue ET counts only crop-present days (Kcb > 0.30,
PLAN.md D16).

Seasonal results, 2025 central (low–high): pilot blue water 221 Mm³ (159–261); 2024: 220 Mm³
(143–263). Median blue ET per field, 2025: maize 833 mm, sugar beet 881 mm, irrigated winter
cereal 629 mm, alfalfa 1,322 mm, cereal + second crop 1,013 mm, sunflower 717 mm.

Consistency checks done in this stage:
- Rainfed cereal and fallow: uncapped NDVI-Kc ET exceeded season rain + soil water for all such
  fields, so the cap is active; this shows the bare-soil floor (Kcb_min · ET0) is generous in
  this arid summer. For irrigated fields it no longer enters blue water (D16).
- Diagnostic decomposition (2025 medians): soil evaporation is 15–20% of ET for irrigated
  classes; cereals still show ~120 mm ET in July because dekadal smoothing spreads the harvest.

Known limits (to be checked against SEBAL in stage 9, KK5):
- No water stress: deficit-irrigated or stressed fields are overestimated.
- Irrigation wetting every 7 days while cropped is an assumption; it drives part of Ke.
- Kcb_max is not adjusted for climate (FAO-56 eq. 70); the ±0.10 range covers that adjustment.
- 2024 uses the 2025 field polygons and the 2025 NDVI_min/max.
- Ranges combine NDVI_min/max ± 0.05, Kcb_max ± 0.10, and the daily min/max of the two ET0 and
  precipitation sources; the low scenario also credits the 100 mm initial soil water.

Sources: `pipeline/outputs/08_et/et_report.json`, `field_et_<year>.parquet`.

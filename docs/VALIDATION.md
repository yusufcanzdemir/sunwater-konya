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

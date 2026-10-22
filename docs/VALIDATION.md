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

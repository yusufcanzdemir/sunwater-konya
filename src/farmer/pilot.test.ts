import { describe, expect, it } from 'vitest';
import { checkExplanation } from '../ai/explain';
import { CROPS } from '../engine/crops';
import type { FieldRow } from '../panel/data';
import { buildSummaryPayload, calibratedCrop, distanceM, fieldBbox, findFields, imageryUrl, templateSummary } from './pilot';

const square = (lon: number, lat: number, d = 0.002): [number, number][][] => [
  [
    [lon, lat],
    [lon + d, lat],
    [lon + d, lat + d],
    [lon, lat + d],
    [lon, lat],
  ],
];

describe('findFields', () => {
  const shapes = { A: square(33.4, 37.8), B: square(33.41, 37.8) };
  const centroids = [
    { field_id: 'A', lon: 33.401, lat: 37.801 },
    { field_id: 'B', lon: 33.411, lat: 37.801 },
  ];

  it('puts the field containing the point first, then the nearest', () => {
    expect(findFields(shapes, centroids, 33.4005, 37.8005)).toEqual(['A', 'B']);
    expect(findFields(shapes, centroids, 33.4105, 37.8015)).toEqual(['B', 'A']);
  });

  it('is empty far from every field', () => {
    expect(findFields(shapes, centroids, 33.0, 37.0)).toEqual([]);
  });

  it('distance is metric', () => {
    expect(distanceM(33.4, 37.8, 33.4, 37.809)).toBeCloseTo(1000, -1);
  });
});

describe('fieldBbox / imageryUrl', () => {
  it('pads around the field and builds an Esri export URL', () => {
    const [w, s, e, n] = fieldBbox(square(33.4, 37.8));
    expect(w).toBeLessThan(33.4);
    expect(n).toBeGreaterThan(37.802);
    expect(imageryUrl([w, s, e, n])).toContain('World_Imagery/MapServer/export?bbox=');
  });
});

describe('calibratedCrop', () => {
  it('takes planting date and stage lengths from the satellite calendar', () => {
    const cal = { cal_start: 60, cal_mid_start: 110, cal_mid_end: 170, cal_end: 215, kcb_peak: 1.15 };
    const r = calibratedCrop(CROPS.sugar_beet, cal, 1.15, '03-01', 2026)!;
    expect(r.plantingDate).toBe('2026-03-31'); // Mar 1 + (60 − Kc_ini 30) days
    expect(r.crop.stages).toEqual({ ini: 30, dev: 50, mid: 60, late: 45 });
    expect(r.crop.kcMid).toBe(CROPS.sugar_beet.kcMid);
  });

  it('a sparse canopy lowers Kc_mid; early crops are not planted before the season start', () => {
    const r = calibratedCrop(CROPS.wheat, { cal_start: 0, cal_mid_start: 40, cal_mid_end: 90, cal_end: 130, kcb_peak: 0.55 }, 1.1, '03-01', 2026)!;
    expect(r.plantingDate).toBe('2026-03-01');
    expect(r.crop.kcMid).toBeCloseTo(CROPS.wheat.kcMid * 0.5, 1); // rounded to 2 decimals
    expect(r.crop.stages.ini).toBe(10);
  });

  it('null when the field never showed a crop', () => {
    expect(calibratedCrop(CROPS.maize, { cal_start: -1, cal_mid_start: -1, cal_mid_end: -1, cal_end: -1, kcb_peak: null }, 1.15, '03-01', 2026)).toBeNull();
  });
});

const row = (over: Partial<FieldRow>): FieldRow =>
  ({
    field_id: 'F1',
    class: 'sugar_beet',
    class_prob: 1,
    uncertain: false,
    area_ha: 7.9,
    assessed: true,
    blue_mm: 912.4,
    blue_mm_low: 700.2,
    blue_mm_high: 1010.9,
    blue_m3: 72_080,
    reference_mm: 842.3,
    status_s1: 'borderline',
    stress_flag: false,
    ...over,
  }) as FieldRow;

describe('season summary', () => {
  const names = { sugar_beet: 'Şeker pancarı', rainfed_winter_cereal: 'Kuru kışlık tahıl' };
  const all = [row({}), row({ field_id: 'F2', blue_mm: 800 }), row({ field_id: 'F3', blue_mm: 900 }), row({ field_id: 'F4', blue_mm: 5000, uncertain: true })];

  it('peer median ignores uncertain fields; template uses only payload numbers', () => {
    const p = buildSummaryPayload(all[0], all, 2025, names);
    expect(p.benzer_tarla_ortanca_mm).toBe(900);
    expect(p.verimli_referans_mm).toBe(842);
    const text = templateSummary(p);
    expect(text.split('\n')[0]).toBe('🌱 F1 – Şeker pancarı tarlası, 2025 sezonu');
    expect(text).toContain('benzer şeker pancarı tarlalarının ortancası 900 mm'.replace('benzer', 'Benzer'));
    expect(checkExplanation(text, p).ok).toBe(true);
  });

  it('rainfed fields get no consumption figures', () => {
    const f = row({ class: 'rainfed_winter_cereal', assessed: false, blue_mm: 0, blue_m3: 0, reference_mm: null, status_s1: 'not_assessed' });
    const text = templateSummary(buildSummaryPayload(f, [f], 2025, names));
    expect(text).toContain('yağışa dayalı');
    expect(text.split('\n')).toHaveLength(2);
  });
});

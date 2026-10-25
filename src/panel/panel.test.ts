import { describe, expect, it } from 'vitest';
import { parseTable, type FieldRow } from './data';
import { EMPTY_QUERY, applyQuery, describeQuery, excessM3, inRegion, sanitizeQuery } from './query';
import { fieldsCsv, summarize } from './summary';

const base: FieldRow = {
  field_id: 'F1',
  class: 'sugar_beet',
  class_prob: 0.9,
  uncertain: false,
  area_ha: 10,
  assessed: true,
  et_mm: 1000,
  blue_mm: 900,
  blue_mm_low: 700,
  blue_mm_high: 1000,
  blue_m3: 90_000,
  reference_mm: 800,
  budget_s1_mm: 800,
  budget_s2_mm: 700,
  ratio_s1: 1.125,
  ratio_s2: 1.286,
  status_s1: 'borderline',
  status_s2: 'over',
  stress_flag: false,
  energy_kwh: 1000,
  energy_s1_kwh: 900,
  lever_evap_mm: 60,
  lever_deficit_mm: 90,
  lever_deficit_yield_loss: 0.085,
  lever_switch_to: 'irrigated_winter_cereal',
  lever_switch_mm: 250,
  lon: 33.5,
  lat: 37.85,
};

const rows: FieldRow[] = [
  base,
  { ...base, field_id: 'F2', class: 'maize', area_ha: 2, blue_m3: 18_000, ratio_s1: 0.9, status_s1: 'within', lat: 37.72, lon: 33.35 },
  {
    ...base,
    field_id: 'F3',
    class: 'rainfed_winter_cereal',
    assessed: false,
    blue_mm: 0,
    blue_m3: 0,
    budget_s1_mm: null,
    budget_s2_mm: null,
    ratio_s1: null,
    ratio_s2: null,
    status_s1: 'not_assessed',
    status_s2: 'not_assessed',
    uncertain: true,
  },
  { ...base, field_id: 'F4', ratio_s1: 1.3, status_s1: 'over', stress_flag: true, area_ha: 30, blue_m3: 270_000 },
];

describe('parseTable', () => {
  it('maps header + rows to objects', () => {
    const t = parseTable({ columns: ['field_id', 'area_ha'], rows: [['F1', 2.5]] });
    expect(t[0]).toEqual({ field_id: 'F1', area_ha: 2.5 });
  });
});

describe('applyQuery', () => {
  it('filters by class, status and area', () => {
    const q = { ...EMPTY_QUERY, classes: ['sugar_beet' as const], statuses: ['over' as const], area_min_ha: 20 };
    expect(applyQuery(rows, q, 's1').map((f) => f.field_id)).toEqual(['F4']);
  });

  it('status depends on the scenario', () => {
    const q = { ...EMPTY_QUERY, statuses: ['over' as const] };
    expect(applyQuery(rows, q, 's1').map((f) => f.field_id)).toEqual(['F4']);
    expect(applyQuery(rows, q, 's2').map((f) => f.field_id)).toEqual(['F1', 'F2', 'F4']);
  });

  it('sorts with missing values last and applies the limit', () => {
    const q = { ...EMPTY_QUERY, sort_by: 'ratio' as const, sort_desc: true, limit: 3 };
    expect(applyQuery(rows, q, 's1').map((f) => f.field_id)).toEqual(['F4', 'F1', 'F2']);
  });

  it('can drop uncertain fields and keep only stress flags', () => {
    expect(applyQuery(rows, { ...EMPTY_QUERY, include_uncertain: false }, 's1')).toHaveLength(3);
    expect(applyQuery(rows, { ...EMPTY_QUERY, stress_only: true }, 's1').map((f) => f.field_id)).toEqual(['F4']);
  });

  it('region halves of the pilot bbox', () => {
    expect(inRegion({ lon: 33.5, lat: 37.85 }, 'north')).toBe(true);
    expect(inRegion({ lon: 33.35, lat: 37.72 }, 'south')).toBe(true);
    expect(inRegion({ lon: 33.35, lat: 37.72 }, 'east')).toBe(false);
    expect(inRegion({ lon: 33.45, lat: 37.8 }, 'center')).toBe(true);
  });
});

describe('excessM3', () => {
  it('is the blue water above the budget, never negative', () => {
    expect(excessM3(base, 's1')).toBe(10_000); // (900 - 800) mm × 10 ha × 10 m³/(mm·ha)
    expect(excessM3(rows[1], 's1')).toBe(2000);
    expect(excessM3({ ...base, blue_mm: 500 }, 's1')).toBe(0);
    expect(excessM3(rows[2], 's1')).toBeNull();
  });
});

describe('sanitizeQuery', () => {
  it('drops unknown values and clamps numbers', () => {
    const q = sanitizeQuery({
      classes: ['sugar_beet', 'banana', 'sugar_beet'],
      statuses: ['over', 'bad'],
      area_min_ha: 50,
      area_max_ha: 5,
      region: 'ereğli',
      sort_by: 'ratio',
      limit: 10_000,
      extra: 1,
    });
    expect(q.classes).toEqual(['sugar_beet']);
    expect(q.statuses).toEqual(['over']);
    expect([q.area_min_ha, q.area_max_ha]).toEqual([5, 50]);
    expect(q.region).toBeNull();
    expect(q.limit).toBe(500);
    expect(q.include_uncertain).toBe(true);
  });

  it('garbage becomes the empty query', () => {
    expect(sanitizeQuery('nonsense')).toEqual(EMPTY_QUERY);
  });
});

describe('describeQuery', () => {
  it('reads the query back in Turkish', () => {
    const q = { ...EMPTY_QUERY, classes: ['sugar_beet' as const], statuses: ['over' as const], region: 'north' as const, sort_by: 'excess_m3' as const, limit: 20 };
    expect(describeQuery(q, { sugar_beet: 'Şeker pancarı' })).toBe(
      'Pilot alanın kuzey yarısında hedefi aşan şeker pancarı tarlaları, hedef üstü tüketim (m³) büyükten küçüğe sıralı, ilk 20',
    );
  });
});

describe('summarize', () => {
  it('totals by status and class; budget only for assessed fields', () => {
    const s = summarize(rows, 's1');
    expect(s.fields).toBe(4);
    expect(s.measuredM3).toBe(378_000);
    expect(s.budgetM3).toBe(800 * 10 * 10 + 800 * 2 * 10 + 800 * 30 * 10);
    expect(s.byStatus.over).toEqual({ fields: 1, areaHa: 30 });
    expect(s.byStatus.not_assessed.fields).toBe(1);
    expect(s.byClass[0].cls).toBe('sugar_beet');
    expect(s.stressFields).toBe(1);
  });
});

describe('fieldsCsv', () => {
  it('writes a header and one line per field, empty for null', () => {
    const csv = fieldsCsv([rows[2]]).trim().split('\n');
    expect(csv).toHaveLength(2);
    expect(csv[0].startsWith('field_id,class,')).toBe(true);
    expect(csv[1]).toContain('F3,rainfed_winter_cereal');
    expect(csv[1]).toContain(',,');
  });
});

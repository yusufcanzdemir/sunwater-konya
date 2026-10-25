// Summary figures and CSV for a slice of fields. Pure.

import { STATUSES, budgetOf, statusOf, type FieldRow, type Scenario, type Status } from './data.js';

export interface Summary {
  fields: number;
  areaHa: number;
  measuredM3: number;
  budgetM3: number;
  byStatus: Record<Status, { fields: number; areaHa: number }>;
  byClass: { cls: string; fields: number; areaHa: number; measuredM3: number }[];
  stressFields: number;
  energyKwh: number;
}

/** Budget volume counts assessed fields only; measured volume counts all (rainfed have 0 blue). */
export function summarize(rows: FieldRow[], s: Scenario): Summary {
  const byStatus = Object.fromEntries(STATUSES.map((k) => [k, { fields: 0, areaHa: 0 }])) as Summary['byStatus'];
  const classes = new Map<string, { fields: number; areaHa: number; measuredM3: number }>();
  let areaHa = 0;
  let measuredM3 = 0;
  let budgetM3 = 0;
  let stressFields = 0;
  let energyKwh = 0;
  for (const f of rows) {
    areaHa += f.area_ha;
    measuredM3 += f.blue_m3;
    const b = budgetOf(f, s);
    if (f.assessed && b != null) budgetM3 += b * f.area_ha * 10;
    const st = byStatus[statusOf(f, s)];
    st.fields += 1;
    st.areaHa += f.area_ha;
    const c = classes.get(f.class) ?? { fields: 0, areaHa: 0, measuredM3: 0 };
    c.fields += 1;
    c.areaHa += f.area_ha;
    c.measuredM3 += f.blue_m3;
    classes.set(f.class, c);
    if (f.stress_flag) stressFields += 1;
    energyKwh += f.energy_kwh;
  }
  const byClass = [...classes.entries()].map(([cls, v]) => ({ cls, ...v })).sort((a, b) => b.measuredM3 - a.measuredM3);
  return { fields: rows.length, areaHa, measuredM3, budgetM3, byStatus, byClass, stressFields, energyKwh };
}

const CSV_COLUMNS: (keyof FieldRow)[] = [
  'field_id',
  'class',
  'class_prob',
  'uncertain',
  'area_ha',
  'et_mm',
  'blue_mm',
  'blue_mm_low',
  'blue_mm_high',
  'blue_m3',
  'reference_mm',
  'budget_s1_mm',
  'budget_s2_mm',
  'ratio_s1',
  'ratio_s2',
  'status_s1',
  'status_s2',
  'stress_flag',
  'energy_kwh',
  'lever_evap_mm',
  'lever_deficit_mm',
  'lever_switch_to',
  'lever_switch_mm',
  'lon',
  'lat',
];

const cell = (v: unknown) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Comma-separated, dot decimals (machine-readable); header row with the pipeline column names. */
export function fieldsCsv(rows: FieldRow[]): string {
  return [CSV_COLUMNS.join(','), ...rows.map((f) => CSV_COLUMNS.map((c) => cell(f[c])).join(','))].join('\n') + '\n';
}

// Field filter: the structured query the map, cards, table and CSV share. Pure: also used by the
// serverless natural-language parser to sanitise Gemini output.

import { STATUSES, budgetOf, ratioOf, statusOf, type FieldRow, type Scenario, type Status } from './data.js';

export const CLASS_IDS = [
  'sugar_beet',
  'maize',
  'sunflower',
  'alfalfa',
  'irrigated_winter_cereal',
  'rainfed_winter_cereal',
  'cereal_second_crop',
  'fallow',
  'other',
] as const;
export type ClassId = (typeof CLASS_IDS)[number];

export const REGIONS = ['north', 'south', 'east', 'west', 'center'] as const;
export type Region = (typeof REGIONS)[number];

export const REGION_NAMES: Record<Region, string> = {
  north: 'kuzey yarı',
  south: 'güney yarı',
  east: 'doğu yarı',
  west: 'batı yarı',
  center: 'orta kesim',
};

/** Locative forms written out (vowel harmony is not generated). */
const REGION_LOCATIVE: Record<Region, string> = {
  north: 'kuzey yarısında',
  south: 'güney yarısında',
  east: 'doğu yarısında',
  west: 'batı yarısında',
  center: 'orta kesiminde',
};

export const SORT_KEYS = ['ratio', 'blue_mm', 'blue_m3', 'area_ha', 'excess_m3'] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export const SORT_NAMES: Record<SortKey, string> = {
  ratio: 'bütçe oranı',
  blue_mm: 'mavi su (mm)',
  blue_m3: 'mavi su (m³)',
  area_ha: 'alan',
  excess_m3: 'bütçe aşımı (m³)',
};

export interface FieldQuery {
  classes: ClassId[];
  statuses: Status[];
  area_min_ha: number | null;
  area_max_ha: number | null;
  stress_only: boolean;
  include_uncertain: boolean;
  region: Region | null;
  sort_by: SortKey | null;
  sort_desc: boolean;
  limit: number | null;
}

export const EMPTY_QUERY: FieldQuery = {
  classes: [],
  statuses: [],
  area_min_ha: null,
  area_max_ha: null,
  stress_only: false,
  include_uncertain: true,
  region: null,
  sort_by: null,
  sort_desc: true,
  limit: null,
};

/** Pilot bbox (PLAN.md D4), for the coarse region filter. */
export const PILOT_BBOX = { west: 33.3, south: 37.7, east: 33.6, north: 37.9 } as const;

export function inRegion(f: Pick<FieldRow, 'lon' | 'lat'>, region: Region): boolean {
  const cx = (PILOT_BBOX.west + PILOT_BBOX.east) / 2;
  const cy = (PILOT_BBOX.south + PILOT_BBOX.north) / 2;
  switch (region) {
    case 'north':
      return f.lat >= cy;
    case 'south':
      return f.lat < cy;
    case 'east':
      return f.lon >= cx;
    case 'west':
      return f.lon < cx;
    case 'center': {
      const qx = (PILOT_BBOX.east - PILOT_BBOX.west) / 4;
      const qy = (PILOT_BBOX.north - PILOT_BBOX.south) / 4;
      return Math.abs(f.lon - cx) <= qx && Math.abs(f.lat - cy) <= qy;
    }
  }
}

/** Blue water above the scenario budget (m³); 0 when within, null when not assessed. */
export function excessM3(f: FieldRow, s: Scenario): number | null {
  const b = budgetOf(f, s);
  if (b == null || !f.assessed) return null;
  return Math.max(0, (f.blue_mm - b) * f.area_ha * 10);
}

function sortValue(f: FieldRow, key: SortKey, s: Scenario): number | null {
  switch (key) {
    case 'ratio':
      return ratioOf(f, s);
    case 'excess_m3':
      return excessM3(f, s);
    default:
      return f[key];
  }
}

export function applyQuery(rows: FieldRow[], q: FieldQuery, s: Scenario): FieldRow[] {
  let out = rows.filter(
    (f) =>
      (q.classes.length === 0 || q.classes.includes(f.class as ClassId)) &&
      (q.statuses.length === 0 || q.statuses.includes(statusOf(f, s))) &&
      (q.area_min_ha == null || f.area_ha >= q.area_min_ha) &&
      (q.area_max_ha == null || f.area_ha <= q.area_max_ha) &&
      (!q.stress_only || f.stress_flag) &&
      (q.include_uncertain || !f.uncertain) &&
      (q.region == null || inRegion(f, q.region)),
  );
  if (q.sort_by) {
    const key = q.sort_by;
    const dir = q.sort_desc ? -1 : 1;
    // Missing values (not assessed) always last
    out = [...out].sort((a, b) => {
      const va = sortValue(a, key, s);
      const vb = sortValue(b, key, s);
      if (va == null) return vb == null ? 0 : 1;
      if (vb == null) return -1;
      return dir * (va - vb);
    });
  }
  if (q.limit != null) out = out.slice(0, q.limit);
  return out;
}

const posNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const listOf = <T extends string>(v: unknown, allowed: readonly T[]): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is T => typeof x === 'string' && (allowed as readonly string[]).includes(x)))] : [];
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]) =>
  typeof v === 'string' && (allowed as readonly string[]).includes(v) ? (v as T) : null;

export const MAX_QUERY_LIMIT = 500;

/** Anything not in the schema is dropped; numbers are clamped to sane ranges. */
export function sanitizeQuery(raw: unknown): FieldQuery {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const limit = posNum(r.limit);
  let min = posNum(r.area_min_ha);
  let max = posNum(r.area_max_ha);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return {
    classes: listOf(r.classes, CLASS_IDS),
    statuses: listOf(r.statuses, STATUSES),
    area_min_ha: min,
    area_max_ha: max,
    stress_only: r.stress_only === true,
    include_uncertain: r.include_uncertain !== false,
    region: oneOf(r.region, REGIONS),
    sort_by: oneOf(r.sort_by, SORT_KEYS),
    sort_desc: r.sort_desc !== false,
    limit: limit == null || limit < 1 ? null : Math.min(Math.round(limit), MAX_QUERY_LIMIT),
  };
}

const STATUS_WORDS: Record<Status, string> = {
  within: 'bütçe içinde',
  borderline: 'sınırda',
  over: 'bütçeyi aşan',
  not_assessed: 'değerlendirilmeyen',
};

/** Turkish one-line reading of the query, shown so the user can check what was understood. */
export function describeQuery(q: FieldQuery, classNames: Record<string, string>): string {
  const parts: string[] = [];
  if (q.region) parts.push(`pilot alanın ${REGION_LOCATIVE[q.region]}`);
  if (q.statuses.length) parts.push(q.statuses.map((s) => STATUS_WORDS[s]).join(' veya '));
  if (q.stress_only) parts.push('SEBAL stres bayrağı olan');
  if (q.area_min_ha != null && q.area_max_ha != null) parts.push(`${q.area_min_ha}–${q.area_max_ha} ha`);
  else if (q.area_min_ha != null) parts.push(`en az ${q.area_min_ha} ha`);
  else if (q.area_max_ha != null) parts.push(`en fazla ${q.area_max_ha} ha`);
  const what = q.classes.length ? q.classes.map((c) => classNames[c] ?? c).join(', ').toLocaleLowerCase('tr-TR') : 'tüm';
  parts.push(`${what} tarlaları`);
  if (!q.include_uncertain) parts.push('(ürünü belirsiz olanlar hariç)');
  let text = parts.join(' ');
  if (q.sort_by) text += `, ${SORT_NAMES[q.sort_by]} ${q.sort_desc ? 'büyükten küçüğe' : 'küçükten büyüğe'} sıralı`;
  if (q.limit != null) text += `, ilk ${q.limit}`;
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

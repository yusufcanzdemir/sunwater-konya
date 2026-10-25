// Panel data: shapes of the files written by pipeline/12_export.py (served from /data/) and their loaders.

export type Status = 'within' | 'borderline' | 'over' | 'not_assessed';
export type Scenario = 's1' | 's2';

export const STATUSES: Status[] = ['within', 'borderline', 'over', 'not_assessed'];

export const STATUS_NAMES: Record<Status, string> = {
  within: 'Hedef içinde',
  borderline: 'Sınırda',
  over: 'Hedef üstü',
  not_assessed: 'Yağışa dayalı',
};

/** Fixed status palette (good / warning / critical), never reused for series; always shown with a label. */
export const STATUS_COLORS: Record<Status, string> = {
  within: '#0ca30c',
  borderline: '#fab219',
  over: '#d03b3b',
  not_assessed: '#898781',
};

export const SCENARIO_NAMES: Record<Scenario, string> = {
  s1: 'Verimli sulama hedefi',
  s2: '%20 azaltım hedefi',
};

export interface FieldRow {
  field_id: string;
  class: string;
  class_prob: number;
  uncertain: boolean;
  area_ha: number;
  assessed: boolean;
  et_mm: number;
  blue_mm: number;
  blue_mm_low: number;
  blue_mm_high: number;
  blue_m3: number;
  reference_mm: number | null;
  budget_s1_mm: number | null;
  budget_s2_mm: number | null;
  ratio_s1: number | null;
  ratio_s2: number | null;
  status_s1: Status;
  status_s2: Status;
  stress_flag: boolean;
  energy_kwh: number;
  energy_s1_kwh: number;
  lever_evap_mm: number | null;
  lever_deficit_mm: number | null;
  lever_deficit_yield_loss: number | null;
  lever_switch_to: string | null;
  lever_switch_mm: number | null;
  lon: number;
  lat: number;
}

export interface Table {
  columns: string[];
  rows: unknown[][];
}

/** Column-header + rows table → objects. */
export function parseTable(t: Table): FieldRow[] {
  return t.rows.map((r) => Object.fromEntries(t.columns.map((c, i) => [c, r[i]])) as unknown as FieldRow);
}

export interface SeasonPlayerData {
  dates: string[];
  field_ids: string[];
  cum_blue_mm: number[][];
}

export interface FieldSeason {
  start: string;
  class: string;
  class_prob: number;
  uncertain: boolean;
  area_ha: number;
  assessed: boolean;
  blue_mm: number;
  blue_mm_range: [number, number];
  budget_s1_mm: number | null;
  budget_s2_mm: number | null;
  s2_factor: number;
  status_s1: Status;
  status_s2: Status;
  stress_flag: boolean;
  ndvi: (number | null)[];
  et_mm: (number | null)[];
  cum_blue_mm: (number | null)[];
  cum_budget_s1_mm: (number | null)[];
}

export interface FieldDetailData {
  field_id: string;
  seasons: Record<string, FieldSeason>;
}

export interface Trend {
  slope_cm_yr: number;
  ci95_cm_yr: [number, number];
  km3_yr: number;
  ci95_km3_yr: [number, number];
  from: string;
  to: string;
  months: number;
}

export interface BasinData {
  basin_area_km2: number;
  series: { from: string; to: string; months: number; missing_months: number; gap: [string, string] };
  baseline: [string, string];
  trends: Record<string, Record<string, Trend>>;
  gwsa_grace_period_product_range_cm_yr: [number, number];
  notes: string[];
  monthly: {
    month: string[];
    mission: string[];
    twsa_cm: (number | null)[];
    gwsa_cm: (number | null)[];
    unc_cm: (number | null)[];
    lsm_cm: (number | null)[];
  };
}

export interface Manifest {
  generated_at: string;
  seasons: number[];
  classes: Record<string, string>;
  budget_parameters: {
    s2_reduction: number;
    status_within: number;
    status_limit: number;
    default_method: string;
    head_m: number;
    pump_efficiency: number;
    irrigation_efficiency: Record<string, number>;
    deficit_et_reduction: number;
    [k: string]: unknown;
  };
}

export type Metrics = Record<string, unknown>;

const cache = new Map<string, Promise<unknown>>();

async function getJson<T>(path: string): Promise<T> {
  if (!cache.has(path)) {
    cache.set(
      path,
      fetch(`/data/${path}`).then((r) => {
        if (!r.ok) throw new Error(`${path}: ${r.status}`);
        return r.json();
      }),
    );
  }
  try {
    return (await cache.get(path)) as T;
  } catch (e) {
    cache.delete(path);
    throw e;
  }
}

export const loadManifest = () => getJson<Manifest>('manifest.json');
export const loadFields = async (season: number) => parseTable(await getJson<Table>(`fields_${season}.json`));
export const loadSeasonPlayer = (season: number) => getJson<SeasonPlayerData>(`season_${season}.json`);
export const loadFieldDetail = (id: string) => getJson<FieldDetailData>(`field/${encodeURIComponent(id)}.json`);
export const loadBasin = () => getJson<BasinData>('basin.json');
export const loadMetrics = () => getJson<Metrics>('metrics.json');
/** Field id → outer rings (field_shapes.json, ~2 MB: loaded only when a location is shared). */
export const loadShapes = () => getJson<Record<string, [number, number][][]>>('field_shapes.json');

export const statusOf = (f: FieldRow, s: Scenario): Status => (s === 's1' ? f.status_s1 : f.status_s2);
export const ratioOf = (f: FieldRow, s: Scenario): number | null => (s === 's1' ? f.ratio_s1 : f.ratio_s2);
export const budgetOf = (f: FieldRow, s: Scenario): number | null => (s === 's1' ? f.budget_s1_mm : f.budget_s2_mm);

// Pilot field data for the Telegram bot, read from the exported public/data files (stage 12).
// On Vercel the files are bundled into the functions with vercel.json "includeFiles".

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENGINE_CROP, calibratedCrop, type FieldShapes, type PilotField } from '../../src/farmer/pilot.js';
import { parseTable, type Manifest, type Table } from '../../src/panel/data.js';
import { defaultAssumptions } from '../../src/state/assumptions.js';
import { demoForm, validateFarmForm } from '../../src/state/farm.js';
import type { StoredFarm } from './telegram.js';

export const PILOT_PREFIX = 'field:';

export interface PilotData {
  manifest: Manifest & { season_start_mmdd: string; kcb_max: Record<string, number> };
  season: number;
  rows: PilotField[];
  byId: Map<string, PilotField>;
  shapes: FieldShapes;
}

const dataDir = () => process.env.PILOT_DATA_DIR || join(process.cwd(), 'public', 'data');
const readJson = async <T>(name: string) => JSON.parse(await readFile(join(dataDir(), name), 'utf8')) as T;

let cached: Promise<PilotData> | null = null;

/** Latest season's field table and the field shapes, loaded once per instance. */
export function loadPilot(): Promise<PilotData> {
  cached ??= (async () => {
    const manifest = await readJson<PilotData['manifest']>('manifest.json');
    const season = manifest.seasons[0];
    const rows = parseTable(await readJson<Table>(`fields_${season}.json`)) as PilotField[];
    const shapes = await readJson<FieldShapes>('field_shapes.json');
    return { manifest, season, rows, byId: new Map(rows.map((r) => [r.field_id, r])), shapes };
  })().catch((e) => {
    cached = null;
    throw e;
  });
  return cached;
}

export const isPilotId = (farmId: string) => farmId.startsWith(PILOT_PREFIX);
export const pilotFieldId = (farmId: string) => farmId.slice(PILOT_PREFIX.length);

export async function pilotField(farmId: string): Promise<PilotField | null> {
  if (!isPilotId(farmId)) return null;
  return (await loadPilot()).byId.get(pilotFieldId(farmId)) ?? null;
}

/**
 * Engine farm for a pilot field: crop and calendar from the satellite season, area from the field
 * polygon; method, soil, pump and solar values are the demo assumptions (not observed per field,
 * same defaults as the budget, PLAN.md D19). Null when the engine has no parameters for the crop.
 */
export async function pilotFarm(farmId: string, year: number): Promise<StoredFarm | null> {
  const f = await pilotField(farmId);
  if (!f) return null;
  const crop = ENGINE_CROP[f.class];
  if (!crop) return null;
  const { manifest } = await loadPilot();
  const assumptions = defaultAssumptions();
  const cal = calibratedCrop(assumptions.crops[crop], f, manifest.kcb_max[f.class], manifest.season_start_mmdd, year);
  if (!cal) return null;
  assumptions.crops[crop] = cal.crop;
  const { input } = validateFarmForm({
    ...demoForm(year),
    locationText: `Tarla ${f.field_id}`,
    crop,
    plantingDate: cal.plantingDate,
    areaDecare: String(Math.round(f.area_ha * 100) / 10).replace('.', ','),
    irrigationMethod: 'sprinkler',
  });
  if (!input) return null;
  return {
    id: farmId,
    input,
    geo: { latitude: f.lat, longitude: f.lon, name: `Tarla ${f.field_id}` },
    assumptions,
    savedAt: `${manifest.generated_at}`,
  };
}

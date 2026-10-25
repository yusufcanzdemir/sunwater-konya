// Pilot field data for the Telegram bot, read from the exported public/data files (stage 12).
// On Vercel the files are bundled into the functions with vercel.json "includeFiles".

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pilotEngineFarm, type FieldShapes, type PilotField } from '../../src/farmer/pilot.js';
import { parseTable, type Manifest, type Table } from '../../src/panel/data.js';
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

/** Engine farm for a pilot field (see pilotEngineFarm). Null when the engine has no parameters for the crop. */
export async function pilotFarm(farmId: string, year: number): Promise<StoredFarm | null> {
  const f = await pilotField(farmId);
  if (!f) return null;
  const { manifest } = await loadPilot();
  const engine = pilotEngineFarm(f, manifest, year);
  if (!engine) return null;
  const { input, assumptions } = engine;
  return {
    id: farmId,
    input,
    geo: { latitude: f.lat, longitude: f.lon, name: `Tarla ${f.field_id}` },
    assumptions,
    savedAt: `${manifest.generated_at}`,
  };
}

// Farmer channel for pilot fields (PLAN.md stage 14): finding the field under a shared location,
// calibrating the FAO-56 engine with the field's satellite crop calendar, and the season summary.
// Pure: used by the Telegram bot and tests.

import type { CropId, CropParams } from '../engine/crops.js';
import { addDays } from '../engine/dates.js';
import { STATUS_NAMES, type FieldRow } from '../panel/data.js';
import { defaultAssumptions, type Assumptions } from '../state/assumptions.js';
import { demoForm, validateFarmForm, type FarmForm, type FarmInput } from '../state/farm.js';

/** Satellite crop calendar columns exported with the field table (day offsets from the season start). */
export interface PilotField extends FieldRow {
  cal_start: number;
  cal_mid_start: number;
  cal_mid_end: number;
  cal_end: number;
  kcb_peak: number | null;
}

/** Field id → outer rings [[lon, lat], …] (field_shapes.json). */
export type FieldShapes = Record<string, [number, number][][]>;

/** Pilot crop classes the farmer-side engine has crop parameters for. */
export const ENGINE_CROP: Partial<Record<string, CropId>> = {
  sugar_beet: 'sugar_beet',
  maize: 'maize',
  sunflower: 'sunflower',
  irrigated_winter_cereal: 'wheat',
};

function inRing(lon: number, lat: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Equirectangular distance in metres (fine at field scale). */
export function distanceM(lon1: number, lat1: number, lon2: number, lat2: number): number {
  const k = Math.PI / 180;
  const x = (lon2 - lon1) * k * Math.cos(((lat1 + lat2) / 2) * k);
  const y = (lat2 - lat1) * k;
  return Math.hypot(x, y) * 6_371_000;
}

/**
 * Candidate fields for a shared location: the field containing the point first, then the nearest
 * centroids within `maxM`, at most `limit` ids. Empty = outside the pilot fields.
 */
export function findFields(
  shapes: FieldShapes,
  centroids: Pick<FieldRow, 'field_id' | 'lon' | 'lat'>[],
  lon: number,
  lat: number,
  maxM = 1000,
  limit = 3,
): string[] {
  const containing = Object.entries(shapes)
    .filter(([, rings]) => rings.some((r) => inRing(lon, lat, r)))
    .map(([id]) => id);
  const near = centroids
    .map((c) => ({ id: c.field_id, d: distanceM(lon, lat, c.lon, c.lat) }))
    .filter((c) => c.d <= maxM && !containing.includes(c.id))
    .sort((a, b) => a.d - b.d)
    .map((c) => c.id);
  return [...containing, ...near].slice(0, limit);
}

/** [west, south, east, north] around the field's rings, padded by `pad` of the larger side. */
export function fieldBbox(rings: [number, number][][], pad = 0.6): [number, number, number, number] {
  const pts = rings.flat();
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  // Square on the ground: a degree of longitude is shorter than a degree of latitude here
  const cos = Math.cos((cy * Math.PI) / 180);
  const half = Math.max((Math.max(...xs) - Math.min(...xs)) * cos, Math.max(...ys) - Math.min(...ys)) * (0.5 + pad);
  return [cx - half / cos, cy - half, cx + half / cos, cy + half];
}

/** Esri World Imagery snapshot of the bbox (Telegram fetches the URL itself). */
export function imageryUrl([w, s, e, n]: [number, number, number, number], size = 512): string {
  const p = new URLSearchParams({
    bbox: [w, s, e, n].map((v) => v.toFixed(5)).join(','),
    bboxSR: '4326',
    imageSR: '3857',
    size: `${size},${size}`,
    format: 'jpg',
    f: 'image',
  });
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export?${p}`;
}

const mercY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The field's outline as an SVG the size of the `imageryUrl` snapshot (Web Mercator pixels). */
export function fieldOutlineSvg(rings: [number, number][][], [w, s, e, n]: [number, number, number, number], size = 512): string {
  const px = ([lon, lat]: [number, number]) =>
    `${(((lon - w) / (e - w)) * size).toFixed(1)},${(((mercY(n) - mercY(lat)) / (mercY(n) - mercY(s))) * size).toFixed(1)}`;
  const d = rings.map((r) => `M${r.map(px).join('L')}Z`).join('');
  // A dark halo under a bright line stays visible on both dark crops and bare soil
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
    `<path d="${d}" fill="none" stroke="#000" stroke-opacity="0.55" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="#facc15" fill-opacity="0.12" fill-rule="evenodd" stroke="#facc15" stroke-width="3" stroke-linejoin="round"/>` +
    `</svg>`
  );
}

const MIN_STAGE_DAYS = 10;

/**
 * Engine crop parameters from the field's satellite season: planting = first cropped day − Kc_ini
 * stage (not before the season start), development / mid / late stage lengths from the Kcb curve,
 * Kc_mid scaled by how close the field came to full cover (peak Kcb / class Kcb_max).
 * Returns null when the field never showed a crop. Dates are moved to `year`.
 */
export function calibratedCrop(
  base: CropParams,
  f: Pick<PilotField, 'cal_start' | 'cal_mid_start' | 'cal_mid_end' | 'cal_end' | 'kcb_peak'>,
  classKcbMax: number,
  seasonStartMmdd: string,
  year: number,
): { crop: CropParams; plantingDate: string } | null {
  if (f.cal_start < 0 || f.cal_end < 0 || f.kcb_peak == null) return null;
  const seasonStart = `${year}-${seasonStartMmdd}`;
  const plantingOffset = Math.max(0, f.cal_start - base.stages.ini);
  const ini = Math.max(MIN_STAGE_DAYS, f.cal_start - plantingOffset);
  const dev = Math.max(MIN_STAGE_DAYS, f.cal_mid_start - f.cal_start);
  const mid = Math.max(MIN_STAGE_DAYS, f.cal_mid_end - f.cal_mid_start);
  const late = Math.max(MIN_STAGE_DAYS, f.cal_end - f.cal_mid_end);
  const cover = Math.min(1, Math.max(0.3, f.kcb_peak / classKcbMax));
  return {
    crop: { ...base, stages: { ini, dev, mid, late }, kcMid: Math.round(base.kcMid * cover * 100) / 100 },
    plantingDate: addDays(seasonStart, plantingOffset),
  };
}

/**
 * Engine farm for a pilot field: crop and calendar from the satellite season, area from the field
 * polygon; method, soil, pump and solar values are the demo defaults (not observed per field, same
 * defaults as the budget, PLAN.md D19). Null when the engine has no parameters for the crop.
 * `profile`: the farmer's own pump and method (farmer app), replacing those defaults.
 */
export function pilotEngineFarm(
  f: PilotField,
  manifest: { season_start_mmdd: string; kcb_max: Record<string, number> },
  year: number,
  profile?: Partial<FarmForm>,
): { input: FarmInput; assumptions: Assumptions } | null {
  const crop = ENGINE_CROP[f.class];
  if (!crop) return null;
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
    ...profile,
  });
  return input ? { input, assumptions } : null;
}

export interface SummaryPayload {
  tarla: string;
  urun: string;
  sezon: number;
  /** false: rainfed cereal / fallow, blue water taken as 0 and no budget. */
  degerlendirildi: boolean;
  mavi_su_mm: number;
  mavi_su_m3: number;
  aralik_mm: [number, number];
  benzer_tarla_ortanca_mm: number | null;
  verimli_referans_mm: number | null;
  durum: string;
  goreli_dusuk_et: boolean;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** Season summary numbers for one field; the peer median uses confident, assessed fields of the class. */
export function buildSummaryPayload(f: FieldRow, all: FieldRow[], season: number, classNames: Record<string, string>): SummaryPayload {
  const peers = all.filter((g) => g.class === f.class && g.assessed && !g.uncertain).map((g) => g.blue_mm);
  const peer = median(peers);
  return {
    tarla: f.field_id,
    urun: classNames[f.class] ?? f.class,
    sezon: season,
    degerlendirildi: f.assessed,
    mavi_su_mm: Math.round(f.blue_mm),
    mavi_su_m3: Math.round(f.blue_m3),
    aralik_mm: [Math.round(f.blue_mm_low), Math.round(f.blue_mm_high)],
    benzer_tarla_ortanca_mm: f.assessed && peer != null ? Math.round(peer) : null,
    verimli_referans_mm: f.assessed && f.reference_mm != null ? Math.round(f.reference_mm) : null,
    durum: STATUS_NAMES[f.status_s1],
    goreli_dusuk_et: f.stress_flag,
  };
}

const tr = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 1 });
const lower = (s: string) => s.toLocaleLowerCase('tr-TR');

/** At most 5 short lines, each starting with one emoji, only payload numbers. */
export function templateSummary(p: SummaryPayload): string {
  const lines = [`🌱 ${p.tarla} – ${p.urun} tarlası, ${p.sezon} sezonu`];
  if (!p.degerlendirildi) {
    lines.push('🌾 Bu tarla yağışa dayalı görünüyor; yeraltı suyu tüketimi hesaplanmadı.');
    return lines.join('\n');
  }
  lines.push(
    `💧 Uydu ölçümüne göre bu sezon yaklaşık ${tr(p.mavi_su_mm)} mm (${tr(p.mavi_su_m3)} m³) yeraltı suyu tüketti (aralık ${tr(p.aralik_mm[0])}–${tr(p.aralik_mm[1])} mm).`,
  );
  if (p.benzer_tarla_ortanca_mm != null && p.verimli_referans_mm != null) {
    lines.push(
      `👥 Benzer ${lower(p.urun)} tarlalarının ortancası ${tr(p.benzer_tarla_ortanca_mm)} mm, damla sulamayla verimli sulama referansı ${tr(p.verimli_referans_mm)} mm.`,
    );
  }
  lines.push(
    p.durum === STATUS_NAMES.over || p.durum === STATUS_NAMES.borderline
      ? `📊 Durum: ${lower(p.durum)}. Damla sulama ve daha az toprak ıslatma ile tasarruf mümkün görünüyor.`
      : `📊 Durum: ${lower(p.durum)}.`,
  );
  if (p.goreli_dusuk_et) lines.push('⚠️ Bazı uydu geçişlerinde benzer tarlalardan belirgin şekilde az su buharlaştırdı; bitki gelişimini kontrol edin.');
  return lines.slice(0, 5).join('\n');
}

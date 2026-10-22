import area from '@turf/area';
import type { Feature, FeatureCollection, Point, Polygon, Position } from 'geojson';

export type SkipReason = 'not_field' | 'unclear_boundary' | 'duplicate';

export const SKIP_REASON_LABELS: Record<SkipReason, string> = {
  not_field: 'Tarla değil (yol, yerleşim, boş arazi)',
  unclear_boundary: 'Sınır belirlenemiyor',
  duplicate: 'Bu tarla başka bir noktada zaten çizildi',
};

interface EntryBase {
  drawnBy: string;
  drawnAt: string;
}
export type Entry =
  | (EntryBase & { status: 'drawn'; geometry: Polygon; areaHa: number })
  | (EntryBase & { status: 'skipped'; reason: SkipReason });

export interface RefPoint {
  id: string;
  lat: number;
  lon: number;
}

export function parsePoints(fc: FeatureCollection<Point>): RefPoint[] {
  return fc.features.map((f) => ({
    id: String(f.properties?.point_id),
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
  }));
}

/** Ray casting on the outer ring; good enough for field-sized polygons in lon/lat. */
export function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const polygonAreaHa = (geometry: Polygon) => area({ type: 'Feature', geometry, properties: {} }) / 10_000;

export function entriesToGeoJson(entries: Record<string, Entry>): FeatureCollection<Polygon | null> {
  return {
    type: 'FeatureCollection',
    features: Object.entries(entries)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([pointId, e]): Feature<Polygon | null> => ({
        type: 'Feature',
        geometry: e.status === 'drawn' ? e.geometry : null,
        properties:
          e.status === 'drawn'
            ? { point_id: pointId, status: e.status, area_ha: Math.round(e.areaHa * 100) / 100, drawn_by: e.drawnBy, drawn_at: e.drawnAt }
            : { point_id: pointId, status: e.status, reason: e.reason, drawn_by: e.drawnBy, drawn_at: e.drawnAt },
      })),
  };
}

export function geoJsonToEntries(fc: FeatureCollection<Polygon | null> | null): Record<string, Entry> {
  const entries: Record<string, Entry> = {};
  for (const f of fc?.features ?? []) {
    const p = f.properties ?? {};
    const base = { drawnBy: String(p.drawn_by ?? ''), drawnAt: String(p.drawn_at ?? '') };
    if (p.status === 'drawn' && f.geometry) {
      entries[p.point_id] = { ...base, status: 'drawn', geometry: f.geometry, areaHa: polygonAreaHa(f.geometry) };
    } else if (p.status === 'skipped') {
      entries[p.point_id] = { ...base, status: 'skipped', reason: p.reason as SkipReason };
    }
  }
  return entries;
}

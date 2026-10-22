import type { Polygon } from 'geojson';
import { describe, expect, it } from 'vitest';
import { entriesToGeoJson, geoJsonToEntries, pointInRing, polygonAreaHa, type Entry } from './entries';

const square: Polygon = {
  type: 'Polygon',
  coordinates: [
    [
      [33.4, 37.8],
      [33.401, 37.8],
      [33.401, 37.801],
      [33.4, 37.801],
      [33.4, 37.8],
    ],
  ],
};

describe('pointInRing', () => {
  it('detects inside and outside points', () => {
    expect(pointInRing(33.4005, 37.8005, square.coordinates[0])).toBe(true);
    expect(pointInRing(33.402, 37.8005, square.coordinates[0])).toBe(false);
  });
});

describe('polygonAreaHa', () => {
  it('matches a ~88 m x 111 m square', () => {
    // 0.001° lon at 37.8° ≈ 87.9 m, 0.001° lat ≈ 111 m
    expect(polygonAreaHa(square)).toBeGreaterThan(0.95);
    expect(polygonAreaHa(square)).toBeLessThan(1.0);
  });
});

describe('GeoJSON round trip', () => {
  it('keeps drawn and skipped entries', () => {
    const entries: Record<string, Entry> = {
      R002: { status: 'skipped', reason: 'not_field', drawnBy: 'y', drawnAt: '2026-10-22T10:00:00Z' },
      R001: { status: 'drawn', geometry: square, areaHa: polygonAreaHa(square), drawnBy: 'y', drawnAt: '2026-10-22T10:00:00Z' },
    };
    const fc = entriesToGeoJson(entries);
    expect(fc.features.map((f) => f.properties?.point_id)).toEqual(['R001', 'R002']);
    expect(fc.features[1].geometry).toBeNull();
    expect(geoJsonToEntries(fc)).toEqual(entries);
  });
});

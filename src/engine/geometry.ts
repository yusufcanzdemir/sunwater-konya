// Field polygon drawn on the map → area and location for the form.

import area from '@turf/area';
import centroid from '@turf/centroid';
import type { Feature, Polygon } from 'geojson';

/** 1 decare = 1000 m². */
export function polygonAreaDecare(polygon: Feature<Polygon> | Polygon): number {
  return area(polygon) / 1000;
}

export function polygonCentroid(polygon: Feature<Polygon> | Polygon): { latitude: number; longitude: number } {
  const [longitude, latitude] = centroid(polygon).geometry.coordinates;
  return { latitude, longitude };
}

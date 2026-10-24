import 'leaflet/dist/leaflet.css';

import type { Feature, FeatureCollection, Polygon } from 'geojson';
import L from 'leaflet';
import { useEffect, useMemo, useRef } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { GeoJSON, ImageOverlay, MapContainer, useMap } from 'react-leaflet';
import { fmt } from '../components/ui';

/** Shared map and chart pieces of the /label and /check tools. */

export interface Overlay {
  id: string;
  label: string;
  file: string;
  dir: string;
  bounds: [[number, number], [number, number]];
}

export interface FieldProps {
  field_id: string;
  area_ha: number;
  seg_confidence: number;
}

export interface FieldSeries {
  dekad_starts: string[];
  fields: Record<string, { ndvi: (number | null)[]; ndmi: (number | null)[] }>;
}

export type FieldStatus = 'done' | 'skipped';

export const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
export const overlayUrl = (o: Overlay) => `/dev-api/label/overlay/${o.dir}/${o.file}`;
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function loadName(key: string): string {
  try {
    return localStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

export function storeName(key: string, name: string) {
  try {
    localStorage.setItem(key, name);
  } catch {
    // Storage unavailable: the name is only a convenience.
  }
}

export function FitTo({ feature, padding }: { feature: Feature<Polygon> | null; padding: number }) {
  const map = useMap();
  useEffect(() => {
    if (feature) map.fitBounds(L.geoJSON(feature).getBounds(), { padding: [padding, padding], maxZoom: 17 });
  }, [map, feature, padding]);
  return null;
}

/** All fields on a canvas layer, coloured by status; click calls onSelect. */
export function FieldsLayer({
  fields,
  status,
  currentId,
  onSelect,
}: {
  fields: FeatureCollection<Polygon, FieldProps>;
  status: Record<string, FieldStatus>;
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    // Drawn on canvas because the map is created with preferCanvas (thousands of polygons)
    const layer = L.geoJSON(fields, {
      onEachFeature: (f, l) => l.on('click', () => onSelectRef.current((f.properties as FieldProps).field_id)),
    }).addTo(map);
    layerRef.current = layer;
    return () => {
      map.removeLayer(layer);
    };
  }, [map, fields]);

  useEffect(() => {
    layerRef.current?.setStyle((f) => {
      const id = (f?.properties as FieldProps).field_id;
      if (id === currentId) return { color: '#fcc419', weight: 4, fillOpacity: 0 };
      if (status[id] === 'done') return { color: '#4797fb', weight: 1.5, fillColor: '#4797fb', fillOpacity: 0.25 };
      if (status[id] === 'skipped') return { color: '#8c6f4d', weight: 1, fillColor: '#8c6f4d', fillOpacity: 0.3 };
      return { color: '#ffffff', weight: 0.8, opacity: 0.6, fillOpacity: 0 };
    });
  }, [status, currentId]);

  return null;
}

export function MiniMap({ overlay, feature }: { overlay: Overlay; feature: Feature<Polygon> }) {
  return (
    <figure className="flex flex-col">
      <MapContainer
        className="h-36 w-full rounded"
        zoomControl={false}
        dragging={false}
        scrollWheelZoom={false}
        doubleClickZoom={false}
        attributionControl={false}
        center={[0, 0]}
        zoom={15}
      >
        <ImageOverlay url={overlayUrl(overlay)} bounds={overlay.bounds} />
        <GeoJSON key={feature.properties?.field_id} data={feature} style={{ color: '#fcc419', weight: 2, fillOpacity: 0 }} />
        <FitTo feature={feature} padding={10} />
      </MapContainer>
      <figcaption className="mt-0.5 text-center text-xs text-soil-600">{overlay.label}</figcaption>
    </figure>
  );
}

export function CurveChart({ series, fieldId }: { series: FieldSeries; fieldId: string }) {
  const data = useMemo(() => {
    const s = series.fields[fieldId];
    return s ? series.dekad_starts.map((date, i) => ({ date, ndvi: s.ndvi[i], ndmi: s.ndmi[i] })) : [];
  }, [series, fieldId]);
  return (
    <ResponsiveContainer width="100%" height={190}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5d8c5" />
        <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={20} fontSize={11} />
        <YAxis domain={[-0.2, 1]} fontSize={11} />
        <Tooltip labelFormatter={(l) => shortDate(String(l))} formatter={(v) => fmt(Number(v), 2)} />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Line dataKey="ndvi" name="NDVI (yeşillik)" stroke="#6b8e23" dot={false} strokeWidth={2} isAnimationActive={false} />
        <Line dataKey="ndmi" name="NDMI (nem)" stroke="#1d77f2" dot={false} strokeWidth={1.5} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}

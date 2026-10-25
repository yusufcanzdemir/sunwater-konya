import './leafletGlobal';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';

import type { Feature, Polygon } from 'geojson';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { ESRI_ATTRIBUTION } from './attribution';
import { polygonAreaDecare, polygonCentroid } from '../engine/geometry';

export interface DrawnField {
  areaDecare: number;
  latitude: number;
  longitude: number;
}

const KARAPINAR: [number, number] = [37.716, 33.551];
const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

function DrawControls({ onChange }: { onChange: (field: DrawnField | null) => void }) {
  const map = useMap();
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    map.pm.setLang('tr');
    map.pm.addControls({
      position: 'topleft',
      drawMarker: false,
      drawCircleMarker: false,
      drawPolyline: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      dragMode: false,
    });
    map.pm.setPathOptions({ color: '#fcc419', fillColor: '#fcc419', fillOpacity: 0.25, weight: 3 });

    let field: L.Polygon | null = null;
    const report = () => {
      if (!field) return onChangeRef.current(null);
      const geo = field.toGeoJSON() as Feature<Polygon>;
      onChangeRef.current({ areaDecare: polygonAreaDecare(geo), ...polygonCentroid(geo) });
    };

    const onCreate = (e: { layer: L.Layer }) => {
      // One field at a time: a new drawing replaces the old one.
      if (field) map.removeLayer(field);
      field = e.layer as L.Polygon;
      field.on('pm:edit', report);
      report();
    };
    const onRemove = (e: { layer: L.Layer }) => {
      if (e.layer === field) {
        field = null;
        report();
      }
    };

    map.on('pm:create', onCreate);
    map.on('pm:remove', onRemove);
    return () => {
      map.off('pm:create', onCreate);
      map.off('pm:remove', onRemove);
      map.pm.removeControls();
    };
  }, [map]);

  return null;
}

function Recenter({ center }: { center: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, Math.max(map.getZoom(), 14));
  }, [map, center]);
  return null;
}

export default function FieldMap({
  center,
  onChange,
}: {
  center: [number, number] | null;
  onChange: (field: DrawnField | null) => void;
}) {
  return (
    <MapContainer center={center ?? KARAPINAR} zoom={13} className="h-80 w-full rounded-lg sm:h-96" scrollWheelZoom={false}>
      <TileLayer url={ESRI_IMAGERY} attribution={ESRI_ATTRIBUTION} maxZoom={19} />
      <DrawControls onChange={onChange} />
      <Recenter center={center} />
    </MapContainer>
  );
}

// MapLibre map of all fields from the PMTiles archive, coloured by budget status or, in player mode,
// by cumulative blue water on the player's date (feature-state).

import { Map as MapLibre, Popup, addProtocol, setWorkerUrl, type ExpressionSpecification, type MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { useEffect, useRef } from 'react';
import { ESRI_ATTRIBUTION, SENTINEL_ATTRIBUTION } from '../components/attribution';
import { t } from '../i18n';
import { PILOT_BBOX } from './query';
import { STATUS_COLORS, STATUS_NAMES, type FieldRow, type Scenario, type Status } from './data';

const pmtilesUrl = (season: number) => `pmtiles://${window.location.origin}/data/fields_${season}.pmtiles`;

const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

/** Sequential blue (light → dark) for cumulative blue water in the player, mm. */
export const PLAYER_STOPS: [number, string][] = [
  [0, '#cde2fb'],
  [200, '#86b6ef'],
  [400, '#3987e5'],
  [700, '#256abf'],
  [1000, '#104281'],
  [1300, '#0d366b'],
];

let protocolAdded = false;
function ensureProtocol() {
  if (protocolAdded) return;
  // The bundled library looks for its worker next to itself, where the build does not put it.
  setWorkerUrl(workerUrl);
  addProtocol('pmtiles', new Protocol().tile);
  protocolAdded = true;
}

function statusColor(scenario: Scenario): ExpressionSpecification {
  const prop = scenario === 's1' ? 'status_s1' : 'status_s2';
  const pairs = (Object.keys(STATUS_COLORS) as Status[]).flatMap((s) => [s, STATUS_COLORS[s]]);
  return ['match', ['get', prop], ...pairs, STATUS_COLORS.not_assessed] as unknown as ExpressionSpecification;
}

const playerColor: ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['coalesce', ['feature-state', 'cum'], 0],
  ...PLAYER_STOPS.flat(),
] as unknown as ExpressionSpecification;

export interface PlayerFrame {
  ids: string[];
  values: number[];
}

interface Props {
  season: number;
  scenario: Scenario;
  visibleIds: string[] | null;
  selected: FieldRow | null;
  onSelect: (id: string | null) => void;
  classNames: Record<string, string>;
  player: PlayerFrame | null;
  className?: string;
  /** Farmer view: every field is drawn neutral and only the selected field shows its status colour. */
  neutral?: boolean;
}

/** Neutral fill for the farmer view: no field is publicly coloured by its water use. */
const NEUTRAL_FILL = '#ffffff';

export default function FieldsMap({ season, scenario, visibleIds, selected, onSelect, classNames, player, className, neutral = false }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibre | null>(null);
  const ready = useRef(false);
  const pending = useRef<((map: MapLibre) => void)[]>([]);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const namesRef = useRef(classNames);
  namesRef.current = classNames;
  const scenarioRef = useRef(scenario);
  scenarioRef.current = scenario;
  const neutralRef = useRef(neutral);
  neutralRef.current = neutral;

  useEffect(() => {
    ensureProtocol();
    const map = new MapLibre({
      container: container.current!,
      bounds: [PILOT_BBOX.west, PILOT_BBOX.south, PILOT_BBOX.east, PILOT_BBOX.north],
      fitBoundsOptions: { padding: 20 },
      attributionControl: { compact: true },
      style: {
        version: 8,
        sources: {
          imagery: { type: 'raster', tiles: [ESRI_IMAGERY], tileSize: 256, maxzoom: 19, attribution: ESRI_ATTRIBUTION },
          fields: { type: 'vector', url: pmtilesUrl(season), promoteId: 'field_id', attribution: SENTINEL_ATTRIBUTION },
        },
        layers: [
          { id: 'imagery', type: 'raster', source: 'imagery' },
          {
            id: 'fields-fill',
            type: 'fill',
            source: 'fields',
            'source-layer': 'fields',
            paint: neutral ? { 'fill-color': NEUTRAL_FILL, 'fill-opacity': 0.12 } : { 'fill-color': statusColor(scenario), 'fill-opacity': 0.6 },
          },
          {
            id: 'fields-selected-fill',
            type: 'fill',
            source: 'fields',
            'source-layer': 'fields',
            filter: ['==', ['get', 'field_id'], ''],
            paint: { 'fill-color': statusColor(scenario), 'fill-opacity': 0.75 },
          },
          {
            id: 'fields-line',
            type: 'line',
            source: 'fields',
            'source-layer': 'fields',
            filter: ['!=', ['get', 'uncertain'], true],
            paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 },
          },
          {
            id: 'fields-uncertain',
            type: 'line',
            source: 'fields',
            'source-layer': 'fields',
            filter: ['==', ['get', 'uncertain'], true],
            paint: { 'line-color': '#ffffff', 'line-width': 1, 'line-opacity': 0.7 },
          },
          {
            id: 'fields-selected',
            type: 'line',
            source: 'fields',
            'source-layer': 'fields',
            filter: ['==', ['get', 'field_id'], ''],
            paint: { 'line-color': '#0b0b0b', 'line-width': 3 },
          },
        ],
      },
    });
    mapRef.current = map;

    const popup = new Popup({ closeButton: false, closeOnClick: false, offset: 8 });
    map.on('mousemove', 'fields-fill', (e) => {
      const f = e.features?.[0] as MapGeoJSONFeature | undefined;
      if (!f) return;
      map.getCanvas().style.cursor = 'pointer';
      const p = f.properties as Record<string, unknown>;
      const status = (scenarioRef.current === 's1' ? p.status_s1 : p.status_s2) as Status;
      const box = document.createElement('div');
      box.className = 'text-xs text-soil-900';
      const value = document.createElement('div');
      value.className = 'font-semibold';
      value.textContent = `${namesRef.current[String(p.class)] ?? String(p.class)} · ${String(p.field_id)}`;
      box.append(value);
      // The farmer view never shows another field's water use
      if (!neutralRef.current) {
        const label = document.createElement('div');
        label.textContent = STATUS_NAMES[status] ?? '';
        box.append(label);
      }
      popup.setLngLat(e.lngLat).setDOMContent(box).addTo(map);
    });
    map.on('mouseleave', 'fields-fill', () => {
      map.getCanvas().style.cursor = '';
      popup.remove();
    });
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['fields-fill'] })[0];
      onSelectRef.current(hit ? String(hit.properties.field_id) : null);
    });
    map.on('load', () => {
      // Compact attribution starts collapsed behind its (i) button
      container.current?.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show');
      ready.current = true;
      for (const fn of pending.current.splice(0)) fn(map);
    });
    return () => {
      ready.current = false;
      popup.remove();
      map.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Runs `fn` now if the style is loaded, otherwise once it is. */
  const whenReady = (fn: (map: MapLibre) => void) => {
    const map = mapRef.current;
    if (!map) return;
    if (ready.current) fn(map);
    else pending.current.push(fn);
  };

  useEffect(() => {
    whenReady((map) => {
      const src = map.getSource('fields') as unknown as { setUrl?: (u: string) => void } | undefined;
      src?.setUrl?.(pmtilesUrl(season));
    });
  }, [season]);

  useEffect(() => {
    whenReady((map) => {
      map.setPaintProperty('fields-fill', 'fill-color', player ? playerColor : neutral ? NEUTRAL_FILL : statusColor(scenario));
      map.setPaintProperty('fields-fill', 'fill-opacity', player ? 0.85 : neutral ? 0.12 : 0.6);
      map.setPaintProperty('fields-selected-fill', 'fill-color', statusColor(scenario));
    });
  }, [scenario, player != null, neutral]);

  useEffect(() => {
    if (!player) return;
    whenReady((map) => {
      for (let i = 0; i < player.ids.length; i++) {
        map.setFeatureState({ source: 'fields', sourceLayer: 'fields', id: player.ids[i] }, { cum: player.values[i] });
      }
    });
  }, [player]);

  useEffect(() => {
    whenReady((map) => {
      const filter: ExpressionSpecification | null = visibleIds
        ? (['in', ['get', 'field_id'], ['literal', visibleIds]] as unknown as ExpressionSpecification)
        : null;
      map.setFilter('fields-fill', filter);
      const lineBase = (uncertain: boolean): ExpressionSpecification =>
        (uncertain ? ['==', ['get', 'uncertain'], true] : ['!=', ['get', 'uncertain'], true]) as ExpressionSpecification;
      map.setFilter('fields-line', filter ? (['all', lineBase(false), filter] as ExpressionSpecification) : lineBase(false));
      map.setFilter('fields-uncertain', filter ? (['all', lineBase(true), filter] as ExpressionSpecification) : lineBase(true));
    });
  }, [visibleIds]);

  useEffect(() => {
    whenReady((map) => {
      map.setFilter('fields-selected', ['==', ['get', 'field_id'], selected?.field_id ?? '']);
      map.setFilter('fields-selected-fill', ['==', ['get', 'field_id'], selected?.field_id ?? '']);
      if (selected) map.easeTo({ center: [selected.lon, selected.lat], zoom: Math.max(map.getZoom(), 13.5), duration: 600 });
    });
  }, [selected?.field_id]);

  return <div ref={container} className={className ?? 'h-full min-h-[420px] w-full overflow-hidden rounded-lg'} aria-label={t('Tarla haritası', 'Field map')} />;
}

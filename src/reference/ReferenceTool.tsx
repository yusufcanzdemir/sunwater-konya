import '../components/leafletGlobal';
import '@geoman-io/leaflet-geoman-free';
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css';
import 'leaflet/dist/leaflet.css';

import type { FeatureCollection, Point, Polygon } from 'geojson';
import L from 'leaflet';
import { ChevronLeft, ChevronRight, CircleCheck, CircleSlash, Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CircleMarker, ImageOverlay, MapContainer, TileLayer, useMap } from 'react-leaflet';
import { fmt, inputClass } from '../components/ui';
import {
  SKIP_REASON_LABELS,
  entriesToGeoJson,
  geoJsonToEntries,
  parsePoints,
  pointInRing,
  polygonAreaHa,
  type Entry,
  type RefPoint,
  type SkipReason,
} from './entries';

interface Overlay {
  id: string;
  label: string;
  file: string;
  bounds: [[number, number], [number, number]];
}

interface ReferenceData {
  points: FeatureCollection<Point>;
  fields: FeatureCollection<Polygon | null> | null;
  overlays: Overlay[];
}

const ESRI_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const DRAWN_BY_KEY = 'reference.drawnBy';
const DRAW_STYLE = { color: '#fcc419', fillColor: '#fcc419', fillOpacity: 0.2, weight: 3 };
const DONE_STYLE = { color: '#4797fb', fillOpacity: 0.08, weight: 2, interactive: false };

function loadDrawnBy(): string {
  try {
    return localStorage.getItem(DRAWN_BY_KEY) ?? '';
  } catch {
    return '';
  }
}

function storeDrawnBy(name: string) {
  try {
    localStorage.setItem(DRAWN_BY_KEY, name);
  } catch {
    // Storage unavailable: the name is only a convenience.
  }
}

/** Geoman polygon editing for the current point; other points' fields are shown read-only. */
function DrawLayer({
  point,
  initial,
  others,
  onChange,
}: {
  point: RefPoint;
  initial: Polygon | null;
  others: Polygon[];
  onChange: (geometry: Polygon | null) => void;
}) {
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
      drawRectangle: false,
      drawCircle: false,
      drawText: false,
      cutPolygon: false,
      rotateMode: false,
      dragMode: false,
    });
    map.pm.setPathOptions(DRAW_STYLE);
    return () => {
      map.pm.removeControls();
    };
  }, [map]);

  useEffect(() => {
    map.setView([point.lat, point.lon], 16);
    const doneFields: FeatureCollection<Polygon> = {
      type: 'FeatureCollection',
      features: others.map((geometry) => ({ type: 'Feature', geometry, properties: {} })),
    };
    const done = L.geoJSON(doneFields, { style: DONE_STYLE, pmIgnore: true } as L.GeoJSONOptions).addTo(map);

    let field: L.Polygon | null = null;
    const report = () => onChangeRef.current(field ? (field.toGeoJSON().geometry as Polygon) : null);
    const adopt = (layer: L.Polygon) => {
      field = layer;
      field.on('pm:edit', report);
    };
    if (initial) {
      const layer = L.geoJSON(initial, { style: DRAW_STYLE }).getLayers()[0] as L.Polygon;
      layer.addTo(map);
      adopt(layer);
    }

    const onCreate = (e: { layer: L.Layer }) => {
      // One field per point: a new drawing replaces the old one.
      if (field) map.removeLayer(field);
      adopt(e.layer as L.Polygon);
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
      if (field) map.removeLayer(field);
      map.removeLayer(done);
    };
    // Re-run only when the point changes; `initial` and `others` are read at that moment.
  }, [map, point.id]);

  return null;
}

export default function ReferenceTool() {
  const [data, setData] = useState<ReferenceData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entries, setEntries] = useState<Record<string, Entry>>({});
  const [index, setIndex] = useState(0);
  const [draft, setDraft] = useState<Polygon | null>(null);
  const [overlayId, setOverlayId] = useState<string>('');
  const [overlayOpacity, setOverlayOpacity] = useState(1);
  const [drawnBy, setDrawnBy] = useState(loadDrawnBy);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    fetch('/dev-api/reference')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as ReferenceData;
      })
      .then((d) => {
        const loaded = geoJsonToEntries(d.fields);
        const pts = parsePoints(d.points);
        setData(d);
        setEntries(loaded);
        setOverlayId(d.overlays.find((o) => o.id.includes('ndvi'))?.id ?? '');
        const firstOpen = pts.findIndex((p) => !loaded[p.id]);
        setIndex(firstOpen === -1 ? 0 : firstOpen);
      })
      .catch((e: unknown) =>
        setLoadError(
          `Veri yüklenemedi: ${e instanceof Error ? e.message : String(e)}. Bu sayfa yalnızca "npm run dev" ile çalışır.`,
        ),
      );
  }, []);

  const points = useMemo(() => (data ? parsePoints(data.points) : []), [data]);
  const point = points[index];
  const target = (data?.points as { properties?: { target_fields?: number } } | undefined)?.properties?.target_fields ?? 50;
  const drawnCount = Object.values(entries).filter((e) => e.status === 'drawn').length;
  const skippedCount = Object.values(entries).filter((e) => e.status === 'skipped').length;
  const current = point ? entries[point.id] : undefined;

  useEffect(() => {
    setDraft(current?.status === 'drawn' ? current.geometry : null);
    setWarning(null);
    // Reset the draft only when moving to another point.
  }, [point?.id]);

  const persist = useCallback(async (next: Record<string, Entry>) => {
    setSaveState('saving');
    try {
      const r = await fetch('/dev-api/reference/fields', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(entriesToGeoJson(next)),
      });
      setSaveState(r.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, []);

  const commit = (entry: Entry) => {
    const next = { ...entries, [point.id]: entry };
    setEntries(next);
    void persist(next);
    const following = points.findIndex((p, i) => i > index && !next[p.id]);
    if (following !== -1) setIndex(following);
    else if (index < points.length - 1) setIndex(index + 1);
  };

  const saveDrawn = () => {
    if (!draft) return;
    if (!pointInRing(point.lon, point.lat, draft.coordinates[0])) {
      setWarning('Çizdiğiniz alan noktayı içermiyor. Noktanın düştüğü tarlayı çizin.');
      return;
    }
    commit({ status: 'drawn', geometry: draft, areaHa: polygonAreaHa(draft), drawnBy, drawnAt: new Date().toISOString() });
  };

  const skip = (reason: SkipReason) =>
    commit({ status: 'skipped', reason, drawnBy, drawnAt: new Date().toISOString() });

  const others = useMemo(
    () =>
      Object.entries(entries)
        .filter(([id, e]) => id !== point?.id && e.status === 'drawn')
        .map(([, e]) => (e as Extract<Entry, { status: 'drawn' }>).geometry),
    [entries, point?.id],
  );
  const overlay = data?.overlays.find((o) => o.id === overlayId);

  if (loadError) return <p className="m-6 rounded bg-red-50 p-4 text-red-800">{loadError}</p>;
  if (!data || !point) return <p className="m-6 text-soil-700">Yükleniyor…</p>;

  return (
    <div className="flex h-screen flex-col bg-cream text-soil-900 lg:flex-row">
      <aside className="flex w-full flex-col gap-4 overflow-y-auto border-soil-200 p-4 lg:w-96 lg:border-r">
        <header>
          <h1 className="text-lg font-semibold">Referans tarla çizimi</h1>
          <p className="text-sm text-soil-600">
            Segmentasyon doğruluğunu ölçmek için rastgele noktalardaki tarlaların sınırları. Hedef: {target} tarla.
          </p>
        </header>

        <div className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-1 flex justify-between font-medium">
            <span>
              Çizilen: {drawnCount} / {target}
            </span>
            <span className="text-soil-500">Atlanan: {skippedCount}</span>
          </div>
          <div className="h-2 rounded bg-soil-100">
            <div className="h-2 rounded bg-wheat-500" style={{ width: `${Math.min(100, (drawnCount / target) * 100)}%` }} />
          </div>
          {drawnCount >= target && <p className="mt-2 text-green-700">Hedefe ulaşıldı. Devam etmek zorunlu değil.</p>}
        </div>

        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium text-soil-700">Çizen</span>
          <input
            className={inputClass}
            value={drawnBy}
            placeholder="Adınız"
            onChange={(e) => {
              setDrawnBy(e.target.value);
              storeDrawnBy(e.target.value);
            }}
          />
        </label>

        <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <button className="rounded p-1 hover:bg-soil-100 disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Önceki nokta">
              <ChevronLeft size={18} />
            </button>
            <span className="font-semibold">
              {point.id} ({index + 1}/{points.length})
            </span>
            <button
              className="rounded p-1 hover:bg-soil-100 disabled:opacity-30"
              disabled={index === points.length - 1}
              onClick={() => setIndex(index + 1)}
              aria-label="Sonraki nokta"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {current && (
            <p className="mb-2 text-soil-600">
              Durum: {current.status === 'drawn' ? `çizildi (${fmt(current.areaHa, 2)} ha)` : `atlandı: ${SKIP_REASON_LABELS[current.reason]}`}
            </p>
          )}
          <ol className="mb-3 list-decimal space-y-1 pl-5 text-soil-700">
            <li>Siyah halkanın ortasındaki noktanın düştüğü tarlayı bulun.</li>
            <li>Soldaki çokgen aracıyla tarlanın sınırını çizin; köşeleri düzenleyebilirsiniz.</li>
            <li>Sınırlar 2025'e göre çizilmeli: Esri görüntüsü farklı bir yıla ait olabilir, emin olmak için 2025 katmanlarına bakın.</li>
          </ol>
          {draft && <p className="mb-2 text-soil-600">Çizilen alan: {fmt(polygonAreaHa(draft), 2)} ha</p>}
          {warning && <p className="mb-2 text-red-700">{warning}</p>}
          <button
            className="mb-2 flex w-full items-center justify-center gap-2 rounded-md bg-wheat-500 px-3 py-2 font-medium text-white hover:bg-wheat-600 disabled:opacity-40"
            disabled={!draft}
            onClick={saveDrawn}
          >
            <Save size={16} /> Kaydet ve sonraki
          </button>
          <p className="mb-1 text-xs text-soil-500">
            Yalnızca gerçekten çizilemiyorsa atlayın; zor ama çizilebilir tarlaları atlamak doğrulamayı kolay tarlalara kaydırır.
          </p>
          {(Object.keys(SKIP_REASON_LABELS) as SkipReason[]).map((reason) => (
            <button
              key={reason}
              className="mb-1 flex w-full items-center gap-2 rounded-md border border-soil-300 px-3 py-1.5 text-left hover:bg-soil-50"
              onClick={() => skip(reason)}
            >
              <CircleSlash size={14} /> {SKIP_REASON_LABELS[reason]}
            </button>
          ))}
          <p className="mt-2 text-xs text-soil-500">
            {saveState === 'saving' && 'Kaydediliyor…'}
            {saveState === 'saved' && 'pipeline/reference/reference_fields.geojson dosyasına kaydedildi.'}
            {saveState === 'error' && <span className="text-red-700">Kaydedilemedi. Geliştirme sunucusu çalışıyor mu?</span>}
          </p>
        </section>

        <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <h2 className="mb-2 font-medium">Altlık</h2>
          <label className="flex items-center gap-2">
            <input type="radio" checked={overlayId === ''} onChange={() => setOverlayId('')} /> Esri uydu görüntüsü (tarihi belirsiz)
          </label>
          {data.overlays.map((o) => (
            <label key={o.id} className="flex items-center gap-2">
              <input type="radio" checked={overlayId === o.id} onChange={() => setOverlayId(o.id)} /> {o.label}
            </label>
          ))}
          {overlay && (
            <label className="mt-2 flex items-center gap-2">
              Saydamlık
              <input type="range" min={0.2} max={1} step={0.1} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
            </label>
          )}
          <p className="mt-2 text-xs text-soil-500">
            Yanlış renk: kırmızı = yalnızca Mayıs'ta yeşil (kışlık tahıl), camgöbeği = Temmuz–Ağustos'ta yeşil (yazlık ürün), beyaz = tüm sezon yeşil.
          </p>
        </section>

        <section className="text-sm">
          <h2 className="mb-1 font-medium">Noktalar</h2>
          <div className="flex flex-wrap gap-1">
            {points.map((p, i) => {
              const e = entries[p.id];
              return (
                <button
                  key={p.id}
                  onClick={() => setIndex(i)}
                  title={p.id}
                  className={`flex h-7 w-9 items-center justify-center rounded text-xs ${
                    i === index ? 'ring-2 ring-wheat-500' : ''
                  } ${e?.status === 'drawn' ? 'bg-water-100 text-water-700' : e?.status === 'skipped' ? 'bg-soil-200 text-soil-600' : 'bg-white'}`}
                >
                  {e?.status === 'drawn' ? <CircleCheck size={14} /> : i + 1}
                </button>
              );
            })}
          </div>
        </section>
      </aside>

      <MapContainer center={[point.lat, point.lon]} zoom={16} maxZoom={19} className="min-h-[60vh] flex-1">
        <TileLayer url={ESRI_IMAGERY} attribution="Tiles © Esri; Sentinel-2 © Copernicus" maxZoom={19} />
        {overlay && <ImageOverlay url={`/dev-api/reference/overlay/${overlay.file}`} bounds={overlay.bounds} opacity={overlayOpacity} />}
        {/* Black ring with white centre stays visible on both imagery and false-colour NDVI. */}
        <CircleMarker center={[point.lat, point.lon]} radius={9} pathOptions={{ color: '#000', weight: 3, fill: false }} pmIgnore />
        <CircleMarker center={[point.lat, point.lon]} radius={4} pathOptions={{ color: '#000', weight: 1, fillColor: '#fff', fillOpacity: 1 }} pmIgnore />
        <DrawLayer point={point} initial={current?.status === 'drawn' ? current.geometry : null} others={others} onChange={setDraft} />
      </MapContainer>
    </div>
  );
}

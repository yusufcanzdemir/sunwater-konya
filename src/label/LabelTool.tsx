import centroid from '@turf/centroid';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { Crosshair, Shuffle } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ImageOverlay, MapContainer, TileLayer } from 'react-leaflet';
import { fmt, inputClass } from '../components/ui';
import {
  CurveChart,
  ESRI_IMAGERY,
  FieldsLayer,
  FitTo,
  MiniMap,
  loadName,
  overlayUrl,
  storeName,
  type FieldProps,
  type FieldSeries,
  type FieldStatus,
  type Overlay,
} from './fieldViews';
import { HINTS, LabelGuide } from './LabelGuide';
import { SKIP_CLASSES, classCounts, type Confidence, type LabelRow, type Sampling } from './labels';

interface LabelData {
  meta: { season: number; classes: Record<string, string>; min_per_class: number; target_total: [number, number] };
  fields: FeatureCollection<Polygon, FieldProps>;
  series: FieldSeries;
  order: { field_ids: string[] };
  overlays: Overlay[];
  labels: LabelRow[];
}

const LABELER_KEY = 'label.labeledBy';

export default function LabelTool() {
  const [data, setData] = useState<LabelData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<LabelRow[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [sampling, setSampling] = useState<Sampling>('random');
  const [confidence, setConfidence] = useState<Confidence>('high');
  const [labeledBy, setLabeledBy] = useState(() => loadName(LABELER_KEY));
  const [baseId, setBaseId] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch('/dev-api/label')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as LabelData;
      })
      .then((d) => {
        setData(d);
        setRows(d.labels);
        const done = new Set(d.labels.map((l) => l.field_id));
        setCurrentId(d.order.field_ids.find((id) => !done.has(id)) ?? null);
        setBaseId(d.overlays.find((o) => o.dir === '03_reference')?.id ?? '');
      })
      .catch((e: unknown) =>
        setLoadError(`Veri yüklenemedi: ${e instanceof Error ? e.message : String(e)}. Bu sayfa yalnızca "npm run dev" ile çalışır.`),
      );
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, Feature<Polygon, FieldProps>>();
    for (const f of data?.fields.features ?? []) m.set(f.properties.field_id, f);
    return m;
  }, [data]);
  const labelOf = useMemo(() => new Map(rows.map((r) => [r.field_id, r])), [rows]);
  const status = useMemo(() => {
    const s: Record<string, FieldStatus> = {};
    for (const r of rows) s[r.field_id] = r.class in SKIP_CLASSES ? 'skipped' : 'done';
    return s;
  }, [rows]);
  const counts = useMemo(() => classCounts(rows), [rows]);

  const feature = currentId ? (byId.get(currentId) ?? null) : null;
  const existing = currentId ? labelOf.get(currentId) : undefined;
  const series = currentId ? data?.series.fields[currentId] : undefined;

  const persist = useCallback(async (next: LabelRow[]) => {
    setSaveState('saving');
    try {
      const r = await fetch('/dev-api/label/labels', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      setSaveState(r.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, []);

  const nextRandom = (labelled: Set<string>) => data?.order.field_ids.find((id) => !labelled.has(id) && byId.has(id)) ?? null;

  const commit = (cls: string) => {
    if (!feature || !currentId || !data) return;
    const [lon, lat] = centroid(feature).geometry.coordinates;
    const row: LabelRow = {
      field_id: currentId,
      class: cls,
      confidence: cls in SKIP_CLASSES ? '' : confidence,
      // A field keeps the sampling it was first labelled under, so relabelling stays honest
      sampling: existing?.sampling ?? sampling,
      labeled_by: labeledBy,
      labeled_at: new Date().toISOString(),
      lon: Math.round(lon * 1e6) / 1e6,
      lat: Math.round(lat * 1e6) / 1e6,
    };
    const next = [...rows.filter((r) => r.field_id !== currentId), row];
    setRows(next);
    void persist(next);
    setConfidence('high');
    if (sampling === 'random') setCurrentId(nextRandom(new Set(next.map((r) => r.field_id))));
  };

  const classKeys = data ? Object.keys(data.meta.classes) : [];
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= classKeys.length) commitRef.current(classKeys[n - 1]);
      else if (e.key === 'e') commitRef.current('unsure');
      else if (e.key === 'k') setConfidence((c) => (c === 'high' ? 'medium' : 'high'));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [classKeys]);

  if (loadError) return <p className="m-6 rounded bg-red-50 p-4 text-red-800">{loadError}</p>;
  if (!data) return <p className="m-6 text-soil-700">Yükleniyor…</p>;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const [targetMin, targetMax] = data.meta.target_total;
  const base = data.overlays.find((o) => o.id === baseId);
  const rgbOverlays = data.overlays.filter((o) => o.dir === '04_labels');

  return (
    <div className="flex h-screen flex-col bg-cream text-soil-900 lg:flex-row">
      <aside className="flex w-full flex-col gap-3 overflow-y-auto border-soil-200 p-4 lg:w-[30rem] lg:border-r">
        <header>
          <h1 className="text-lg font-semibold">Ürün etiketleme ({data.meta.season})</h1>
          <p className="text-sm text-soil-600">
            Etiketler görüntü yorumudur: NDVI eğrisi ve sezon görüntülerine bakarak en olası ürünü seçin. Emin değilseniz söyleyin;
            yanlış etiket, eksik etiketten daha zararlıdır.
          </p>
        </header>

        <LabelGuide />

        <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-2 flex justify-between font-medium">
            <span>
              Toplam: {total} (hedef {targetMin}–{targetMax})
            </span>
            <span className="text-soil-500">{rows.length - total} atlandı</span>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1">
            {classKeys.map((k) => {
              const c = counts[k] ?? 0;
              return (
                <div key={k} className="contents">
                  <div className="flex items-center gap-2">
                    <span className="w-36 truncate">{data.meta.classes[k]}</span>
                    <div className="h-1.5 flex-1 rounded bg-soil-100">
                      <div
                        className={`h-1.5 rounded ${c >= data.meta.min_per_class ? 'bg-green-600' : 'bg-wheat-500'}`}
                        style={{ width: `${Math.min(100, (c / data.meta.min_per_class) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-right tabular-nums text-soil-600">
                    {c}/{data.meta.min_per_class}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <div className="flex gap-2 text-sm">
          <input
            className={`${inputClass} flex-1`}
            value={labeledBy}
            placeholder="Etiketleyen"
            onChange={(e) => {
              setLabeledBy(e.target.value);
              storeName(LABELER_KEY, e.target.value);
            }}
          />
          <button
            className={`flex items-center gap-1 rounded-md border px-2 ${sampling === 'random' ? 'border-wheat-500 bg-wheat-50' : 'border-soil-300'}`}
            onClick={() => {
              setSampling('random');
              setCurrentId(nextRandom(new Set(rows.map((r) => r.field_id))));
            }}
            title="Sıradaki rastgele tarla"
          >
            <Shuffle size={14} /> Rastgele
          </button>
          <button
            className={`flex items-center gap-1 rounded-md border px-2 ${sampling === 'targeted' ? 'border-wheat-500 bg-wheat-50' : 'border-soil-300'}`}
            onClick={() => setSampling('targeted')}
            title="Haritada tarlaya tıklayarak seçin; bu etiketler ayrıca işaretlenir"
          >
            <Crosshair size={14} /> Hedefli
          </button>
        </div>
        {sampling === 'targeted' && (
          <p className="rounded bg-amber-50 p-2 text-xs text-amber-800">
            Hedefli mod: haritada bir tarlaya tıklayın. Bu etiketler “hedefli” olarak kaydedilir ve doğruluk ölçümünde ayrı tutulur.
          </p>
        )}

        {feature && series ? (
          <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
            <div className="mb-1 flex justify-between">
              <span className="font-semibold">{currentId}</span>
              <span className="text-soil-600">
                {fmt(feature.properties.area_ha, 1)} ha · segment güveni {fmt(feature.properties.seg_confidence, 2)}
              </span>
            </div>
            {existing && (
              <p className="mb-1 text-soil-600">
                Mevcut etiket: {data.meta.classes[existing.class] ?? SKIP_CLASSES[existing.class as keyof typeof SKIP_CLASSES]}
              </p>
            )}
            <CurveChart series={data.series} fieldId={currentId!} />

            <div className="mt-2 flex items-center gap-3 text-xs">
              <span className="font-medium">Güven:</span>
              <label className="flex items-center gap-1">
                <input type="radio" checked={confidence === 'high'} onChange={() => setConfidence('high')} /> Eminim
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" checked={confidence === 'medium'} onChange={() => setConfidence('medium')} /> Kısmen eminim
              </label>
              <span className="text-soil-500">(k tuşu)</span>
            </div>

            <div className="mt-2 grid grid-cols-1 gap-1">
              {classKeys.map((k, i) => (
                <button
                  key={k}
                  onClick={() => commit(k)}
                  className={`rounded-md border px-2 py-1 text-left hover:bg-wheat-50 ${existing?.class === k ? 'border-water-500 bg-water-50' : 'border-soil-300'}`}
                >
                  <span className="mr-2 inline-block w-4 text-soil-500">{i + 1}</span>
                  <span className="font-medium">{data.meta.classes[k]}</span>
                  {HINTS[k] && <span className="block pl-6 text-xs text-soil-500">{HINTS[k]}</span>}
                </button>
              ))}
              <div className="mt-1 grid grid-cols-2 gap-1">
                <button className="rounded-md border border-soil-300 px-2 py-1 hover:bg-soil-50" onClick={() => commit('unsure')}>
                  {SKIP_CLASSES.unsure} (e)
                </button>
                <button
                  className="rounded-md border border-soil-300 px-2 py-1 hover:bg-soil-50"
                  onClick={() => commit('bad_segment')}
                  title="Çokgen birden fazla tarlayı kapsıyor ya da tarlanın küçük bir parçası"
                >
                  {SKIP_CLASSES.bad_segment}
                </button>
              </div>
            </div>
            <p className="mt-2 text-xs text-soil-500">
              {saveState === 'saving' && 'Kaydediliyor…'}
              {saveState === 'saved' && 'pipeline/04_labels/labels.csv dosyasına kaydedildi.'}
              {saveState === 'error' && <span className="text-red-700">Kaydedilemedi. Geliştirme sunucusu çalışıyor mu?</span>}
            </p>
          </section>
        ) : (
          <p className="rounded bg-white p-3 text-sm shadow-sm">
            {sampling === 'targeted' ? 'Haritada bir tarlaya tıklayın.' : 'Rastgele sırada etiketlenmemiş tarla kalmadı.'}
          </p>
        )}
      </aside>

      <main className="flex min-h-[70vh] flex-1 flex-col">
        <div className="flex flex-wrap items-center gap-3 border-b border-soil-200 bg-white px-3 py-1.5 text-sm">
          <span className="font-medium">Altlık:</span>
          <label className="flex items-center gap-1">
            <input type="radio" checked={baseId === ''} onChange={() => setBaseId('')} /> Esri
          </label>
          {data.overlays.map((o) => (
            <label key={o.id} className="flex items-center gap-1">
              <input type="radio" checked={baseId === o.id} onChange={() => setBaseId(o.id)} /> {o.label}
            </label>
          ))}
        </div>
        <MapContainer center={[37.8, 33.45]} zoom={13} maxZoom={19} className="flex-1" preferCanvas>
          <TileLayer url={ESRI_IMAGERY} attribution="Tiles © Esri; Sentinel-2 © Copernicus" maxZoom={19} />
          {base && <ImageOverlay url={overlayUrl(base)} bounds={base.bounds} />}
          <FieldsLayer
            fields={data.fields}
            status={status}
            currentId={currentId}
            onSelect={(id) => {
              if (sampling === 'targeted' || labelOf.has(id)) setCurrentId(id);
            }}
          />
          <FitTo feature={feature} padding={120} />
        </MapContainer>
        {feature && (
          <div className="grid grid-cols-2 gap-2 border-t border-soil-200 bg-white p-2 md:grid-cols-4">
            {rgbOverlays.map((o) => (
              <MiniMap key={o.id} overlay={o} feature={feature} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

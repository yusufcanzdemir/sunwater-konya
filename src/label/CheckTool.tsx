import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
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
import type { CheckRow, Verdict } from './labels';

interface CheckData {
  meta: { season: number; classes: Record<string, string> };
  fields: FeatureCollection<Polygon, FieldProps>;
  series: FieldSeries;
  overlays: Overlay[];
  proposals: Record<string, { class: string; prob: number }> | null;
  checkSample: { field_ids: string[] } | null;
  checks: CheckRow[];
}

const CHECKER_KEY = 'check.checkedBy';

/**
 * Plausibility check of automatically proposed crop classes (PLAN.md D14). The proposal is
 * hidden until the checker has looked at the curve and images, to limit anchoring.
 */
export default function CheckTool() {
  const [data, setData] = useState<CheckData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rows, setRows] = useState<CheckRow[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [disagreeing, setDisagreeing] = useState(false);
  const [checkedBy, setCheckedBy] = useState(() => loadName(CHECKER_KEY));
  const [baseId, setBaseId] = useState('');
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    fetch('/dev-api/label')
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as CheckData;
      })
      .then((d) => {
        if (!d.proposals || !d.checkSample) throw new Error('önce pipeline/06_classify.py çalıştırılmalı');
        setData(d);
        setRows(d.checks);
        const done = new Set(d.checks.map((c) => c.field_id));
        const first = d.checkSample.field_ids.findIndex((id) => !done.has(id));
        setIndex(first === -1 ? 0 : first);
        setBaseId(d.overlays.find((o) => o.dir === '03_reference')?.id ?? '');
      })
      .catch((e: unknown) =>
        setLoadError(`Veri yüklenemedi: ${e instanceof Error ? e.message : String(e)}. Bu sayfa yalnızca "npm run dev" ile çalışır.`),
      );
  }, []);

  const sample = data?.checkSample?.field_ids ?? [];
  const currentId = sample[index] ?? null;
  const byId = useMemo(() => {
    const m = new Map<string, Feature<Polygon, FieldProps>>();
    for (const f of data?.fields.features ?? []) m.set(f.properties.field_id, f);
    return m;
  }, [data]);
  const checkOf = useMemo(() => new Map(rows.map((r) => [r.field_id, r])), [rows]);
  const status = useMemo(() => {
    const s: Record<string, FieldStatus> = {};
    for (const r of rows) s[r.field_id] = 'done';
    return s;
  }, [rows]);

  useEffect(() => {
    // Each field starts hidden again, unless it was already checked
    setRevealed(currentId ? checkOf.has(currentId) : false);
    setDisagreeing(false);
    // Only when moving to another field.
  }, [currentId]);

  const persist = useCallback(async (next: CheckRow[]) => {
    setSaveState('saving');
    try {
      const r = await fetch('/dev-api/label/checks', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
      setSaveState(r.ok ? 'saved' : 'error');
    } catch {
      setSaveState('error');
    }
  }, []);

  const proposal = currentId ? data?.proposals?.[currentId] : undefined;
  const commit = (verdict: Verdict, correctClass = '') => {
    if (!currentId || !proposal || !revealed) return;
    const row: CheckRow = {
      field_id: currentId,
      proposed: proposal.class,
      verdict,
      correct_class: correctClass,
      checked_by: checkedBy,
      checked_at: new Date().toISOString(),
    };
    const next = [...rows.filter((r) => r.field_id !== currentId), row];
    setRows(next);
    void persist(next);
    const done = new Set(next.map((r) => r.field_id));
    const following = sample.findIndex((id, i) => i > index && !done.has(id));
    if (following !== -1) setIndex(following);
  };

  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'g') setRevealed(true);
      else if (e.key === 'u') commitRef.current('agree');
      else if (e.key === 'd') setDisagreeing(true);
      else if (e.key === 'e') commitRef.current('unsure');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (loadError) return <p className="m-6 rounded bg-red-50 p-4 text-red-800">{loadError}</p>;
  if (!data || !currentId) return <p className="m-6 text-soil-700">Yükleniyor…</p>;

  const feature = byId.get(currentId) ?? null;
  const existing = checkOf.get(currentId);
  const classes = data.meta.classes;
  const base = data.overlays.find((o) => o.id === baseId);
  const rgbOverlays = data.overlays.filter((o) => o.dir === '04_labels');
  const verdictText: Record<Verdict, string> = { agree: 'uygun', disagree: 'uygun değil', unsure: 'emin değilim' };

  return (
    <div className="flex h-screen flex-col bg-cream text-soil-900 lg:flex-row">
      <aside className="flex w-full flex-col gap-3 overflow-y-auto border-soil-200 p-4 lg:w-[30rem] lg:border-r">
        <header>
          <h1 className="text-lg font-semibold">Sınıf kontrolü ({data.meta.season})</h1>
          <p className="text-sm text-soil-600">
            Ürün sınıflarını eğri gruplarından otomatik ürettik. Burada rastgele {sample.length} tarlada önerinin makul olup olmadığına
            bakıyorsunuz. Önce eğriye ve görüntülere bakıp kendi tahmininizi yapın, sonra öneriyi açın.
          </p>
        </header>

        <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-1 flex justify-between font-medium">
            <span>
              Kontrol edilen: {rows.length} / {sample.length}
            </span>
            <span className="text-soil-500">
              {rows.filter((r) => r.verdict === 'agree').length} uygun · {rows.filter((r) => r.verdict === 'disagree').length} değil
            </span>
          </div>
          <div className="h-2 rounded bg-soil-100">
            <div className="h-2 rounded bg-wheat-500" style={{ width: `${(rows.length / sample.length) * 100}%` }} />
          </div>
        </section>

        <input
          className={inputClass}
          value={checkedBy}
          placeholder="Kontrol eden"
          onChange={(e) => {
            setCheckedBy(e.target.value);
            storeName(CHECKER_KEY, e.target.value);
          }}
        />

        <LabelGuide />

        <section className="rounded-lg bg-white p-3 text-sm shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <button className="rounded p-1 hover:bg-soil-100 disabled:opacity-30" disabled={index === 0} onClick={() => setIndex(index - 1)} aria-label="Önceki">
              <ChevronLeft size={18} />
            </button>
            <span className="font-semibold">
              {currentId} ({index + 1}/{sample.length})
            </span>
            <button
              className="rounded p-1 hover:bg-soil-100 disabled:opacity-30"
              disabled={index === sample.length - 1}
              onClick={() => setIndex(index + 1)}
              aria-label="Sonraki"
            >
              <ChevronRight size={18} />
            </button>
          </div>
          {feature && (
            <p className="mb-1 text-right text-soil-600">
              {fmt(feature.properties.area_ha, 1)} ha · segment güveni {fmt(feature.properties.seg_confidence, 2)}
            </p>
          )}
          <CurveChart series={data.series} fieldId={currentId} />

          {!revealed ? (
            <button
              className="mt-2 flex w-full items-center justify-center gap-2 rounded-md bg-wheat-500 px-3 py-2 font-medium text-white hover:bg-wheat-600"
              onClick={() => setRevealed(true)}
            >
              <Eye size={16} /> Tahminimi yaptım, öneriyi göster (g)
            </button>
          ) : (
            proposal && (
              <div className="mt-2 space-y-2">
                <div className="rounded-md bg-wheat-50 p-2">
                  <p>
                    Önerilen: <b>{classes[proposal.class] ?? proposal.class}</b>{' '}
                    <span className="text-soil-500">(olasılık %{fmt(proposal.prob * 100)})</span>
                  </p>
                  {HINTS[proposal.class] && <p className="text-xs text-soil-600">Beklenen eğri: {HINTS[proposal.class]}</p>}
                </div>
                {existing && (
                  <p className="text-xs text-soil-600">
                    Önceki kararınız: {verdictText[existing.verdict]}
                    {existing.correct_class && ` (doğrusu: ${classes[existing.correct_class]})`}
                  </p>
                )}
                {!disagreeing ? (
                  <div className="grid grid-cols-3 gap-1">
                    <button className="rounded-md bg-green-600 px-2 py-2 font-medium text-white hover:bg-green-700" onClick={() => commit('agree')}>
                      Uygun (u)
                    </button>
                    <button className="rounded-md bg-red-600 px-2 py-2 font-medium text-white hover:bg-red-700" onClick={() => setDisagreeing(true)}>
                      Uygun değil (d)
                    </button>
                    <button className="rounded-md border border-soil-300 px-2 py-2 hover:bg-soil-50" onClick={() => commit('unsure')}>
                      Emin değilim (e)
                    </button>
                  </div>
                ) : (
                  <div>
                    <p className="mb-1 text-xs text-soil-600">Doğrusu hangisi? Bilmiyorsanız “Bilmiyorum” deyin.</p>
                    <div className="grid grid-cols-2 gap-1">
                      {Object.entries(classes)
                        .filter(([k]) => k !== proposal.class)
                        .map(([k, name]) => (
                          <button key={k} className="rounded-md border border-soil-300 px-2 py-1 text-left hover:bg-wheat-50" onClick={() => commit('disagree', k)}>
                            {name}
                          </button>
                        ))}
                      <button className="rounded-md border border-soil-300 px-2 py-1 hover:bg-soil-50" onClick={() => commit('disagree')}>
                        Bilmiyorum
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          )}
          <p className="mt-2 text-xs text-soil-500">
            {saveState === 'saving' && 'Kaydediliyor…'}
            {saveState === 'saved' && 'pipeline/04_labels/checks.csv dosyasına kaydedildi.'}
            {saveState === 'error' && <span className="text-red-700">Kaydedilemedi. Geliştirme sunucusu çalışıyor mu?</span>}
          </p>
        </section>
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
              const i = sample.indexOf(id);
              if (i !== -1) setIndex(i);
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

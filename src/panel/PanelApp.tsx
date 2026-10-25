// Institutional panel (/panel, PLAN.md stage 13): map, filters, cards, field panel, basin, method.

import { useEffect, useMemo, useState } from 'react';
import { fmt } from '../components/ui';
import BasinView from './BasinView';
import { FilterBar, Legend, MapPlayer, QueryBox, SummaryCards } from './Controls';
import FieldDetail, { StatusChip } from './FieldDetail';
import FieldsMap, { type PlayerFrame } from './FieldsMap';
import MethodView from './MethodView';
import { SCENARIO_NAMES, loadFields, loadManifest, ratioOf, statusOf, type FieldRow, type Manifest, type Scenario } from './data';
import { EMPTY_QUERY, applyQuery, type FieldQuery } from './query';
import { fieldsCsv, summarize } from './summary';

type Tab = 'map' | 'basin' | 'method';
const TABS: [Tab, string][] = [
  ['map', 'Harita'],
  ['basin', 'Havza'],
  ['method', 'Yöntem ve Doğrulama'],
];

const LIST_LIMIT = 50;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PanelApp() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [season, setSeason] = useState<number | null>(null);
  const [scenario, setScenario] = useState<Scenario>('s1');
  const [tab, setTab] = useState<Tab>('map');
  const [rows, setRows] = useState<FieldRow[] | null>(null);
  const [query, setQuery] = useState<FieldQuery>(EMPTY_QUERY);
  // /panel?field=F01234 (Telegram summary link) opens that field
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('field'));
  const [player, setPlayer] = useState<{ frame: PlayerFrame; date: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Konya Su Bütçesi – Kurum Paneli';
    loadManifest().then(
      (m) => {
        setManifest(m);
        setSeason(m.seasons[0]);
      },
      () => setError('Veri bulunamadı (public/data). Önce pipeline/12_export.py çalıştırılmalı.'),
    );
  }, []);

  useEffect(() => {
    if (season == null) return;
    setRows(null);
    loadFields(season).then(setRows, () => setError('Tarla tablosu yüklenemedi.'));
  }, [season]);

  const filtered = useMemo(() => (rows ? applyQuery(rows, query, scenario) : []), [rows, query, scenario]);
  const isFiltered = JSON.stringify(query) !== JSON.stringify(EMPTY_QUERY);
  const visibleIds = useMemo(() => (isFiltered ? filtered.map((f) => f.field_id) : null), [filtered, isFiltered]);
  const summary = useMemo(() => summarize(filtered, scenario), [filtered, scenario]);
  const selected = useMemo(() => rows?.find((f) => f.field_id === selectedId) ?? null, [rows, selectedId]);
  const list = useMemo(() => {
    // Without an explicit sort, list the largest budget ratios first
    if (query.sort_by) return filtered.slice(0, LIST_LIMIT);
    return [...filtered].sort((a, b) => (ratioOf(b, scenario) ?? -1) - (ratioOf(a, scenario) ?? -1)).slice(0, LIST_LIMIT);
  }, [filtered, query.sort_by, scenario]);

  if (error) return <p className="p-6 text-red-700">{error}</p>;
  if (!manifest || season == null) return <p className="p-6 text-soil-500">Yükleniyor…</p>;
  const classNames = manifest.classes;

  return (
    <div className="min-h-screen">
      <header className="border-b border-soil-200 bg-white">
        <div className="mx-auto flex max-w-screen-2xl flex-wrap items-center gap-3 px-4 py-3">
          <div className="mr-auto">
            <h1 className="text-lg font-semibold text-soil-900">Konya Su Bütçesi · Kurum Paneli</h1>
            <p className="text-xs text-soil-500">Karapınar kuzey/kuzeybatı pilot alanı · uydu tabanlı mavi su (yeraltı suyu) tüketimi</p>
          </div>
          <label className="text-xs text-soil-700">
            Sezon{' '}
            <select className="rounded border border-soil-300 bg-white px-1.5 py-1 text-sm" value={season} onChange={(e) => { setSeason(Number(e.target.value)); setSelectedId(null); }}>
              {manifest.seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-soil-700">
            Senaryo{' '}
            <select className="rounded border border-soil-300 bg-white px-1.5 py-1 text-sm" value={scenario} onChange={(e) => setScenario(e.target.value as Scenario)}>
              {(['s1', 's2'] as Scenario[]).map((s) => (
                <option key={s} value={s}>
                  {SCENARIO_NAMES[s]}
                </option>
              ))}
            </select>
          </label>
          <nav className="flex gap-1" aria-label="Sekmeler">
            {TABS.map(([id, name]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                aria-current={tab === id ? 'page' : undefined}
                className={`rounded-md px-3 py-1.5 text-sm ${tab === id ? 'bg-soil-800 text-white' : 'text-soil-700 hover:bg-soil-100'}`}
              >
                {name}
              </button>
            ))}
          </nav>
          <a href="/" className="text-xs text-soil-600 underline">
            Çiftçi planlayıcı
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-screen-2xl space-y-3 px-4 py-4">
        {tab === 'map' && (
          <>
            <div className="grid gap-3 lg:grid-cols-[2fr_1fr]">
              <FilterBar query={query} onChange={setQuery} classNames={classNames} scenario={scenario} />
              <QueryBox classNames={classNames} onQuery={setQuery} />
            </div>
            {!rows ? (
              <p className="text-sm text-soil-500">Tarlalar yükleniyor…</p>
            ) : (
              <SummaryCards summary={summary} scenario={scenario} classNames={classNames} onCsv={() => download(`tarlalar_${season}_${scenario}.csv`, fieldsCsv(filtered))} />
            )}
            {scenario === 's1' ? (
              <p className="text-xs text-soil-600">
                Durum, aynı ürünün tipik tarlasının damla sulamayla beklenen tüketimine göredir: "aşım" verimli sulamaya göre tasarruf potansiyeli
                demektir. Uydu tüketimi görür, toprağa sızan fazla suyu görmez.
              </p>
            ) : (
              <p className="text-xs text-soil-600">
                S2, pilot toplam mavi suyun %{fmt(manifest.budget_parameters.s2_reduction * 100)} azaltılması hedefidir (varsayım); azaltım tarlalara
                ürün bazlı ihtiyaç oranında dağıtılır.
              </p>
            )}
            <div className="grid gap-3 lg:grid-cols-[1fr_380px]">
              <div className="relative h-[68vh] min-h-[420px]">
                <FieldsMap
                  season={season}
                  scenario={scenario}
                  visibleIds={visibleIds}
                  selected={selected}
                  onSelect={setSelectedId}
                  classNames={classNames}
                  player={player?.frame ?? null}
                />
                <div className="absolute top-2 left-2">
                  <MapPlayer season={season} onFrame={(frame, date) => setPlayer(frame && date ? { frame, date } : null)} />
                </div>
                <div className="absolute bottom-6 left-2">
                  <Legend playerOn={player != null} />
                </div>
              </div>
              <div className="h-[68vh] min-h-[420px]">
                {selected ? (
                  <FieldDetail field={selected} season={season} scenario={scenario} manifest={manifest} onClose={() => setSelectedId(null)} />
                ) : (
                  <div className="flex h-full flex-col rounded-lg border border-soil-200 bg-white">
                    <p className="border-b border-soil-100 p-3 text-xs text-soil-600">
                      {fmt(filtered.length)} tarla{filtered.length > LIST_LIMIT ? `, ilk ${LIST_LIMIT} gösteriliyor` : ''}. Ayrıntı için listeden ya da haritadan bir tarla seçin.
                    </p>
                    <ul className="flex-1 overflow-y-auto">
                      {list.map((f) => (
                        <li key={f.field_id}>
                          <button className="flex w-full items-center justify-between gap-2 border-b border-soil-50 px-3 py-1.5 text-left text-xs hover:bg-soil-50" onClick={() => setSelectedId(f.field_id)}>
                            <span>
                              <span className="font-semibold text-soil-900">{f.field_id}</span>{' '}
                              <span className="text-soil-600">
                                {classNames[f.class] ?? f.class} · {fmt(f.area_ha, 1)} ha
                              </span>
                            </span>
                            <span className="flex items-center gap-2">
                              <span className="tabular-nums text-soil-700">{ratioOf(f, scenario) == null ? '–' : fmt(ratioOf(f, scenario) as number, 2)}</span>
                              <StatusChip status={statusOf(f, scenario)} />
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
        {tab === 'basin' && <BasinView />}
        {tab === 'method' && <MethodView manifest={manifest} />}
      </main>
    </div>
  );
}

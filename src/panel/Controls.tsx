// Filter row, natural-language query box, summary cards and the whole-map season player.

import { Download, Pause, Play, Search, Sparkles } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { requestParseQuery } from '../ai/client';
import { fmt, inputClass } from '../components/ui';
import { PLAYER_STOPS, type PlayerFrame } from './FieldsMap';
import { SCENARIO_NAMES, STATUSES, STATUS_COLORS, STATUS_NAMES, loadSeasonPlayer, type Scenario, type SeasonPlayerData } from './data';
import { CLASS_IDS, EMPTY_QUERY, REGIONS, REGION_NAMES, describeQuery, type ClassId, type FieldQuery, type Region } from './query';
import type { Summary } from './summary';

const chip = (on: boolean) =>
  `rounded-full border px-2.5 py-1 text-xs font-medium transition ${
    on ? 'border-soil-700 bg-soil-800 text-white' : 'border-soil-300 bg-white text-soil-700 hover:border-soil-500'
  }`;

export function FilterBar({
  query,
  onChange,
  classNames,
}: {
  query: FieldQuery;
  onChange: (q: FieldQuery) => void;
  classNames: Record<string, string>;
}) {
  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const num = (v: string) => (v.trim() === '' || Number.isNaN(Number(v.replace(',', '.'))) ? null : Number(v.replace(',', '.')));
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm" role="group" aria-label="Filtreler">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-soil-600">Ürün</span>
        {CLASS_IDS.map((c) => (
          <button key={c} className={chip(query.classes.includes(c))} aria-pressed={query.classes.includes(c)} onClick={() => onChange({ ...query, classes: toggle<ClassId>(query.classes, c) })}>
            {classNames[c] ?? c}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-semibold text-soil-600">Durum</span>
        {STATUSES.map((s) => (
          <button key={s} className={chip(query.statuses.includes(s))} aria-pressed={query.statuses.includes(s)} onClick={() => onChange({ ...query, statuses: toggle(query.statuses, s) })}>
            <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: STATUS_COLORS[s] }} aria-hidden />
            {STATUS_NAMES[s]}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-xs text-soil-700">
          Alan (ha)
          <input className={`${inputClass} w-16 py-0.5 text-xs`} inputMode="decimal" placeholder="en az" value={query.area_min_ha ?? ''} onChange={(e) => onChange({ ...query, area_min_ha: num(e.target.value) })} />
          –
          <input className={`${inputClass} w-16 py-0.5 text-xs`} inputMode="decimal" placeholder="en çok" value={query.area_max_ha ?? ''} onChange={(e) => onChange({ ...query, area_max_ha: num(e.target.value) })} />
        </label>
        <label className="ml-2 flex items-center gap-1 text-xs text-soil-700">
          Bölge
          <select className={`${inputClass} py-0.5 text-xs`} value={query.region ?? ''} onChange={(e) => onChange({ ...query, region: (e.target.value || null) as Region | null })}>
            <option value="">tümü</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {REGION_NAMES[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="ml-2 flex items-center gap-1 text-xs text-soil-700">
          <input type="checkbox" checked={query.stress_only} onChange={(e) => onChange({ ...query, stress_only: e.target.checked })} />
          gelişimi zayıf görünenler
        </label>
        <label className="ml-2 flex items-center gap-1 text-xs text-soil-700">
          <input type="checkbox" checked={!query.include_uncertain} onChange={(e) => onChange({ ...query, include_uncertain: !e.target.checked })} />
          yalnızca ürünü kesin olanlar
        </label>
        <button className="ml-auto text-xs text-soil-600 underline" onClick={() => onChange(EMPTY_QUERY)}>
          Filtreleri temizle
        </button>
      </div>
    </div>
  );
}

export function QueryBox({
  classNames,
  onQuery,
}: {
  classNames: Record<string, string>;
  onQuery: (q: FieldQuery) => void;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ reading: string; note: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { query, note } = await requestParseQuery(text.trim());
      onQuery(query);
      setResult({ reading: describeQuery(query, classNames), note });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <label className="flex items-center gap-2 text-xs font-semibold text-soil-600" htmlFor="nlq">
        <Sparkles size={14} aria-hidden /> Yapay zekâya sor
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id="nlq"
          className={`${inputClass} flex-1 text-sm`}
          placeholder="ör. kuzeyde hedefi en çok aşan 20 pancar tarlası"
          value={text}
          maxLength={300}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={busy} className="flex items-center gap-1 rounded-md bg-soil-800 px-3 text-sm font-medium text-white disabled:opacity-50">
          <Search size={14} aria-hidden /> {busy ? 'Yorumlanıyor…' : 'Uygula'}
        </button>
      </div>
      {result && (
        <p className="mt-2 text-xs text-soil-700">
          <span className="font-semibold">Gösterilen:</span> {result.reading}.
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
    </form>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium text-stone-500">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight text-stone-900">{value}</div>
      {sub && <div className="text-xs text-stone-500">{sub}</div>}
    </div>
  );
}

export function SummaryCards({ summary, scenario, classNames, onCsv }: { summary: Summary; scenario: Scenario; classNames: Record<string, string>; onCsv: () => void }) {
  const mm3 = (m3: number) => fmt(m3 / 1e6, 1);
  const diff = summary.budgetM3 - summary.measuredM3;
  const over = summary.byStatus.over;
  const maxClass = Math.max(1, ...summary.byClass.map((c) => c.measuredM3));
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      <Card label="Yeraltı suyu tüketimi" value={`${mm3(summary.measuredM3)} milyon m³`} sub={`${fmt(summary.fields)} tarla · ${fmt(summary.areaHa)} ha`} />
      <Card
        label={SCENARIO_NAMES[scenario]}
        value={`${mm3(summary.budgetM3)} milyon m³`}
        sub={diff < 0 ? `${mm3(-diff)} milyon m³ tasarruf mümkün` : 'hedefin altında'}
      />
      <Card label="Hedefi aşan" value={`${fmt(over.fields)} tarla`} sub={`${fmt(over.areaHa)} ha · sınırda ${fmt(summary.byStatus.borderline.fields)}`} />
      <Card label="Pompa enerjisi" value={`${fmt(summary.energyKwh / 1e6, 1)} GWh`} sub="bu sezon" />
      <div className="col-span-2 rounded-2xl border border-black/5 bg-white p-4 shadow-sm lg:col-span-1">
        <div className="flex items-center justify-between text-xs font-medium text-stone-500">
          Ürüne göre tüketim (milyon m³)
          <button onClick={onCsv} className="flex items-center gap-1 text-soil-700 underline">
            <Download size={12} aria-hidden /> CSV
          </button>
        </div>
        <ul className="mt-1 space-y-0.5">
          {summary.byClass
            .filter((c) => c.measuredM3 > 0)
            .slice(0, 6)
            .map((c) => (
              <li key={c.cls} className="text-[11px] text-soil-700" title={`${fmt(c.measuredM3)} m³, ${fmt(c.fields)} tarla`}>
                <div className="flex justify-between">
                  <span>{classNames[c.cls] ?? c.cls}</span>
                  <span className="font-semibold text-soil-900">{mm3(c.measuredM3)}</span>
                </div>
                <div className="h-1 rounded-full bg-soil-100">
                  <div className="h-1 rounded-full" style={{ width: `${(100 * c.measuredM3) / maxClass}%`, background: '#2a78d6' }} />
                </div>
              </li>
            ))}
        </ul>
      </div>
    </div>
  );
}

export function Legend({ playerOn }: { playerOn: boolean }) {
  if (playerOn) {
    return (
      <div className="rounded-md bg-white/90 p-2 text-[11px] text-soil-800 shadow">
        <div className="font-semibold">Kümülatif mavi su (mm)</div>
        <div className="mt-1 flex">
          {PLAYER_STOPS.map(([v, c]) => (
            <div key={v} className="flex flex-col items-center">
              <span className="h-2.5 w-8" style={{ background: c }} />
              <span>{v}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <ul className="space-y-0.5 rounded-md bg-white/90 p-2 text-[11px] text-soil-800 shadow">
      {STATUSES.map((s) => (
        <li key={s} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: STATUS_COLORS[s] }} aria-hidden />
          {STATUS_NAMES[s]}
        </li>
      ))}
    </ul>
  );
}

const STEP_MS = 350;

/** Whole-map season player: weekly cumulative blue water of every field. */
export function MapPlayer({ season, onFrame }: { season: number; onFrame: (f: PlayerFrame | null, date: string | null) => void }) {
  const [data, setData] = useState<SeasonPlayerData | null>(null);
  const [on, setOn] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [i, setI] = useState(0);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setData(null);
    setOn(false);
    setPlaying(false);
    setI(0);
    onFrame(null, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season]);

  useEffect(() => {
    if (!on) return;
    if (!data) {
      loadSeasonPlayer(season).then(setData, () => setOn(false));
      return;
    }
    onFrame({ ids: data.field_ids, values: data.cum_blue_mm.map((r) => r[i]) }, data.dates[i]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [on, data, i]);

  useEffect(() => {
    if (!playing || !data) return;
    timer.current = window.setInterval(() => {
      setI((x) => {
        if (x >= data.dates.length - 1) {
          setPlaying(false);
          return x;
        }
        return x + 1;
      });
    }, STEP_MS);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
    };
  }, [playing, data]);

  const toggle = () => {
    if (on) {
      setOn(false);
      setPlaying(false);
      onFrame(null, null);
    } else setOn(true);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-white/90 p-2 text-xs text-soil-800 shadow">
      <button onClick={toggle} className={chip(on)} aria-pressed={on}>
        Sezon oynatıcı
      </button>
      {on && data && (
        <>
          <button
            onClick={() => {
              if (i >= data.dates.length - 1) setI(0);
              setPlaying((p) => !p);
            }}
            className="rounded p-1 hover:bg-soil-100"
            aria-label={playing ? 'Durdur' : 'Oynat'}
          >
            {playing ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <input
            type="range"
            min={0}
            max={data.dates.length - 1}
            value={i}
            onChange={(e) => {
              setPlaying(false);
              setI(Number(e.target.value));
            }}
            aria-label="Sezon tarihi"
            className="w-40"
          />
          <span className="font-semibold tabular-nums">{data.dates[i].split('-').reverse().join('.')}</span>
        </>
      )}
      {on && !data && <span>yükleniyor…</span>}
    </div>
  );
}

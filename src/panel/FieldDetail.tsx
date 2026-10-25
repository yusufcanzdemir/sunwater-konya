// Side panel for one field: crop, status against the chosen scenario, daily series and levers.

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../components/ui';
import {
  STATUS_COLORS,
  STATUS_NAMES,
  budgetOf,
  loadFieldDetail,
  ratioOf,
  statusOf,
  type FieldDetailData,
  type FieldRow,
  type Manifest,
  type Scenario,
} from './data';
import { excessM3 } from './query';

const INK = '#52514e';
const GRID = '#e1e0d9';
const SERIES_1 = '#2a78d6';
const SERIES_2 = '#eb6834';

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

export function StatusChip({ status }: { status: keyof typeof STATUS_NAMES }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-soil-200 bg-white px-2 py-0.5 text-xs font-medium text-soil-800">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[status] }} aria-hidden />
      {STATUS_NAMES[status]}
    </span>
  );
}

function Chart({
  title,
  data,
  lines,
  unit,
}: {
  title: string;
  data: Record<string, number | string | null>[];
  lines: { key: string; name: string; color: string; dashed?: boolean }[];
  unit: string;
}) {
  return (
    <figure className="mt-3">
      <figcaption className="mb-1 text-xs font-semibold text-soil-700">{title}</figcaption>
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="date" tickFormatter={shortDate} tick={{ fontSize: 10, fill: INK }} minTickGap={28} stroke={GRID} />
            <YAxis tick={{ fontSize: 10, fill: INK }} stroke={GRID} width={44} />
            <Tooltip
              labelFormatter={(d) => shortDate(String(d))}
              formatter={(v) => (v == null ? '–' : `${fmt(Number(v), unit === '' ? 2 : 0)} ${unit}`)}
              contentStyle={{ fontSize: 12 }}
            />
            {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 11 }} iconType="plainline" />}
            {lines.map((l) => (
              <Line
                key={l.key}
                dataKey={l.key}
                name={l.name}
                stroke={l.color}
                strokeWidth={2}
                strokeDasharray={l.dashed ? '5 4' : undefined}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

export default function FieldDetail({
  field,
  season,
  scenario,
  manifest,
  onClose,
}: {
  field: FieldRow;
  season: number;
  scenario: Scenario;
  manifest: Manifest;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<FieldDetailData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setDetail(null);
    setError(null);
    loadFieldDetail(field.field_id).then(setDetail, () => setError('Tarla ayrıntısı yüklenemedi.'));
  }, [field.field_id]);

  const names = manifest.classes;
  const p = manifest.budget_parameters;
  const s = detail?.seasons[String(season)];
  const status = statusOf(field, scenario);
  const budget = budgetOf(field, scenario);
  const ratio = ratioOf(field, scenario);
  const excess = excessM3(field, scenario);

  const series = useMemo(() => {
    if (!s) return [];
    const k = scenario === 's2' ? s.s2_factor : 1;
    return s.ndvi.map((ndvi, i) => ({
      date: addDays(s.start, i),
      ndvi,
      et: s.et_mm[i],
      blue: s.cum_blue_mm[i],
      budget: s.cum_budget_s1_mm[i] == null ? null : Math.round((s.cum_budget_s1_mm[i] as number) * k),
    }));
  }, [s, scenario]);

  const m3 = (mm: number | null) => (mm == null ? null : mm * field.area_ha * 10);

  return (
    <aside className="flex h-full flex-col overflow-y-auto rounded-2xl border border-black/5 bg-white p-5 shadow-sm" aria-label={`Tarla ${field.field_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-stone-900">{names[field.class] ?? field.class}</h2>
          <p className="text-sm text-stone-500">
            Tarla {field.field_id} · {fmt(field.area_ha, 1)} ha
          </p>
        </div>
        <button onClick={onClose} className="rounded-full p-1.5 text-stone-500 hover:bg-stone-100" aria-label="Tarla panelini kapat">
          <X size={18} />
        </button>
      </div>

      <div className="mt-3">
        <StatusChip status={status} />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-xs text-stone-500">Tüketim</dt>
          <dd className="text-lg font-bold text-stone-900">{fmt(field.blue_m3)} m³</dd>
        </div>
        <div className="rounded-xl bg-stone-50 p-3">
          <dt className="text-xs text-stone-500">Hedef</dt>
          <dd className="text-lg font-bold text-stone-900">{budget == null ? '–' : `${fmt(m3(budget) ?? 0)} m³`}</dd>
        </div>
        {field.assessed && excess != null && excess > 0 && (
          <div className="col-span-2 rounded-xl bg-rose-50 p-3">
            <dt className="text-xs text-rose-700">Hedefin üzerinde</dt>
            <dd className="text-lg font-bold text-rose-800">
              {fmt(excess)} m³{ratio != null && <span className="ml-1 text-sm font-semibold">(+%{fmt((ratio - 1) * 100)})</span>}
            </dd>
          </div>
        )}
      </dl>

      {field.stress_flag && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-medium text-amber-800">
          <AlertTriangle size={14} className="shrink-0" aria-hidden /> Bu sezon gelişimi benzer tarlalardan zayıf göründü.
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!s && !error && <div className="mt-4 h-36 animate-pulse rounded-xl bg-stone-50" />}
      {s && (
        <>
          <Chart
            title="Sezon boyunca tüketim (mm)"
            data={series}
            unit="mm"
            lines={[
              { key: 'blue', name: 'Tarla', color: SERIES_1 },
              { key: 'budget', name: 'Hedef', color: SERIES_2, dashed: true },
            ]}
          />
          <Chart title="Bitki gelişimi (NDVI)" data={series} unit="" lines={[{ key: 'ndvi', name: 'NDVI', color: SERIES_1 }]} />
        </>
      )}

      {field.assessed && (
        <section className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-stone-500">Tasarruf seçenekleri</h3>
          <ul className="mt-2 divide-y divide-stone-100 text-sm">
            {field.lever_evap_mm != null && field.lever_evap_mm > 0 && (
              <li className="flex justify-between gap-2 py-2">
                <span>Damla sulama</span>
                <span className="font-semibold text-emerald-700">−{fmt(m3(field.lever_evap_mm) ?? 0)} m³</span>
              </li>
            )}
            {field.lever_deficit_mm != null && (
              <li className="flex justify-between gap-2 py-2">
                <span>
                  %{fmt(p.deficit_et_reduction * 100)} az sulama
                  {field.lever_deficit_yield_loss != null && (
                    <span className="block text-xs text-stone-500">verimde ≈ %{fmt(field.lever_deficit_yield_loss * 100)} düşüş</span>
                  )}
                </span>
                <span className="font-semibold text-emerald-700">−{fmt(m3(field.lever_deficit_mm) ?? 0)} m³</span>
              </li>
            )}
            {field.lever_switch_to && field.lever_switch_mm != null && field.lever_switch_mm > 0 && (
              <li className="flex justify-between gap-2 py-2">
                <span>{names[field.lever_switch_to] ?? field.lever_switch_to} ekimi</span>
                <span className="font-semibold text-emerald-700">−{fmt(m3(field.lever_switch_mm) ?? 0)} m³</span>
              </li>
            )}
          </ul>
        </section>
      )}

      {field.assessed && (
        <p className="mt-3 text-sm text-stone-600">
          Pompa enerjisi: <span className="font-semibold text-stone-900">{fmt(field.energy_kwh)} kWh</span>
        </p>
      )}
    </aside>
  );
}

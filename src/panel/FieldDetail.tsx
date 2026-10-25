// Side panel for one field: crop, status against the chosen scenario, daily series and levers.

import { AlertTriangle, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AssumptionBadge, fmt } from '../components/ui';
import {
  SCENARIO_NAMES,
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
    <aside className="flex h-full flex-col overflow-y-auto rounded-lg border border-soil-200 bg-white p-4" aria-label={`Tarla ${field.field_id}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-soil-900">{field.field_id}</h2>
          <p className="text-sm text-soil-700">
            {names[field.class] ?? field.class} · {fmt(field.area_ha, 1)} ha
          </p>
          <p className="mt-0.5 text-xs text-soil-500">
            Ürün uydu eğrisinden tahmin (olasılık %{fmt(field.class_prob * 100)}), doğruluğu ölçülmedi.
            {field.uncertain && <span className="ml-1 font-semibold text-amber-700">Belirsiz.</span>}
          </p>
        </div>
        <button onClick={onClose} className="rounded p-1 text-soil-500 hover:bg-soil-100" aria-label="Tarla panelini kapat">
          <X size={18} />
        </button>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
        <div className="col-span-2 flex items-center gap-2">
          <dt className="sr-only">Durum</dt>
          <dd>
            <StatusChip status={status} />
          </dd>
          <span className="text-xs text-soil-500">{SCENARIO_NAMES[scenario]}</span>
        </div>
        <div>
          <dt className="text-xs text-soil-500">Mavi su (uydu)</dt>
          <dd className="font-semibold text-soil-900">
            {fmt(field.blue_mm)} mm
            <span className="block text-xs font-normal text-soil-500">
              aralık {fmt(field.blue_mm_low)}–{fmt(field.blue_mm_high)} mm · {fmt(field.blue_m3)} m³
            </span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-soil-500">Bütçe ({scenario.toUpperCase()})</dt>
          <dd className="font-semibold text-soil-900">
            {budget == null ? '–' : `${fmt(budget)} mm`}
            {ratio != null && <span className="block text-xs font-normal text-soil-500">oran {fmt(ratio, 2)}</span>}
          </dd>
        </div>
      </dl>

      {field.assessed && excess != null && excess > 0 && (
        <p className="mt-2 text-xs text-soil-700">
          Bütçenin üzerindeki tüketim ≈ {fmt(excess)} m³. Bu, verimli sulamaya (damla) göre tasarruf potansiyelidir;
          uydu tüketimi görür, toprağa sızan fazla suyu görmez.
        </p>
      )}
      {!field.assessed && (
        <p className="mt-2 text-xs text-soil-700">Yağışa dayalı tarla (kuru tahıl / nadas): mavi su 0 kabul edilir, bütçe değerlendirmesi yapılmaz.</p>
      )}

      {field.stress_flag && (
        <p className="mt-2 flex gap-1.5 rounded-md bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            <strong>Göreli düşük ET:</strong> Landsat (SEBAL) geçişlerinde bu tarla aynı gün aynı üründeki tarlalardan belirgin şekilde az
            buharlaştırdı. Kısıtlı sulama, zayıf gelişim veya yanlış sınıf olabilir; ölçülmüş bir su eksikliği değildir.
          </span>
        </p>
      )}

      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      {!s && !error && <p className="mt-3 text-sm text-soil-500">Seriler yükleniyor…</p>}
      {s && (
        <>
          <Chart
            title="Kümülatif mavi su ve bütçe çizgisi (mm)"
            data={series}
            unit="mm"
            lines={[
              { key: 'blue', name: 'Uydu (kümülatif)', color: SERIES_1 },
              { key: 'budget', name: `Bütçe ${scenario.toUpperCase()}`, color: SERIES_2, dashed: true },
            ]}
          />
          <Chart title="Günlük ET (mm/gün)" data={series} unit="mm" lines={[{ key: 'et', name: 'ET', color: SERIES_1 }]} />
          <Chart title="NDVI" data={series} unit="" lines={[{ key: 'ndvi', name: 'NDVI', color: SERIES_1 }]} />
        </>
      )}

      {field.assessed && (
        <section className="mt-4 text-sm">
          <h3 className="font-semibold text-soil-800">Tasarruf seçenekleri</h3>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-soil-700">
            {field.lever_evap_mm != null && field.lever_evap_mm > 0 && (
              <li>
                Damla sulama / daha az toprak ıslatma: ≈ {fmt(field.lever_evap_mm)} mm ({fmt(m3(field.lever_evap_mm) ?? 0)} m³).
              </li>
            )}
            {field.lever_deficit_mm != null && (
              <li>
                %{fmt(p.deficit_et_reduction * 100)} açık sulama: ≈ {fmt(field.lever_deficit_mm)} mm ({fmt(m3(field.lever_deficit_mm) ?? 0)} m³);{' '}
                {field.lever_deficit_yield_loss != null
                  ? `beklenen verim kaybı ≈ %${fmt(field.lever_deficit_yield_loss * 100)} (FAO-33 Ky).`
                  : 'bu ürün için doğrulanmış verim katsayısı yok.'}
              </li>
            )}
            {field.lever_switch_to && field.lever_switch_mm != null && field.lever_switch_mm > 0 && (
              <li>
                {names[field.lever_switch_to] ?? field.lever_switch_to} ekilirse (pilottaki tipik değer): ≈ {fmt(field.lever_switch_mm)} mm daha az.
              </li>
            )}
          </ul>
        </section>
      )}

      {field.assessed && (
        <section className="mt-4 text-sm">
          <h3 className="font-semibold text-soil-800">
            Pompalama enerjisi
            <AssumptionBadge />
          </h3>
          <p className="mt-1 text-soil-700">
            ≈ {fmt(field.energy_kwh)} kWh (S1 bütçesinde {fmt(field.energy_s1_kwh)} kWh).
          </p>
          <p className="text-xs text-soil-500">
            Basma yüksekliği {p.head_m} m, pompa-motor verimi {fmt(p.pump_efficiency, 2)}, {p.default_method === 'sprinkler' ? 'yağmurlama' : p.default_method}{' '}
            sulama verimi {fmt(p.irrigation_efficiency[p.default_method], 2)} varsayıldı.
          </p>
        </section>
      )}
    </aside>
  );
}

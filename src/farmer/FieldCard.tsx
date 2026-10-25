// One pilot field for the farmer: this week's action first, then the season and what saves water.

import { ArrowLeft, CloudRain, Droplets, Leaf, Send, Sun, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { fmt } from '../components/ui';
import { fetchForecast } from '../data/openMeteo';
import { loadFieldDetail, type FieldDetailData, type Status } from '../panel/data';
import type { PilotField } from './pilot';
import { PAST_DAYS, buildWeek, type PilotManifest, type WeekView } from './weekPlan';

export const FARMER_STATUS: Record<Status, { label: string; tone: string; dot: string }> = {
  within: { label: 'Verimli sulama', tone: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  borderline: { label: 'Biraz fazla', tone: 'bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
  over: { label: 'Fazla su', tone: 'bg-rose-50 text-rose-800', dot: 'bg-rose-500' },
  not_assessed: { label: 'Yağmurla yetişiyor', tone: 'bg-stone-100 text-stone-700', dot: 'bg-stone-400' },
};

const todayIstanbul = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const monthDay = (iso: string) => `${Number(iso.slice(8, 10))} ${MONTHS[Number(iso.slice(5, 7)) - 1]}`;

function Card({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

type WeekState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; view: WeekView | null };

function useWeek(field: PilotField, manifest: PilotManifest): [WeekState, () => void] {
  const [state, setState] = useState<WeekState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    fetchForecast(field.lat, field.lon, fetch, PAST_DAYS).then(
      (fc) => live && setState({ status: 'ready', view: buildWeek(field, manifest, fc, todayIstanbul()) }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
  }, [field.field_id, attempt]);
  return [state, () => setAttempt((a) => a + 1)];
}

function WeekCard({ state, retry, rainfed }: { state: WeekState; retry: () => void; rainfed: boolean }) {
  if (rainfed) {
    return (
      <Card title="Bu hafta" icon={<Droplets size={14} />}>
        <p className="text-2xl font-bold text-stone-900">Sulama gerekmiyor</p>
        <p className="mt-1 text-sm text-stone-600">Bu tarla yağmurla yetişiyor.</p>
      </Card>
    );
  }
  if (state.status === 'loading') {
    return (
      <Card title="Bu hafta" icon={<Droplets size={14} />}>
        <div className="h-8 w-2/3 animate-pulse rounded-lg bg-stone-100" />
        <div className="mt-4 grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-stone-100" />
          ))}
        </div>
      </Card>
    );
  }
  if (state.status === 'error') {
    return (
      <Card title="Bu hafta" icon={<Droplets size={14} />}>
        <p className="text-sm text-stone-600">Hava tahmini şu an alınamadı.</p>
        <button onClick={retry} className="mt-2 text-sm font-semibold text-emerald-800 hover:underline">
          Tekrar dene
        </button>
      </Card>
    );
  }
  const view = state.view;
  if (!view) {
    return (
      <Card title="Bu hafta" icon={<Droplets size={14} />}>
        <p className="text-lg font-semibold text-stone-900">Bu ürün için haftalık plan yakında</p>
      </Card>
    );
  }
  if (view.kind === 'off_season') {
    return (
      <Card title="Bu hafta" icon={<Droplets size={14} />}>
        <p className="text-2xl font-bold text-stone-900">Sezon tamamlandı</p>
        <p className="mt-1 text-sm text-stone-600">Yeni sezonun planı ekimle birlikte başlar.</p>
      </Card>
    );
  }

  const rainy = view.days.find((d) => d.rainMm > 0);
  return (
    <Card title="Bu hafta" icon={<Droplets size={14} />}>
      {view.next ? (
        <>
          <p className="text-sm font-medium text-stone-500">Sıradaki sulama</p>
          <p className="text-2xl font-bold text-stone-900">
            {view.next.label}, {view.next.windows.join(' ve ')}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
            <span>{fmt(view.next.hours, 1)} saat pompa</span>
            {view.solarShare != null && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <Sun size={14} /> enerjinin %{fmt(view.solarShare * 100)}'i güneşten
              </span>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-stone-900">Bu hafta sulama yapma</p>
          <p className="mt-1 text-sm text-stone-600">
            {rainy ? `${rainy.label} yağmur bekleniyor; toprakta yeterli su var.` : 'Toprakta yeterli su var, pompa kapalı kalsın.'}
          </p>
        </>
      )}
      <ol className="mt-4 grid grid-cols-7 gap-1.5">
        {view.days.map((d) => {
          const pump = d.hours > 0;
          return (
            <li
              key={d.date}
              className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center ${
                pump ? 'bg-sky-600 text-white' : d.rainMm > 0 ? 'bg-sky-50 text-sky-800' : 'bg-stone-50 text-stone-500'
              }`}
              title={pump ? d.windows.join(', ') : undefined}
            >
              <span className="text-[11px] font-semibold">{d.short}</span>
              {pump ? <Droplets size={16} /> : d.rainMm > 0 ? <CloudRain size={16} /> : <span className="h-4 text-stone-300">–</span>}
              <span className="text-[10px] tabular-nums">{pump ? `${fmt(d.hours, 0)} sa` : d.rainMm > 0 ? `${fmt(d.rainMm, 0)} mm` : ' '}</span>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Bar({ label, value, max, color, strong }: { label: string; value: number; max: number; color: string; strong?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className={strong ? 'font-semibold text-stone-900' : 'text-stone-600'}>{label}</span>
        <span className={`tabular-nums ${strong ? 'font-semibold text-stone-900' : 'text-stone-600'}`}>{fmt(value)} m³</span>
      </div>
      <div className="mt-1 h-2.5 rounded-full bg-stone-100">
        <div className="h-2.5 rounded-full" style={{ width: `${Math.max(2, (100 * value) / max)}%`, background: color }} />
      </div>
    </div>
  );
}

function SeasonCurve({ detail, season }: { detail: FieldDetailData | null; season: number }) {
  const s = detail?.seasons[String(season)];
  const data = useMemo(
    () =>
      s
        ? s.cum_blue_mm
            .map((blue, i) => ({ date: addDays(s.start, i), blue, ref: s.cum_budget_s1_mm[i] }))
            .filter((_, i) => i % 3 === 0)
        : [],
    [s],
  );
  if (!s) return <div className="h-24 animate-pulse rounded-xl bg-stone-50" />;
  return (
    <div className="h-24">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: 4 }}>
          <XAxis dataKey="date" tickFormatter={monthDay} tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} minTickGap={40} />
          <Tooltip
            labelFormatter={(d) => monthDay(String(d))}
            formatter={(v, name) => [`${fmt(Number(v))} mm`, name === 'blue' ? 'Senin tarlan' : 'Verimli sulama']}
            contentStyle={{ fontSize: 12, borderRadius: 10 }}
          />
          <Line dataKey="ref" stroke="#a8a29e" strokeWidth={2} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
          <Line dataKey="blue" stroke="#0284c7" strokeWidth={2.5} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function FieldCard({
  field,
  peerMedianMm,
  season,
  manifest,
  classNames,
  telegramUrl,
  onBack,
}: {
  field: PilotField;
  peerMedianMm: number | null;
  season: number;
  manifest: PilotManifest;
  classNames: Record<string, string>;
  telegramUrl: string | null;
  onBack: () => void;
}) {
  const [week, retry] = useWeek(field, manifest);
  const [detail, setDetail] = useState<FieldDetailData | null>(null);
  useEffect(() => {
    setDetail(null);
    loadFieldDetail(field.field_id).then(setDetail, () => setDetail(null));
  }, [field.field_id]);

  const crop = classNames[field.class] ?? field.class;
  const status = FARMER_STATUS[field.status_s1];
  const toM3 = (mm: number) => mm * field.area_ha * 10;
  const kwhPerM3 = field.blue_m3 > 0 ? field.energy_kwh / field.blue_m3 : 0;
  const efficientM3 = field.budget_s1_mm != null ? toM3(field.budget_s1_mm) : null;
  const peerM3 = peerMedianMm != null ? toM3(peerMedianMm) : null;
  const max = Math.max(field.blue_m3, efficientM3 ?? 0, peerM3 ?? 0, 1);
  const overPct = field.ratio_s1 != null ? Math.round((field.ratio_s1 - 1) * 100) : null;

  const levers: { title: string; sub?: string; m3: number }[] = [];
  if (field.lever_evap_mm != null && field.lever_evap_mm > 0) {
    levers.push({ title: 'Damla sulamaya geç', sub: 'Toprak daha az ıslanır, buharlaşma azalır', m3: toM3(field.lever_evap_mm) });
  }
  if (field.lever_deficit_mm != null && field.lever_deficit_mm > 0) {
    levers.push({
      title: '%10 daha az sula',
      sub: field.lever_deficit_yield_loss != null ? `Verimde yaklaşık %${fmt(field.lever_deficit_yield_loss * 100)} düşüş` : undefined,
      m3: toM3(field.lever_deficit_mm),
    });
  }
  if (field.lever_switch_to && field.lever_switch_mm != null && field.lever_switch_mm > 0) {
    levers.push({ title: 'Ürünü değiştir', sub: `Gelecek sezon: ${classNames[field.lever_switch_to] ?? field.lever_switch_to}`, m3: toM3(field.lever_switch_mm) });
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm font-medium text-stone-500 hover:text-stone-900">
        <ArrowLeft size={16} /> Tüm tarlalar
      </button>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">{crop}</h2>
          <p className="text-sm text-stone-500">
            Tarla {field.field_id} · {fmt(field.area_ha * 10)} dekar
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${status.tone}`}>
          <span className={`h-2 w-2 rounded-full ${status.dot}`} />
          {status.label}
        </span>
      </div>

      <WeekCard state={week} retry={retry} rainfed={!field.assessed} />

      {telegramUrl && (
        <a
          href={telegramUrl}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-white shadow-sm transition hover:bg-sky-600"
        >
          <Send size={18} /> Planı her sabah Telegram'dan al
        </a>
      )}

      {field.assessed && (
        <Card title={`${season} sezonu`} icon={<Leaf size={14} />}>
          <p className="text-3xl font-bold tracking-tight text-stone-900">{fmt(field.blue_m3)} m³</p>
          <p className="text-sm text-stone-500">
            yeraltı suyu kullandın
            {overPct != null && overPct > 0 && (
              <>
                {' '}
                · verimli sulamadan <span className="font-semibold text-rose-700">%{fmt(overPct)} fazla</span>
              </>
            )}
          </p>
          <div className="mt-4 space-y-3">
            <Bar label="Senin tarlan" value={field.blue_m3} max={max} color="#0284c7" strong />
            {peerM3 != null && <Bar label={`Komşu ${crop.toLocaleLowerCase('tr-TR')} tarlaları`} value={peerM3} max={max} color="#a8a29e" />}
            {efficientM3 != null && <Bar label="Verimli sulamayla" value={efficientM3} max={max} color="#10b981" />}
          </div>
          <div className="mt-4">
            <SeasonCurve detail={detail} season={season} />
          </div>
        </Card>
      )}

      {levers.length > 0 && (
        <Card title="Su tasarrufu" icon={<Zap size={14} />}>
          <ul className="divide-y divide-stone-100">
            {levers.map((l) => (
              <li key={l.title} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                <div>
                  <p className="font-semibold text-stone-900">{l.title}</p>
                  {l.sub && <p className="text-xs text-stone-500">{l.sub}</p>}
                </div>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap font-bold tabular-nums text-emerald-700">−{fmt(l.m3)} m³</p>
                  {kwhPerM3 > 0 && <p className="text-xs tabular-nums text-stone-500">−{fmt(l.m3 * kwhPerM3)} kWh</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

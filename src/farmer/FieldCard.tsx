// The farmer's home screen for their own field: photo, today's answer, the season in one card, more on demand.

import { ChevronDown, CloudRain, Droplets, Leaf, Sun, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import { fmt } from '../components/ui';
import { fetchArchive, fetchForecast } from '../data/openMeteo';
import { locale, monthDay, t } from '../i18n';
import { loadDemoWeather, loadFieldDetail, type FieldDetailData, type Status } from '../panel/data';
import type { PilotField } from './pilot';
import type { FarmForm } from '../state/farm';
import FieldPhoto from './FieldPhoto';
import TelegramBox from './TelegramBox';
import { BillCard, PumpCard, WellCard } from './ToolCards';
import { loadProfile, loadWell, profileForm, saveProfile, saveWell, type PumpProfile, type WellReading } from './tools';
import { PAST_DAYS, buildWeek, demoDay, demoWeather, type DemoWeatherPoint, type PilotManifest, type WeekView } from './weekPlan';

export const FARMER_STATUS: Record<Status, { label: string; tone: string; dot: string }> = {
  within: { label: t('Verimli sulama', 'Efficient irrigation'), tone: 'bg-emerald-50 text-emerald-800', dot: 'bg-emerald-500' },
  borderline: { label: t('Biraz fazla', 'Slightly over'), tone: 'bg-amber-50 text-amber-800', dot: 'bg-amber-400' },
  over: { label: t('Fazla su', 'Too much water'), tone: 'bg-rose-50 text-rose-800', dot: 'bg-rose-500' },
  not_assessed: { label: t('Yağmurla yetişiyor', 'Rain-fed'), tone: 'bg-stone-100 text-stone-700', dot: 'bg-stone-400' },
};

const todayIstanbul = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

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

/** This week from the forecast, or with `demoDate` the demo week from that week's archived weather (bundled file first). */
function useWeek(field: PilotField, manifest: PilotManifest, demoDate: string | null, profile: Partial<FarmForm> | undefined): [WeekState, () => void] {
  const profileKey = JSON.stringify(profile ?? null);
  const [state, setState] = useState<WeekState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    let weather;
    if (demoDate) {
      const [from, to] = [addDays(demoDate, -PAST_DAYS), addDays(demoDate, 15)];
      weather = loadDemoWeather<DemoWeatherPoint[]>(Number(demoDate.slice(0, 4))).then(
        (points) => demoWeather(points, field.lat, field.lon, from, to),
        () => fetchArchive(field.lat, field.lon, from, to),
      );
    } else weather = fetchForecast(field.lat, field.lon, fetch, PAST_DAYS);
    weather.then(
      (w) => live && setState({ status: 'ready', view: buildWeek(field, manifest, w, demoDate ?? todayIstanbul(), !demoDate, profile) }),
      () => live && setState({ status: 'error' }),
    );
    return () => {
      live = false;
    };
    // `profileKey` stands for `profile` (a new object on every render)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [field.field_id, attempt, demoDate, profileKey]);
  return [state, () => setAttempt((a) => a + 1)];
}

function WeekCard({
  state,
  retry,
  rainfed,
  demoDate,
  onDemo,
}: {
  state: WeekState;
  retry: () => void;
  rainfed: boolean;
  demoDate: string | null;
  onDemo: (on: boolean) => void;
}) {
  const title = demoDate ? t('Örnek hafta', 'Sample week') : t('Bu hafta', 'This week');
  if (rainfed) {
    return (
      <Card title={title} icon={<Droplets size={14} />}>
        <p className="text-2xl font-bold text-stone-900">{t('Sulama gerekmiyor', 'No irrigation needed')}</p>
        <p className="mt-1 text-sm text-stone-600">{t('Bu tarla yağmurla yetişiyor.', 'This field grows on rainfall.')}</p>
      </Card>
    );
  }
  if (state.status === 'loading') {
    return (
      <Card title={title} icon={<Droplets size={14} />}>
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
      <Card title={title} icon={<Droplets size={14} />}>
        <p className="text-sm text-stone-600">{demoDate
            ? t('Geçmiş hava verisi şu an alınamadı.', 'Past weather data is not available right now.')
            : t('Hava tahmini şu an alınamadı.', 'The weather forecast is not available right now.')}</p>
        <button onClick={retry} className="mt-2 text-sm font-semibold text-emerald-800 hover:underline">
          {t('Tekrar dene', 'Try again')}
        </button>
      </Card>
    );
  }
  const view = state.view;
  if (!view) {
    return (
      <Card title={title} icon={<Droplets size={14} />}>
        <p className="text-lg font-semibold text-stone-900">{t('Bu ürün için haftalık plan yakında', 'Weekly plan for this crop coming soon')}</p>
      </Card>
    );
  }
  if (view.kind === 'off_season') {
    return (
      <Card title={title} icon={<Droplets size={14} />}>
        <p className="text-2xl font-bold text-stone-900">{t('Sezon tamamlandı', 'Season finished')}</p>
        <p className="mt-1 text-sm text-stone-600">{t('Yeni sezonun planı ekimle birlikte başlar.', 'The plan for the new season starts at sowing.')}</p>
        <button onClick={() => onDemo(true)} className="mt-3 text-sm font-semibold text-emerald-800 hover:underline">
          {t('Geçen sezondan örnek bir hafta göster →', 'Show a sample week from last season →')}
        </button>
      </Card>
    );
  }

  const rainy = view.days.find((d) => d.rainMm > 0);
  return (
    <Card title={title} icon={<Droplets size={14} />}>
      {demoDate && (
        <p
          className="mb-3 flex items-center justify-between gap-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-900"
          title={t('O haftanın gerçek hava verisiyle; ürün takvimi tarlanın uydu verisinden.', "With that week's real weather; crop calendar from the field's satellite data.")}
        >
          <span>{t(`Geçen sezondan örnek: ${monthDay(demoDate)} ${demoDate.slice(0, 4)}`, `Sample from last season: ${monthDay(demoDate)} ${demoDate.slice(0, 4)}`)}</span>
          <button onClick={() => onDemo(false)} className="shrink-0 font-semibold underline">
            {t('Bugüne dön', 'Back to today')}
          </button>
        </p>
      )}
      {view.next ? (
        <>
          <p className="text-sm font-medium text-stone-500">{t('Sıradaki sulama', 'Next irrigation')}</p>
          <p className="text-2xl font-bold text-stone-900">
            {view.next.label}, {view.next.windows.join(t(' ve ', ' and '))}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-stone-600">
            <span>{t(`${fmt(view.next.hours, 1)} saat pompa`, `${fmt(view.next.hours, 1)} h of pumping`)}</span>
            {view.solarShare != null && view.solarShare >= 0.01 && (
              <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                <Sun size={14} /> {t(`enerjinin %${fmt(view.solarShare * 100)}'i güneşten`, `${fmt(view.solarShare * 100)}% of the energy from solar`)}
              </span>
            )}
          </p>
        </>
      ) : (
        <>
          <p className="text-2xl font-bold text-stone-900">{t('Bu hafta sulama yapma', 'No irrigation this week')}</p>
          <p className="mt-1 text-sm text-stone-600">
            {rainy
              ? t(`${rainy.label} yağmur bekleniyor; toprakta yeterli su var.`, `${rainy.label}: rain expected; the soil has enough water.`)
              : t('Toprakta yeterli su var, pompa kapalı kalsın.', 'The soil has enough water; keep the pump off.')}
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
              <span className="text-[10px] tabular-nums">{pump ? `${fmt(d.hours, 0)} ${t('sa', 'h')}` : d.rainMm > 0 ? `${fmt(d.rainMm, 0)} mm` : ' '}</span>
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
            formatter={(v, name) => [`${fmt(Number(v))} mm`, name === 'blue' ? t('Senin tarlan', 'Your field') : t('Verimli sulama', 'Efficient irrigation')]}
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
  rings,
  peerMedianMm,
  season,
  manifest,
  classNames,
  telegramUrl,
  demo,
  onDemo,
}: {
  field: PilotField;
  rings: [number, number][][] | null;
  peerMedianMm: number | null;
  season: number;
  manifest: PilotManifest;
  classNames: Record<string, string>;
  telegramUrl: string | null;
  demo: boolean;
  onDemo: (on: boolean) => void;
}) {
  const demoDate = demo ? demoDay(field, manifest, season) : null;
  const [profile, setProfile] = useState<PumpProfile | null>(() => loadProfile(field.field_id));
  const [well, setWell] = useState<WellReading[]>(() => loadWell(field.field_id));
  const engineProfile = useMemo(() => (profile ? profileForm(profile) : undefined), [profile]);
  const [week, retry] = useWeek(field, manifest, demoDate, engineProfile);
  const saveMyProfile = (p: PumpProfile | null) => {
    setProfile(p);
    if (p) saveProfile(field.field_id, p);
  };
  const saveMyWell = (r: WellReading[]) => {
    setWell(r);
    saveWell(field.field_id, r);
  };
  const [detail, setDetail] = useState<FieldDetailData | null>(null);
  useEffect(() => {
    setDetail(null);
    loadFieldDetail(field.field_id).then(setDetail, () => setDetail(null));
  }, [field.field_id]);

  const crop = classNames[field.class] ?? field.class;
  const toM3 = (mm: number) => mm * field.area_ha * 10;
  const kwhPerM3 = field.blue_m3 > 0 ? field.energy_kwh / field.blue_m3 : 0;
  const efficientM3 = field.budget_s1_mm != null ? toM3(field.budget_s1_mm) : null;
  const peerM3 = peerMedianMm != null ? toM3(peerMedianMm) : null;
  const max = Math.max(field.blue_m3, efficientM3 ?? 0, peerM3 ?? 0, 1);
  const peerPct = peerM3 ? Math.round((field.blue_m3 / peerM3 - 1) * 100) : null;

  const levers: { title: string; sub?: string; m3: number }[] = [];
  if (field.lever_evap_mm != null && field.lever_evap_mm > 0) {
    levers.push({
      title: t('Damla sulamaya geç', 'Switch to drip irrigation'),
      sub: t('Toprak daha az ıslanır, buharlaşma azalır', 'Less wet soil, less evaporation'),
      m3: toM3(field.lever_evap_mm),
    });
  }
  if (field.lever_deficit_mm != null && field.lever_deficit_mm > 0) {
    levers.push({
      title: t('%10 daha az sula', 'Irrigate 10% less'),
      sub:
        field.lever_deficit_yield_loss != null
          ? t(`Verimde yaklaşık %${fmt(field.lever_deficit_yield_loss * 100)} düşüş`, `About ${fmt(field.lever_deficit_yield_loss * 100)}% lower yield`)
          : undefined,
      m3: toM3(field.lever_deficit_mm),
    });
  }
  if (field.lever_switch_to && field.lever_switch_mm != null && field.lever_switch_mm > 0) {
    levers.push({
      title: t('Ürünü değiştir', 'Change the crop'),
      sub: `${t('Gelecek sezon', 'Next season')}: ${classNames[field.lever_switch_to] ?? field.lever_switch_to}`,
      m3: toM3(field.lever_switch_mm),
    });
  }

  return (
    // Phone: one column. Desktop: photo and Telegram on the left, the cards side by side on the right.
    <div className="grid gap-5 lg:grid-cols-[minmax(300px,380px)_1fr] lg:items-start">
      <div className="space-y-4 lg:sticky lg:top-0">
        <FieldPhoto rings={rings} />
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-stone-900">{crop}</h2>
          <p className="text-sm text-stone-500">
            {t(`${fmt(field.area_ha * 10)} dekar`, `${fmt(field.area_ha, 1)} ha`)} · {t('Tarla kodu', 'Field code')} {field.field_id}
          </p>
        </div>
        {telegramUrl && <TelegramBox url={telegramUrl} compact />}
      </div>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
      <div className="md:col-span-2">
        <WeekCard state={week} retry={retry} rainfed={!field.assessed} demoDate={demoDate} onDemo={onDemo} />
      </div>

      {field.assessed && (
        <Card title={t(`${season} sezonu`, `${season} season`)} icon={<Leaf size={14} />}>
          <p className="text-3xl font-bold tracking-tight text-stone-900">{fmt(field.blue_m3)} m³</p>
          <p className="text-sm text-stone-500">
            {t('yeraltı suyu kullandın', 'of groundwater used')}
            {peerPct != null && peerPct !== 0 && (
              <>
                {' · '}
                <span className={`font-semibold ${peerPct > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {peerPct > 0
                    ? t(`benzer tarlalardan %${fmt(peerPct)} fazla`, `${fmt(peerPct)}% more than similar fields`)
                    : t(`benzer tarlalardan %${fmt(-peerPct)} az`, `${fmt(-peerPct)}% less than similar fields`)}
                </span>
              </>
            )}
          </p>
          <div className="mt-4 space-y-3">
            <Bar label={t('Senin tarlan', 'Your field')} value={field.blue_m3} max={max} color="#0284c7" strong />
            {peerM3 != null && <Bar label={t(`Benzer ${crop.toLocaleLowerCase(locale)} tarlaları`, `Similar ${crop.toLocaleLowerCase(locale)} fields`)} value={peerM3} max={max} color="#a8a29e" />}
            {efficientM3 != null && <Bar label={t('Damla sulamayla yeterdi', 'Enough with drip irrigation')} value={efficientM3} max={max} color="#10b981" />}
          </div>
        </Card>
      )}

      <PumpCard profile={profile} onSave={saveMyProfile} />
      <BillCard field={field} detail={detail} season={season} profile={profile} />
      <WellCard readings={well} onChange={saveMyWell} />

      {field.assessed && (
        <details className="group rounded-2xl border border-black/5 bg-white p-4 shadow-sm md:col-span-2">
          <summary className="flex cursor-pointer list-none items-center justify-between text-sm font-semibold text-stone-700">
            {t('Daha fazla: sezon eğrisi ve tasarruf yolları', 'More: season curve and ways to save')}
            <ChevronDown size={16} className="text-stone-400 transition group-open:rotate-180" />
          </summary>
          <div className="mt-4">
            <SeasonCurve detail={detail} season={season} />
          </div>
          {levers.length > 0 && (
            <ul className="mt-4 divide-y divide-stone-100">
              {levers.map((l) => (
                <li key={l.title} className="flex items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold text-stone-900">
                      <Zap size={14} className="text-emerald-700" />
                      {l.title}
                    </p>
                    {l.sub && <p className="text-xs text-stone-500">{l.sub}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="whitespace-nowrap font-bold tabular-nums text-emerald-700">−{fmt(l.m3)} m³</p>
                    {kwhPerM3 > 0 && <p className="text-xs tabular-nums text-stone-500">−{fmt(l.m3 * kwhPerM3)} kWh</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      </div>
    </div>
  );
}

// The farmer's own numbers on the home screen: my pump, my electricity bill, my well.

import { Gauge, Receipt, Trash2, TrendingDown } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { fmt } from '../components/ui';
import type { EnergySource } from '../engine/impact';
import { IRRIGATION_EFFICIENCY, type IrrigationMethod } from '../engine/waterBalance';
import { lang, t } from '../i18n';
import type { FieldDetailData } from '../panel/data';
import type { PilotField } from './pilot';
import { DEFAULT_HEAD_M, kwhForM3, pumpedM3FromKwh, wellTrend, type PumpProfile, type WellReading } from './tools';

const num = (s: string) => {
  const v = Number(s.replace(',', '.'));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const todayIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' });

function Tile({ title, icon, children, action }: { title: string; icon: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="flex flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-stone-500">
          {icon}
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={`rounded-full px-3 py-1.5 text-sm font-medium ${v === value ? 'bg-emerald-900 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const inputCls = 'w-full rounded-xl border border-stone-200 px-3 py-2 text-base outline-none focus:border-emerald-700';
const ENERGY: [EnergySource, string][] = [
  ['solar_grid', t('Güneş', 'Solar')],
  ['grid', t('Şebeke', 'Grid')],
  ['diesel', t('Dizel', 'Diesel')],
];
const METHOD: [IrrigationMethod, string][] = [
  ['drip', t('Damla', 'Drip')],
  ['sprinkler', t('Yağmurlama', 'Sprinkler')],
  ['flood', t('Salma', 'Flood')],
];
const label = <T extends string>(opts: [T, string][], v: T) => opts.find((o) => o[0] === v)?.[1] ?? v;

// ---------------- Pompam ----------------

export function PumpCard({ profile, onSave }: { profile: PumpProfile | null; onSave: (p: PumpProfile | null) => void }) {
  const [editing, setEditing] = useState(false);
  const [head, setHead] = useState(profile ? String(profile.headM) : '');
  const [kw, setKw] = useState(profile ? String(profile.pumpKw) : '');
  const [pv, setPv] = useState(profile?.pvKwp ? String(profile.pvKwp) : '');
  const [energy, setEnergy] = useState<EnergySource>(profile?.energy ?? 'solar_grid');
  const [method, setMethod] = useState<IrrigationMethod>(profile?.method ?? 'sprinkler');
  const h = num(head), k = num(kw);

  const save = (e: FormEvent) => {
    e.preventDefault();
    if (!h || !k) return;
    onSave({ headM: h, pumpKw: k, energy, method, pvKwp: energy === 'solar_grid' ? num(pv) : null });
    setEditing(false);
  };

  if (editing || !profile) {
    if (!editing && !profile) {
      return (
        <Tile title={t('Pompam', 'My pump')} icon={<Gauge size={14} />}>
          <p className="text-sm text-stone-600">{t('Pompanı tanıt, plan senin pompana göre hesaplansın.', 'Tell us about your pump and the plan follows it.')}</p>
          <button onClick={() => setEditing(true)} className="mt-3 self-start rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-950">
            {t('Pompanı tanıt', 'Add your pump')}
          </button>
        </Tile>
      );
    }
    return (
      <Tile title={t('Pompam', 'My pump')} icon={<Gauge size={14} />}>
        <form onSubmit={save} className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-stone-600">{t('Kuyu derinliği (m)', 'Well depth (m)')}</span>
              <input value={head} onChange={(e) => setHead(e.target.value)} inputMode="decimal" placeholder="80" className={inputCls} />
            </label>
            <label className="block">
              <span className="text-stone-600">{t('Pompa gücü (kW)', 'Pump power (kW)')}</span>
              <input value={kw} onChange={(e) => setKw(e.target.value)} inputMode="decimal" placeholder="30" className={inputCls} />
            </label>
          </div>
          <div>
            <span className="text-stone-600">{t('Enerji', 'Energy')}</span>
            <Choice value={energy} options={ENERGY} onChange={setEnergy} />
          </div>
          {energy === 'solar_grid' && (
            <label className="block">
              <span className="text-stone-600">{t('Panel gücü (kWp, bilmiyorsan boş bırak)', 'Panel power (kWp, optional)')}</span>
              <input value={pv} onChange={(e) => setPv(e.target.value)} inputMode="decimal" placeholder="40" className={inputCls} />
            </label>
          )}
          <div>
            <span className="text-stone-600">{t('Sulama yöntemi', 'Irrigation method')}</span>
            <Choice value={method} options={METHOD} onChange={setMethod} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={!h || !k} className="rounded-xl bg-emerald-900 px-4 py-2 font-semibold text-white disabled:opacity-40">
              {t('Kaydet', 'Save')}
            </button>
            <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 font-medium text-stone-600 hover:bg-stone-100">
              {t('Vazgeç', 'Cancel')}
            </button>
          </div>
        </form>
      </Tile>
    );
  }

  return (
    <Tile
      title={t('Pompam', 'My pump')}
      icon={<Gauge size={14} />}
      action={
        <button onClick={() => setEditing(true)} className="text-xs font-semibold text-emerald-800 hover:underline">
          {t('Düzenle', 'Edit')}
        </button>
      }
    >
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-stone-500">{t('Kuyu', 'Well')}</dt>
        <dd className="font-semibold">{fmt(profile.headM)} m</dd>
        <dt className="text-stone-500">{t('Pompa', 'Pump')}</dt>
        <dd className="font-semibold">{fmt(profile.pumpKw, 1)} kW</dd>
        <dt className="text-stone-500">{t('Enerji', 'Energy')}</dt>
        <dd className="font-semibold">{label(ENERGY, profile.energy)}</dd>
        <dt className="text-stone-500">{t('Sulama', 'Method')}</dt>
        <dd className="font-semibold">{label(METHOD, profile.method)}</dd>
      </dl>
      <p className="mt-3 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-800">{t('✓ Plan senin pompana göre hesaplanıyor', '✓ The plan follows your pump')}</p>
    </Tile>
  );
}

// ---------------- Faturam ----------------

/** Months offered on fields without an irrigation need (April–October). */
const IRRIGATION_MONTHS = [3, 4, 5, 6, 7, 8, 9];

const MONTHS = t('Ocak Şubat Mart Nisan Mayıs Haziran Temmuz Ağustos Eylül Ekim Kasım Aralık', 'January February March April May June July August September October November December').split(' ');

export function BillCard({ field, detail, season, profile }: { field: PilotField; detail: FieldDetailData | null; season: number; profile: PumpProfile | null }) {
  const method = profile?.method ?? 'sprinkler';
  const headM = profile?.headM ?? DEFAULT_HEAD_M;

  // The field's need per month of the last season (efficient irrigation, plus the method's losses), m³
  const months = useMemo(() => {
    if (!field.assessed) return IRRIGATION_MONTHS.map((m) => ({ month: m, needM3: null }));
    const s = detail?.seasons[String(season)];
    if (!s) return [];
    const byMonth = new Map<number, number>();
    const start = Date.parse(`${s.start}T00:00:00Z`);
    const cum = s.cum_budget_s1_mm;
    for (let i = 1; i < cum.length; i++) {
      const [a, b] = [cum[i - 1], cum[i]];
      if (a == null || b == null) continue;
      const m = new Date(start + i * 864e5).getUTCMonth();
      byMonth.set(m, (byMonth.get(m) ?? 0) + Math.max(0, b - a));
    }
    const withNeed = [...byMonth]
      .filter(([, mm]) => mm > 5)
      .map(([m, mm]): { month: number; needM3: number | null } => ({ month: m, needM3: (mm * field.area_ha * 10) / IRRIGATION_EFFICIENCY[method] }));
    // Fallow / rainfed: no irrigation need to compare with, but the bill still turns into pumped water
    return field.assessed ? withNeed : IRRIGATION_MONTHS.map((m) => ({ month: m, needM3: null }));
  }, [detail, season, field.area_ha, field.assessed, method]);

  const [month, setMonth] = useState<number | null>(null);
  const [kwh, setKwh] = useState('');
  const [price, setPrice] = useState('');
  const sel = months.find((m) => m.month === month) ?? months[0];
  const e = num(kwh);
  const pumped = e ? pumpedM3FromKwh(e, headM) : null;
  const extra = pumped != null && sel?.needM3 != null ? pumped - sel.needM3 : null;
  const p = num(price);

  return (
    <Tile title={t('Faturam', 'My bill')} icon={<Receipt size={14} />}>
      {months.length === 0 ? (
        <div className="h-24 animate-pulse rounded-xl bg-stone-50" />
      ) : (
        <div className="space-y-3 text-sm">
          <p className="text-stone-600">{t('Faturandaki kWh’yi yaz, o ay kuyudan ne kadar su çektiğini görelim.', 'Enter the kWh on your bill to see how much water you pumped that month.')}</p>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-stone-600">{t('Ay', 'Month')}</span>
              <select value={sel?.month} onChange={(ev) => setMonth(Number(ev.target.value))} className={inputCls}>
                {months.map((m) => (
                  <option key={m.month} value={m.month}>
                    {MONTHS[m.month]} {season}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-stone-600">kWh</span>
              <input value={kwh} onChange={(ev) => setKwh(ev.target.value)} inputMode="decimal" placeholder="4000" className={inputCls} />
            </label>
          </div>
          {pumped != null && sel && extra == null && (
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="flex justify-between">
                <span className="text-stone-600">{t('Çektiğin su', 'Water you pumped')}</span>
                <span className="font-semibold tabular-nums">{fmt(pumped)} m³</span>
              </div>
              <p className="mt-2 text-stone-600">
                {t(
                  'Uydu bu sezon bu tarlada sulama görmedi (nadas ya da kuru tarım), bu yüzden ihtiyaçla karşılaştıramıyoruz.',
                  'Satellites saw no irrigation on this field this season (fallow or rainfed), so there is no need to compare with.',
                )}
              </p>
            </div>
          )}
          {pumped != null && sel && sel.needM3 != null && extra != null && (
            <div className="rounded-xl bg-stone-50 p-3">
              <div className="flex justify-between">
                <span className="text-stone-600">{t('Çektiğin su', 'Water you pumped')}</span>
                <span className="font-semibold tabular-nums">{fmt(pumped)} m³</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-600">{t('Tarlanın ihtiyacı', 'Your field needed')}</span>
                <span className="font-semibold tabular-nums">{fmt(sel.needM3)} m³</span>
              </div>
              <p className={`mt-2 font-semibold ${extra > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                {extra > 0
                  ? t(`${fmt(extra)} m³ fazla çekmişsin (≈ ${fmt(kwhForM3(extra, headM))} kWh)`, `${fmt(extra)} m³ more than needed (≈ ${fmt(kwhForM3(extra, headM))} kWh)`)
                  : t('İhtiyaç kadar ya da daha az çekmişsin. Güzel!', 'You pumped no more than needed. Nice!')}
              </p>
              {extra > 0 && (
                <label className="mt-2 flex items-center gap-2 text-stone-600">
                  {t('Birim fiyat (TL/kWh):', 'Price (TL/kWh):')}
                  <input value={price} onChange={(ev) => setPrice(ev.target.value)} inputMode="decimal" placeholder="3,5" className="w-20 rounded-lg border border-stone-200 px-2 py-1" />
                  {p && <span className="font-semibold text-rose-700">≈ {fmt(kwhForM3(extra, headM) * p)} TL</span>}
                </label>
              )}
            </div>
          )}
          <p className="text-xs text-stone-500">
            {profile
              ? t(`Kuyu derinliği ${fmt(headM)} m ve pompa verimi %50 ile hesaplandı.`, `Computed with a ${fmt(headM)} m well and 50% pump efficiency.`)
              : t(`Pompanı tanıtmadın; ${DEFAULT_HEAD_M} m kuyu varsayıldı.`, `No pump saved; a ${DEFAULT_HEAD_M} m well is assumed.`)}
            {profile?.energy === 'solar_grid' && t(' Güneşten gelen elektrik faturada görünmez.', ' Solar power does not appear on the bill.')}
          </p>
        </div>
      )}
    </Tile>
  );
}

// ---------------- Kuyum ----------------

export function WellCard({ readings, onChange }: { readings: WellReading[]; onChange: (r: WellReading[]) => void }) {
  const [depth, setDepth] = useState('');
  const [date, setDate] = useState(todayIso);
  const trend = wellTrend(readings);
  const sorted = [...readings].sort((a, b) => b.date.localeCompare(a.date));
  const add = (e: FormEvent) => {
    e.preventDefault();
    const d = num(depth);
    if (!d || !date) return;
    onChange([...readings.filter((r) => r.date !== date), { date, depthM: d }]);
    setDepth('');
  };
  const dateLabel = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString(lang === 'en' ? 'en-GB' : 'tr-TR', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <Tile title={t('Kuyum', 'My well')} icon={<TrendingDown size={14} />}>
      {trend ? (
        <div className="mb-3 rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          <p className="text-lg font-bold">
            {trend.mPerYear > 0
              ? t(`Suyun yılda ~${fmt(trend.mPerYear, 1)} m iniyor`, `Water drops ~${fmt(trend.mPerYear, 1)} m a year`)
              : t('Su seviyen düşmüyor', 'Your water level is not falling')}
          </p>
          {trend.mPerYear > 0 && <p>{t(`Bu hızla 3 yıl sonra ${fmt(trend.in3Years, 1)} m'de olur.`, `At this pace it will be at ${fmt(trend.in3Years, 1)} m in 3 years.`)}</p>}
        </div>
      ) : (
        <p className="mb-3 text-sm text-stone-600">
          {t('Kuyundaki suyun derinliğini ara sıra yaz; ne kadar hızlı indiğini birlikte görelim.', 'Note the water depth in your well now and then to see how fast it drops.')}
        </p>
      )}
      <form onSubmit={add} className="grid grid-cols-[1fr_auto_auto] gap-2 text-sm">
        <input value={depth} onChange={(e) => setDepth(e.target.value)} inputMode="decimal" placeholder={t('Derinlik (m)', 'Depth (m)')} className={`${inputCls} min-w-0`} />
        <input
          type="date"
          value={date}
          max={todayIso()}
          onChange={(e) => setDate(e.target.value)}
          className="w-[8.5rem] rounded-xl border border-stone-200 px-2 py-2 text-sm outline-none focus:border-emerald-700"
        />
        <button type="submit" disabled={!num(depth)} className="rounded-xl bg-emerald-900 px-3 font-semibold text-white disabled:opacity-40">
          {t('Ekle', 'Add')}
        </button>
      </form>
      {sorted.length > 0 && (
        <ul className="mt-3 divide-y divide-stone-100 text-sm">
          {sorted.slice(0, 4).map((r) => (
            <li key={r.date} className="flex items-center justify-between py-1.5">
              <span className="text-stone-600">{dateLabel(r.date)}</span>
              <span className="flex items-center gap-3">
                <span className="font-semibold tabular-nums">{fmt(r.depthM, 1)} m</span>
                <button onClick={() => onChange(readings.filter((x) => x.date !== r.date))} aria-label={t('Sil', 'Delete')} className="text-stone-300 hover:text-rose-600">
                  <Trash2 size={14} />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Tile>
  );
}

// Basin tab: GRACE / GRACE-FO total and groundwater storage anomaly with per-mission trends.

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../components/ui';
import { t } from '../i18n';
import { loadBasin, type BasinData, type Trend } from './data';

const INK = '#52514e';
const GRID = '#e1e0d9';

/** Month "YYYY-MM" → decimal year at mid-month. */
const decimalYear = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return y + (m - 0.5) / 12;
};

const PERIOD_NAMES: Record<string, string> = {
  full: t('Tüm dönem', 'Whole period'),
  grace: 'GRACE',
  grace_fo: 'GRACE-FO',
};

const YR_CM = t('cm/yıl', 'cm/yr');
const YR_KM3 = t('km³/yıl', 'km³/yr');

const signed = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`;

function TrendRow({ name, t }: { name: string; t: Trend }) {
  return (
    <tr className="border-t border-soil-100">
      <td className="py-1 pr-3">{name}</td>
      <td className="pr-3 tabular-nums">
        {t.from} – {t.to}
      </td>
      <td className="pr-3 font-semibold tabular-nums">{signed(t.slope_cm_yr, 2)} {YR_CM}</td>
      <td className="pr-3 tabular-nums">
        {signed(t.ci95_cm_yr[0], 2)} … {signed(t.ci95_cm_yr[1], 2)}
      </td>
      <td className="tabular-nums">
        {signed(t.km3_yr, 2)} {YR_KM3} ({signed(t.ci95_km3_yr[0], 2)} … {signed(t.ci95_km3_yr[1], 2)})
      </td>
    </tr>
  );
}

const LIMITS: [string, string][] = [
  [
    'GRACE çözünürlüğü (~300 km) havzadan kabadır; sonuç komşu alanların etkisini de içeren havza ölçeğinde bir eğilimdir.',
    'GRACE resolution (~300 km) is coarser than the basin; the result is a basin-scale trend that includes the influence of neighbouring areas.',
  ],
  [
    'GLDAS Noah sulama ve yeraltı suyu içermez; yeraltı suyu bileşeni kalan fark olarak hesaplanır.',
    'GLDAS Noah has no irrigation or groundwater; the groundwater component is the remaining difference.',
  ],
  [
    'Göl ve baraj suyu (Beyşehir, Tuz Gölü, barajlar) ayrılmadı, yeraltı suyu bileşeninde kalır.',
    'Lake and reservoir water (Beyşehir, Tuz Gölü, dams) is not separated and stays in the groundwater component.',
  ],
  [
    'GRACE-FO dönemi altı yıllık ve kurak yıllar içeriyor; bu dönemin hızı başlangıç ve bitiş aylarına duyarlıdır.',
    'The GRACE-FO period is six years long and includes dry years; its rate is sensitive to the start and end months.',
  ],
  [
    'Zemin çökmesi: EGMS Türkiye\'yi kapsamıyor, harita katmanı yok. Yayımlanmış InSAR çalışmaları havzada yılda 1–4 cm\'den yer yer 90 mm\'ye varan çökme bildiriyor (Üstün vd. 2015; Orhan vd. 2021, 2024); kaynaklar "Yöntem ve Doğrulama" sekmesinde.',
    'Land subsidence: EGMS does not cover Türkiye, so there is no map layer. Published InSAR studies report 1–4 cm/yr in the basin and locally up to 90 mm/yr (Üstün et al. 2015; Orhan et al. 2021, 2024); sources are in the Method tab.',
  ],
  ['Bu seri bağlam bilgisidir, tarla bütçesinde kullanılmaz.', 'This series is context only; it is not used in the field budgets.'],
];

export default function BasinView() {
  const [basin, setBasin] = useState<BasinData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadBasin().then(setBasin, () => setError(t('Havza verisi yüklenemedi.', 'Basin data could not be loaded.')));
  }, []);

  // Numeric time axis: single missing months are bridged, the GRACE → GRACE-FO gap breaks the lines
  const data = useMemo(() => {
    if (!basin) return [];
    const m = basin.monthly;
    const rows: { t: number; twsa: number | null; gwsa: number | null }[] = m.month.map((mo, i) => ({
      t: decimalYear(mo),
      twsa: m.twsa_cm[i],
      gwsa: m.gwsa_cm[i],
    }));
    const gapMid = (decimalYear(basin.series.gap[0].slice(0, 7)) + decimalYear(basin.series.gap[1].slice(0, 7))) / 2;
    rows.push({ t: gapMid, twsa: null, gwsa: null });
    return rows.sort((a, b) => a.t - b.t);
  }, [basin]);

  if (error) return <p className="text-sm text-red-700">{error}</p>;
  if (!basin) return <p className="text-sm text-soil-500">{t('Yükleniyor…', 'Loading…')}</p>;

  const gw = basin.trends.gwsa_main;
  const baseFrom = basin.baseline[0].slice(0, 4);
  const baseTo = Number(basin.baseline[1].slice(0, 4)) - 1;
  const productRange = `${signed(basin.gwsa_grace_period_product_range_cm_yr[0], 2)} … ${signed(basin.gwsa_grace_period_product_range_cm_yr[1], 2)}`;
  const gapStart = decimalYear(basin.series.gap[0].slice(0, 7));
  const gapEnd = decimalYear(basin.series.gap[1].slice(0, 7));
  const years = Array.from({ length: 12 }, (_, i) => 2003 + 2 * i).filter((y) => y <= data[data.length - 1].t);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-soil-200 bg-white p-4">
        <h2 className="text-base font-semibold text-soil-900">{t('Konya Kapalı Havzası su depolama anomalisi', 'Konya Closed Basin water storage anomaly')}</h2>
        <p className="text-xs text-soil-500">
          {t(
            `GRACE/GRACE-FO (JPL mascon CRI) − GLDAS Noah toprak nemi, kar ve bitki üstü su; taban ${baseFrom}–${baseTo}; havza alanı ${fmt(basin.basin_area_km2)} km². Eşdeğer su kalınlığı, cm.`,
            `GRACE/GRACE-FO (JPL mascon CRI) − GLDAS Noah soil moisture, snow and canopy water; baseline ${baseFrom}–${baseTo}; basin area ${fmt(basin.basin_area_km2)} km². Equivalent water thickness, cm.`,
          )}
        </p>
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={years} tick={{ fontSize: 11, fill: INK }} stroke={GRID} tickFormatter={(v) => String(v)} />
              <YAxis tick={{ fontSize: 11, fill: INK }} stroke={GRID} unit=" cm" width={56} />
              <ReferenceArea x1={gapStart} x2={gapEnd} fill="#e1e0d9" fillOpacity={0.8} label={{ value: t('veri boşluğu', 'data gap'), fontSize: 10, fill: INK, position: 'insideTop' }} />
              <ReferenceLine y={0} stroke="#898781" />
              <Tooltip
                formatter={(v) => (v == null ? '–' : `${fmt(Number(v), 1)} cm`)}
                labelFormatter={(v) => {
                  const t = Number(v);
                  const y = Math.floor(t);
                  return `${String(Math.round((t - y) * 12 + 0.5)).padStart(2, '0')}.${y}`;
                }}
                contentStyle={{ fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="plainline" />
              <Line dataKey="twsa" name={t('Toplam su (TWSA)', 'Total water (TWSA)')} stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="gwsa" name={t('Yeraltı suyu (GWSA)', 'Groundwater (GWSA)')} stroke="#eb6834" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-soil-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-soil-900">{t('Yeraltı suyu eğilimi (%95 aralık)', 'Groundwater trend (95% interval)')}</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-xs text-soil-800">
            <thead className="text-soil-500">
              <tr>
                <th className="pr-3 font-medium">{t('Dönem', 'Period')}</th>
                <th className="pr-3 font-medium">{t('Aylar', 'Months')}</th>
                <th className="pr-3 font-medium">{t('Eğilim', 'Trend')}</th>
                <th className="pr-3 font-medium">{t('%95 aralık', '95% interval')}</th>
                <th className="font-medium">{t('Havza hacmi', 'Basin volume')}</th>
              </tr>
            </thead>
            <tbody>
              {['grace', 'grace_fo', 'full'].map((k) => gw[k] && <TrendRow key={k} name={PERIOD_NAMES[k]} t={gw[k]} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-soil-600">
          {t(
            `Düşüş eşit dağılmıyor: 2003–2017'de anlamlı bir eğilim yok, 2018 sonrasında belirgin hızlanma var; tek bir ortalama hız son kaybı olduğundan küçük gösterir. GRACE dönemi için dört bağımsız çözüm (JPL CRI, CSR, GFZ, JPL küresel harmonik) ${productRange} cm/yıl veriyor.`,
            `The decline is not even: no significant trend in 2003–2017, a clear acceleration after 2018; a single average rate understates the recent loss. For the GRACE period four independent solutions (JPL CRI, CSR, GFZ, JPL spherical harmonics) give ${productRange} cm/yr.`,
          )}
        </p>
      </section>

      <section className="rounded-lg border border-soil-200 bg-white p-4 text-xs text-soil-700">
        <h3 className="text-sm font-semibold text-soil-900">{t('Sınırlar', 'Limits')}</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          {LIMITS.map(([tr, en]) => (
            <li key={en}>{t(tr, en)}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

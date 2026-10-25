// Basin tab: GRACE / GRACE-FO total and groundwater storage anomaly with per-mission trends.

import { useEffect, useMemo, useState } from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceArea, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fmt } from '../components/ui';
import { loadBasin, type BasinData, type Trend } from './data';

const INK = '#52514e';
const GRID = '#e1e0d9';

/** Month "YYYY-MM" → decimal year at mid-month. */
const decimalYear = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return y + (m - 0.5) / 12;
};

const PERIOD_NAMES: Record<string, string> = {
  full: 'Tüm dönem',
  grace: 'GRACE',
  grace_fo: 'GRACE-FO',
};

const signed = (v: number, d = 1) => `${v >= 0 ? '+' : '−'}${fmt(Math.abs(v), d)}`;

function TrendRow({ name, t }: { name: string; t: Trend }) {
  return (
    <tr className="border-t border-soil-100">
      <td className="py-1 pr-3">{name}</td>
      <td className="pr-3 tabular-nums">
        {t.from} – {t.to}
      </td>
      <td className="pr-3 font-semibold tabular-nums">{signed(t.slope_cm_yr, 2)} cm/yıl</td>
      <td className="pr-3 tabular-nums">
        {signed(t.ci95_cm_yr[0], 2)} … {signed(t.ci95_cm_yr[1], 2)}
      </td>
      <td className="tabular-nums">
        {signed(t.km3_yr, 2)} km³/yıl ({signed(t.ci95_km3_yr[0], 2)} … {signed(t.ci95_km3_yr[1], 2)})
      </td>
    </tr>
  );
}

export default function BasinView() {
  const [basin, setBasin] = useState<BasinData | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    loadBasin().then(setBasin, () => setError('Havza verisi yüklenemedi.'));
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
  if (!basin) return <p className="text-sm text-soil-500">Yükleniyor…</p>;

  const gw = basin.trends.gwsa_main;
  const gapStart = decimalYear(basin.series.gap[0].slice(0, 7));
  const gapEnd = decimalYear(basin.series.gap[1].slice(0, 7));
  const years = Array.from({ length: 12 }, (_, i) => 2003 + 2 * i).filter((y) => y <= data[data.length - 1].t);

  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-soil-200 bg-white p-4">
        <h2 className="text-base font-semibold text-soil-900">Konya Kapalı Havzası su depolama anomalisi</h2>
        <p className="text-xs text-soil-500">
          GRACE/GRACE-FO (JPL mascon CRI) − GLDAS Noah toprak nemi, kar ve bitki üstü su; taban {basin.baseline[0].slice(0, 4)}–
          {Number(basin.baseline[1].slice(0, 4)) - 1}; havza alanı {fmt(basin.basin_area_km2)} km². Eşdeğer su kalınlığı, cm.
        </p>
        <div className="mt-3 h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
              <CartesianGrid stroke={GRID} vertical={false} />
              <XAxis dataKey="t" type="number" domain={['dataMin', 'dataMax']} ticks={years} tick={{ fontSize: 11, fill: INK }} stroke={GRID} tickFormatter={(v) => String(v)} />
              <YAxis tick={{ fontSize: 11, fill: INK }} stroke={GRID} unit=" cm" width={56} />
              <ReferenceArea x1={gapStart} x2={gapEnd} fill="#e1e0d9" fillOpacity={0.8} label={{ value: 'veri boşluğu', fontSize: 10, fill: INK, position: 'insideTop' }} />
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
              <Line dataKey="twsa" name="Toplam su (TWSA)" stroke="#2a78d6" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line dataKey="gwsa" name="Yeraltı suyu (GWSA)" stroke="#eb6834" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-soil-200 bg-white p-4">
        <h3 className="text-sm font-semibold text-soil-900">Yeraltı suyu eğilimi (%95 aralık)</h3>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full text-left text-xs text-soil-800">
            <thead className="text-soil-500">
              <tr>
                <th className="pr-3 font-medium">Dönem</th>
                <th className="pr-3 font-medium">Aylar</th>
                <th className="pr-3 font-medium">Eğilim</th>
                <th className="pr-3 font-medium">%95 aralık</th>
                <th className="font-medium">Havza hacmi</th>
              </tr>
            </thead>
            <tbody>
              {['grace', 'grace_fo', 'full'].map((k) => gw[k] && <TrendRow key={k} name={PERIOD_NAMES[k]} t={gw[k]} />)}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-soil-600">
          Düşüş eşit dağılmıyor: 2003–2017'de anlamlı bir eğilim yok, 2018 sonrasında belirgin hızlanma var; tek bir ortalama hız son kaybı
          olduğundan küçük gösterir. GRACE dönemi için dört bağımsız çözüm (JPL CRI, CSR, GFZ, JPL küresel harmonik){' '}
          {signed(basin.gwsa_grace_period_product_range_cm_yr[0], 2)} … {signed(basin.gwsa_grace_period_product_range_cm_yr[1], 2)} cm/yıl veriyor.
        </p>
      </section>

      <section className="rounded-lg border border-soil-200 bg-white p-4 text-xs text-soil-700">
        <h3 className="text-sm font-semibold text-soil-900">Sınırlar</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>GRACE çözünürlüğü (~300 km) havzadan kabadır; sonuç komşu alanların etkisini de içeren havza ölçeğinde bir eğilimdir.</li>
          <li>GLDAS Noah sulama ve yeraltı suyu içermez; yeraltı suyu bileşeni kalan fark olarak hesaplanır.</li>
          <li>Göl ve baraj suyu (Beyşehir, Tuz Gölü, barajlar) ayrılmadı, yeraltı suyu bileşeninde kalır.</li>
          <li>GRACE-FO dönemi altı yıllık ve kurak yıllar içeriyor; bu dönemin hızı başlangıç ve bitiş aylarına duyarlıdır.</li>
          <li>Zemin çökmesi: EGMS Türkiye'yi kapsamıyor, harita katmanı yok. Yayımlanmış InSAR çalışmaları havzada yılda 1–4 cm'den yer yer 90 mm'ye varan çökme bildiriyor (Üstün vd. 2015; Orhan vd. 2021, 2024); kaynaklar "Yöntem ve Doğrulama" sekmesinde.</li>
          <li>Bu seri bağlam bilgisidir, tarla bütçesinde kullanılmaz.</li>
        </ul>
      </section>
    </div>
  );
}

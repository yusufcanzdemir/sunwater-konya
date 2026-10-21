import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { scaleRange, type Range } from '../engine/impact';
import type { SeasonAnalysis } from '../engine/plan';
import type { EnergySource } from '../state/farm';
import { AssumptionBadge, fmt } from './ui';

export const DISCLAIMER =
  'Bu sonuçlar FAO-56 yöntemi, gerçek hava verisi ve varsayımlara dayalı TAHMİNDİR. Gerçek tasarruf, pilot tarlalarda kuyu sayacı ölçümüyle doğrulanacaktır.';

export function Disclaimer() {
  return <p className="rounded-md border border-slate-300 bg-slate-100 p-3 text-sm font-medium text-slate-700">{DISCLAIMER}</p>;
}

const range = (r: Range, digits = 0) => `${fmt(r.low, digits)} – ${fmt(r.high, digits)}`;
const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

function ImpactCard({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4">
      <div className="text-sm text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold text-emerald-900">
        {value} <span className="text-sm font-normal text-slate-600">{unit}</span>
      </div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

function CumulativeChart({ analysis }: { analysis: SeasonAnalysis }) {
  const data = analysis.modelCumulative.map((m, i) => {
    const b = analysis.baseline.cumulative[i].volumeM3;
    return { date: m.date, model: m.volumeM3, baseline: b, gap: [Math.min(m.volumeM3, b), Math.max(m.volumeM3, b)] };
  });
  return (
    <div>
      <h4 className="mb-1 text-sm font-semibold text-slate-700">Sezon boyunca kuyudan çekilen toplam su (m³)</h4>
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} fontSize={12} />
          <YAxis fontSize={12} tickFormatter={(v: number) => fmt(v)} width={70} />
          <Tooltip
            labelFormatter={(l) => shortDate(String(l))}
            formatter={(v, name) => (name === 'Fark' ? null : `${fmt(Number(v))} m³`)}
          />
          <Legend />
          <Area dataKey="gap" name="Fark" fill="#10b981" fillOpacity={0.15} stroke="none" legendType="none" />
          <Line dataKey="baseline" name="Mevcut alışkanlık" stroke="#64748b" strokeWidth={2} dot={false} />
          <Line dataKey="model" name="Bu plan" stroke="#059669" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

interface Props {
  analysis: SeasonAnalysis;
  energySource: EnergySource;
  seasonLabel: string;
  maxRotationDays: number;
}

export function Retrospective({ analysis, energySource, seasonLabel, maxRotationDays }: Props) {
  const { impact, baseline, balance, schedule } = analysis;
  const savings = impact.savings;
  const modelM3 = balance.totals.volumeM3;
  const sched = schedule.totals;
  const solarShare = sched.pumpKwh > 0 ? (sched.solarKwh / sched.pumpKwh) * 100 : 0;
  const overflowing = schedule.irrigations.filter((i) => i.unscheduledHours > 0);
  const avg = (pick: (i: (typeof schedule.irrigations)[number]) => number) =>
    schedule.irrigations.reduce((s, i) => s + pick(i), 0) / Math.max(1, schedule.irrigations.length);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{seasonLabel}</p>
        {savings ? (
          <h3 className="mt-1 text-xl font-bold text-emerald-900">
            Geçen sezonun gerçek hava verisiyle: bu plan {fmt(savings.waterM3.mid)} m³ (≈%{fmt(savings.waterPercent)}) daha
            az su çekerdi.
          </h3>
        ) : impact.underIrrigation ? (
          <h3 className="mt-1 text-xl font-bold text-amber-900">
            Geçen sezonun gerçek hava verisiyle: mevcut sulamanız ({fmt(baseline.volumeM3)} m³) bitkinin ihtiyacının (
            {fmt(modelM3)} m³) altında kalıyor – verim riski. Bu durumda tasarruf iddia edilmez.
          </h3>
        ) : (
          <h3 className="mt-1 text-xl font-bold text-slate-800">
            Geçen sezonun gerçek hava verisiyle: mevcut sulamanız ile plan aynı miktarda su çekiyor.
          </h3>
        )}
        <p className="mt-1 text-sm text-slate-600">
          Mevcut alışkanlık: {fmt(baseline.volumeM3)} m³
          {baseline.kind === 'habit' ? (
            <> ({baseline.irrigationCount} sulama)</>
          ) : (
            <>
              {' '}
              – alışkanlık girilmediği için planın üzerine fazla sulama varsayıldı <AssumptionBadge />
            </>
          )}{' '}
          · Bu plan: {fmt(modelM3)} m³ ({balance.totals.irrigationCount} sulama)
        </p>
      </div>

      <CumulativeChart analysis={analysis} />

      {savings && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ImpactCard label="Su tasarrufu" value={range(savings.waterM3)} unit="m³" note={`≈ ${fmt(savings.waterM3.mid)} m³`} />
            <ImpactCard
              label="Pompa enerjisi tasarrufu"
              value={range(savings.energyKwh)}
              unit="kWh"
              note={savings.dieselL ? `≈ ${range(savings.dieselL)} L dizel` : undefined}
            />
            <ImpactCard
              label="CO₂ azaltımı"
              value={range(savings.co2Kg)}
              unit="kg"
              note={energySource === 'solar_grid' ? 'Tasarruf edilen elektrik şebekeye verilirse (şebeke eşdeğeri)' : undefined}
            />
            <ImpactCard
              label="Para tasarrufu"
              value={savings.costTl ? range(savings.costTl) : '—'}
              unit={savings.costTl ? 'TL' : ''}
              note={savings.costTl ? undefined : energySource === 'diesel' ? 'Dizel fiyatını girin' : 'Elektrik fiyatını girin'}
            />
          </div>
          <p className="text-xs text-slate-500">
            Aralıklar ±%{fmt(((savings.waterM3.high - savings.waterM3.mid) / savings.waterM3.mid) * 100)} belirsizliği
            gösterir <AssumptionBadge />
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                  <th className="py-2 pr-4 font-medium">Ölçek</th>
                  <th className="py-2 pr-4 font-medium">Su (m³)</th>
                  <th className="py-2 pr-4 font-medium">Enerji (kWh)</th>
                  <th className="py-2 pr-4 font-medium">CO₂ (ton)</th>
                  <th className="py-2 font-medium">TL</th>
                </tr>
              </thead>
              <tbody>
                {[1, 100, 1000].map((n) => (
                  <tr key={n} className="border-b border-slate-100">
                    <td className="py-2 pr-4">{n === 1 ? 'Bu tarla' : `${fmt(n)} benzer tarla`}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.waterM3, n))}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.energyKwh, n))}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.co2Kg, n / 1000), 1)}</td>
                    <td className="py-2">{savings.costTl ? range(scaleRange(savings.costTl, n)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-xs text-slate-500">Ölçek tablosu bu tarlanın değerinin tarla sayısıyla çarpımıdır.</p>
          </div>
        </>
      )}

      <div className="rounded-lg border border-slate-200 p-4 text-sm text-slate-700">
        <h4 className="mb-2 font-semibold">
          Güneşe göre dönüşümlü pompa planı (bu sezon) <AssumptionBadge />
        </h4>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Tarla parsel parsel, dönüşümlü sulanır: her sulama turu bir sonraki tura kadar (en fazla {maxRotationDays}{' '}
            gün) yayılır ve önce günlerin en güneşli saatleri kullanılır.
          </li>
          <li>
            Pompa gücü ≈ {fmt(analysis.pumpKw, 1)} kW; tur başına ortalama {fmt(avg((i) => i.hoursNeeded), 1)} saat
            çalışma, {fmt(avg((i) => i.pumpingDays), 1)} güne yayılarak.
          </li>
          {energySource === 'solar_grid' && sched.pumpKwh > 0 && (
            <li>
              Planlanan pompa enerjisinin %{fmt(solarShare)}'i güneşten karşılanır ({fmt(sched.solarKwh)} kWh güneş,{' '}
              {fmt(sched.gridKwh)} kWh şebeke). Pompa dışında kalan {fmt(sched.surplusPvKwh)} kWh güneş enerjisi
              şebekeye verilebilir.
            </li>
          )}
          {overflowing.length > 0 && (
            <li className="text-red-700">
              Pompa kapasitesi sınırda: {overflowing.length} turda pompa 24 saat çalışsa bile tur bir sonraki
              sulamaya kadar bitmiyor (toplam {fmt(sched.unscheduledHours)} saat). Bu saatler güneş/şebeke
              paylaşımına dahil değildir; su ve etki hesabı ise ihtiyacın tamamını kapsar.
            </li>
          )}
        </ul>
      </div>

      <Disclaimer />
    </div>
  );
}

import { scaleRange, type Range } from '../engine/impact';
import type { SeasonAnalysis } from '../engine/plan';
import type { EnergySource } from '../state/farm';
import { ImpactCards } from './ImpactCards';
import { SeasonPlayer } from './SeasonPlayer';
import { fmt } from './ui';

const range = (r: Range, digits = 0) => `${fmt(r.low, digits)} – ${fmt(r.high, digits)}`;

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
        <p className="text-xs font-medium uppercase tracking-wide text-soil-500">{seasonLabel}</p>
        {savings ? (
          <h3 className="mt-1 text-xl font-bold text-soil-900">
            Geçen sezonun gerçek hava verisiyle: bu plan {fmt(savings.waterM3.mid)} m³ (≈%{fmt(savings.waterPercent)}) daha
            az su çekerdi.
          </h3>
        ) : impact.underIrrigation ? (
          <h3 className="mt-1 text-xl font-bold text-amber-900">
            Geçen sezonun gerçek hava verisiyle: mevcut sulamanız ({fmt(baseline.volumeM3)} m³) bitkinin ihtiyacının (
            {fmt(modelM3)} m³) altında kalıyor – verim riski. Bu durumda tasarruf iddia edilmez.
          </h3>
        ) : (
          <h3 className="mt-1 text-xl font-bold text-soil-800">
            Geçen sezonun gerçek hava verisiyle: mevcut sulamanız ile plan aynı miktarda su çekiyor.
          </h3>
        )}
        <p className="mt-1 text-sm text-soil-600">
          Mevcut alışkanlık: {fmt(baseline.volumeM3)} m³
          {baseline.kind === 'habit' && <> ({baseline.irrigationCount} sulama)</>}{' '}
          · Bu plan: {fmt(modelM3)} m³ ({balance.totals.irrigationCount} sulama)
        </p>
      </div>

      <SeasonPlayer analysis={analysis} />

      {savings && (
        <>
          <ImpactCards savings={savings} energySource={energySource} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="border-b border-soil-200 text-soil-500">
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
                  <tr key={n} className="border-b border-soil-100">
                    <td className="py-2 pr-4">{n === 1 ? 'Bu tarla' : `${fmt(n)} benzer tarla`}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.waterM3, n))}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.energyKwh, n))}</td>
                    <td className="py-2 pr-4">{range(scaleRange(savings.co2Kg, n / 1000), 1)}</td>
                    <td className="py-2">{savings.costTl ? range(scaleRange(savings.costTl, n)) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="rounded-lg border border-soil-200 p-4 text-sm text-soil-700">
        <h4 className="mb-2 font-semibold">Güneşe göre pompa planı</h4>
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

    </div>
  );
}

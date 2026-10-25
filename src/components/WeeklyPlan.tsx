import type { SeasonAnalysis } from '../engine/plan';
import { dailyPumping, formatWindow } from '../engine/schedule';
import type { EnergySource } from '../state/farm';
import { fmt } from './ui';

const DAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const dayLabel = (iso: string) => {
  const weekday = DAY_NAMES[new Date(`${iso}T12:00:00Z`).getUTCDay()];
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)} ${weekday}`;
};

interface Props {
  analysis: SeasonAnalysis;
  energySource: EnergySource;
  forecastDays: number;
  onShowRetrospective: () => void;
}

export function WeeklyPlan({ analysis, energySource, forecastDays, onShowRetrospective }: Props) {
  const { balance, schedule } = analysis;

  if (balance.days.length === 0) {
    return (
      <div className="rounded-md bg-water-50 p-4 text-water-700">
        <p>
          Sulama sezonu dışındasınız: önümüzdeki {forecastDays} gün bu ürünün sulama dönemine denk gelmiyor. Planın
          neler kazandıracağını geçen sezonun gerçek verisiyle görebilirsiniz.
        </p>
        <button type="button" onClick={onShowRetrospective} className="mt-2 font-medium underline">
          Geriye dönük teste git →
        </button>
      </div>
    );
  }

  const first = balance.days[0].date;
  const last = balance.days[balance.days.length - 1].date;

  return (
    <div className="space-y-3">
      <p className="text-sm text-soil-600">
        {dayLabel(first)} – {dayLabel(last)}
      </p>

      {schedule.irrigations.length === 0 ? (
        <p className="rounded-md bg-wheat-50 p-4 text-soil-900">Bu dönemde sulama gerekmiyor.</p>
      ) : (
        <ul className="space-y-3">
          {schedule.irrigations.map((irr) => (
            <li key={irr.date} className="rounded-lg border border-soil-200 p-4">
              <div className="font-semibold text-soil-900">
                Sulama turu: {dayLabel(irr.date)} – {dayLabel(irr.windowEnd)}
              </div>
              <div className="mt-1 text-sm text-soil-600">
                Tarlayı parsel parsel sulayın · toplam {fmt(irr.hoursScheduled, 1)} saat · {fmt(irr.volumeM3)} m³
                {energySource === 'solar_grid' && (
                  <>
                    {' '}
                    · {fmt(irr.solarKwh)} kWh güneşten, {fmt(irr.gridKwh)} kWh şebekeden
                  </>
                )}
              </div>
              <table className="mt-2 w-full text-sm">
                <tbody>
                  {dailyPumping(irr.hours).map((d) => (
                    <tr key={d.date} className="border-t border-soil-100">
                      <td className="py-1.5 pr-4 whitespace-nowrap text-soil-700">{dayLabel(d.date)}</td>
                      <td className="py-1.5 pr-4 text-soil-900">
                        {d.windows.map((w) => formatWindow(w, d.date)).join(', ')}
                      </td>
                      <td className="py-1.5 text-right whitespace-nowrap text-soil-600">{fmt(d.hours, 1)} saat</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {irr.unscheduledHours > 0 && (
                <div className="mt-1 text-sm text-red-700">
                  {fmt(irr.unscheduledHours, 1)} saat bu tura sığmadı
                  {irr.windowEnd === last ? ' (tahmin süresinin sonuna ulaşıldı)' : ' – pompa kapasitesi sınırda'}.
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

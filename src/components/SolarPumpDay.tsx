import { ChevronLeft, ChevronRight, Sun } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Area, Bar, CartesianGrid, ComposedChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dayName } from '../ai/explain';
import type { SeasonAnalysis } from '../engine/plan';
import { bestSolarDay, dayEnergy, pumpingDates } from '../engine/visuals';
import { fmt } from './ui';

/** Whole hours without ",0"; partial hours with one decimal. */
const hours = (h: number) => fmt(h, Math.abs(h - Math.round(h)) < 0.05 ? 0 : 1);

interface Props {
  analysis: SeasonAnalysis;
  /** Shown above the chart, e.g. "Geçen sezondan örnek gün". */
  caption?: string;
}

export function SolarPumpDay({ analysis, caption }: Props) {
  const dates = useMemo(() => pumpingDates(analysis), [analysis]);
  const initial = useMemo(() => bestSolarDay(analysis), [analysis]);
  const [picked, setPicked] = useState<string | null>(null);
  const date = picked && dates.includes(picked) ? picked : initial;
  const day = useMemo(() => (date ? dayEnergy(analysis, date) : null), [analysis, date]);

  if (!date || !day) {
    return <p className="text-sm text-soil-600">Bu dönemde pompanın çalıştığı gün yok.</p>;
  }

  const i = dates.indexOf(date);
  const data = day.hours.map((h) => ({ ...h, pump: h.pumpKw > 0 ? h.pumpKw : null }));
  const solarShare = day.pumpHours > 0 ? day.solarOnlyPumpHours : 0;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {caption && <p className="text-xs font-medium uppercase tracking-wide text-soil-500">{caption}</p>}
          <p className="text-lg font-semibold text-soil-900">{dayName(date)}</p>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Önceki gün"
            disabled={i <= 0}
            onClick={() => setPicked(dates[i - 1])}
            className="rounded-full border border-soil-300 p-2 hover:bg-soil-100 disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <select
            aria-label="Gün seç"
            value={date}
            onChange={(e) => setPicked(e.target.value)}
            className="rounded-md border border-soil-300 bg-white px-2 py-1.5 text-sm"
          >
            {dates.map((d) => (
              <option key={d} value={d}>
                {dayName(d)}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Sonraki gün"
            disabled={i >= dates.length - 1}
            onClick={() => setPicked(dates[i + 1])}
            className="rounded-full border border-soil-300 p-2 hover:bg-soil-100 disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <p className="flex items-start gap-2 rounded-lg bg-sun-100 p-3 text-soil-900">
        <Sun size={20} className="mt-0.5 shrink-0 text-sun-500" />
        <span>
          Pompa bu gün {hours(day.pumpHours)} saat çalıştı; bunun {hours(solarShare)} saati tamamen güneşle.{' '}
          {fmt(day.surplusKwh)} kWh fazla enerji şebekeye verilebilir.
          {day.gridKwh > 0.5 && <> Şebekeden {fmt(day.gridKwh)} kWh çekildi.</>}
        </span>
      </p>

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5d8c5" />
          <XAxis dataKey="hour" fontSize={12} interval={2} />
          <YAxis fontSize={12} unit=" kW" width={60} />
          <Tooltip formatter={(v) => `${fmt(Number(v), 1)} kW`} />
          <Legend />
          <Area dataKey="solarKw" name="Pompaya giden güneş" stackId="pv" fill="#fcc419" stroke="#f2a900" fillOpacity={0.9} />
          <Area dataKey="surplusKw" name="Şebekeye verilebilir fazla" stackId="pv" fill="#fff6cc" stroke="#ffdd55" fillOpacity={1} />
          <Bar dataKey="pump" name="Pompa çalışıyor" fill="#1d77f2" fillOpacity={0.35} stroke="#1d77f2" barSize={18} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

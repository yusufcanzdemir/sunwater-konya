import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WaterBalanceResult } from '../engine/waterBalance';
import { fmt } from './ui';

const shortDate = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const mmTooltip = (value: unknown) => `${fmt(Number(value), 1)} mm`;

export function WaterBalanceChart({ result }: { result: WaterBalanceResult }) {
  const data = result.days.map((d) => ({
    date: d.date,
    et0: d.et0,
    etc: d.etc,
    precipitation: d.precipitation,
    depletion: d.depletionBeforeIrrigationMm,
    irrigation: d.irrigated ? d.netMm : null,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h4 className="mb-1 text-sm font-semibold text-slate-700">Günlük buharlaşma ve yağış (mm/gün)</h4>
        <ResponsiveContainer width="100%" height={260}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip labelFormatter={(l) => shortDate(String(l))} formatter={mmTooltip} />
            <Legend />
            <Bar dataKey="precipitation" name="Yağış" fill="#60a5fa" />
            <Line dataKey="et0" name="Referans buharlaşma (ET0)" stroke="#f59e0b" dot={false} strokeWidth={1.5} />
            <Line dataKey="etc" name="Bitki su tüketimi (ETc)" stroke="#16a34a" dot={false} strokeWidth={2} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold text-slate-700">
          Kök bölgesindeki su eksikliği ve sulama günleri (mm)
        </h4>
        <ResponsiveContainer width="100%" height={280}>
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={shortDate} minTickGap={24} fontSize={12} />
            <YAxis fontSize={12} domain={[0, Math.ceil(result.tawMm)]} />
            <Tooltip labelFormatter={(l) => shortDate(String(l))} formatter={mmTooltip} />
            <Legend />
            <Bar dataKey="irrigation" name="Sulama (net)" fill="#0ea5e9" />
            <Line dataKey="depletion" name="Su eksikliği (Dr)" stroke="#b45309" dot={false} strokeWidth={2} />
            <ReferenceLine
              y={result.rawMm}
              stroke="#dc2626"
              strokeDasharray="6 4"
              label={{ value: `Sulama eşiği RAW ${fmt(result.rawMm)} mm`, position: 'insideTopRight', fontSize: 11, fill: '#dc2626' }}
            />
          </ComposedChart>
        </ResponsiveContainer>
        <p className="text-xs text-slate-500">
          Eksiklik kırmızı eşiğe ulaştığında sulama yapılır ve toprak tarla kapasitesine geri getirilir.
        </p>
      </div>
    </div>
  );
}

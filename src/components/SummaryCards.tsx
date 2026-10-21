import type { WaterBalanceResult } from '../engine/waterBalance';
import { fmt } from './ui';

function Card({ label, value, unit, note }: { label: string; value: string; unit: string; note?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">
        {value} <span className="text-base font-normal text-slate-500">{unit}</span>
      </div>
      {note && <div className="mt-1 text-xs text-slate-500">{note}</div>}
    </div>
  );
}

export function SummaryCards({ result }: { result: WaterBalanceResult }) {
  const { totals } = result;
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Card
        label="Toplam net sulama ihtiyacı"
        value={fmt(totals.netMm)}
        unit="mm"
        note={`Bitki su tüketimi ${fmt(totals.etcMm)} mm, etkili yağış ${fmt(totals.peffMm)} mm`}
      />
      <Card label="Kuyudan çekilecek brüt su" value={fmt(totals.volumeM3)} unit="m³" note={`${fmt(totals.grossMm)} mm brüt`} />
      <Card
        label="Sulama sayısı"
        value={fmt(totals.irrigationCount)}
        unit="kez"
        note={`Kullanılabilir su ${fmt(result.tawMm)} mm, eşik ${fmt(result.rawMm)} mm`}
      />
    </div>
  );
}

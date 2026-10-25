import { animate, useInView, useReducedMotion } from 'framer-motion';
import { Banknote, Droplets, Leaf, Users, Waves, Zap, type LucideIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { waterEquivalents } from '../engine/constants';
import type { Range, Savings } from '../engine/impact';
import type { EnergySource } from '../state/farm';
import { fmt } from './ui';

/** Counts up to `value` the first time it scrolls into view. */
function CountUp({ value, digits = 0 }: { value: number; digits?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);

  useEffect(() => {
    if (!inView) return;
    if (reduce) return setShown(value);
    const controls = animate(0, value, { duration: 1.4, ease: 'easeOut', onUpdate: setShown });
    return () => controls.stop();
  }, [inView, value, reduce]);

  return <span ref={ref}>{fmt(shown, digits)}</span>;
}

const range = (r: Range, digits = 0) => `${fmt(r.low, digits)} – ${fmt(r.high, digits)}`;

function Card({
  icon: Icon,
  tone,
  label,
  value,
  digits,
  unit,
  rangeText,
  note,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: number | null;
  digits?: number;
  unit: string;
  rangeText?: string;
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-soil-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-2 text-sm font-medium text-soil-700">
        <span className={`flex h-9 w-9 items-center justify-center rounded-full ${tone}`}>
          <Icon size={20} />
        </span>
        {label}
      </div>
      {value != null ? (
        <div className="text-3xl font-bold tracking-tight text-soil-900 sm:text-4xl">
          ≈ <CountUp value={value} digits={digits} /> <span className="text-lg font-medium text-soil-600">{unit}</span>
        </div>
      ) : (
        <div className="text-3xl font-bold text-soil-400">—</div>
      )}
      {rangeText && <div className="text-sm text-soil-600">aralık {rangeText} {unit}</div>}
      {note && <div className="text-xs text-soil-500">{note}</div>}
    </div>
  );
}

export function ImpactCards({ savings, energySource }: { savings: Savings; energySource: EnergySource }) {
  const co2Ton: Range = { low: savings.co2Kg.low / 1000, mid: savings.co2Kg.mid / 1000, high: savings.co2Kg.high / 1000 };
  const eq = waterEquivalents(savings.waterM3.mid);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card
          icon={Droplets}
          tone="bg-water-100 text-water-600"
          label="Su tasarrufu"
          value={savings.waterM3.mid}
          unit="m³"
          rangeText={range(savings.waterM3)}
        />
        <Card
          icon={Zap}
          tone="bg-sun-100 text-sun-500"
          label="Pompa enerjisi"
          value={savings.energyKwh.mid}
          unit="kWh"
          rangeText={range(savings.energyKwh)}
          note={savings.dieselL ? `≈ ${range(savings.dieselL)} L dizel` : undefined}
        />
        <Card
          icon={Leaf}
          tone="bg-soil-100 text-soil-700"
          label="CO₂ azaltımı"
          value={co2Ton.mid}
          digits={1}
          unit="ton"
          rangeText={range(co2Ton, 1)}
          note={energySource === 'solar_grid' ? 'Tasarruf edilen elektrik şebekeye verilirse (şebeke eşdeğeri)' : undefined}
        />
        <Card
          icon={Banknote}
          tone="bg-wheat-100 text-wheat-700"
          label="Para tasarrufu"
          value={savings.costTl?.mid ?? null}
          unit="TL"
          rangeText={savings.costTl ? range(savings.costTl) : undefined}
          note={savings.costTl ? undefined : energySource === 'diesel' ? 'Görmek için dizel fiyatını girin' : 'Görmek için elektrik fiyatını girin'}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center gap-3 rounded-2xl bg-water-50 p-4 text-soil-900">
          <Waves size={28} className="shrink-0 text-water-600" />
          <span>
            Bu kadar su ≈ <strong className="text-xl">{fmt(eq.olympicPools, eq.olympicPools < 10 ? 1 : 0)}</strong> olimpik havuz
            <span className="block text-xs text-soil-600">1 olimpik havuz = 2.500 m³</span>
          </span>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-water-50 p-4 text-soil-900">
          <Users size={28} className="shrink-0 text-water-600" />
          <span>
            ≈ <strong className="text-xl">{fmt(eq.householdYears)}</strong> hanenin bir yıllık şebeke suyu
          </span>
        </div>
      </div>
    </div>
  );
}

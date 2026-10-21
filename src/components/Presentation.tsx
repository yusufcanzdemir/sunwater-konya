import { BarChart3, MapPin, Sun, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export const CONTEXT_TEXT =
  "Konya Kapalı Havzası'nda aşırı yeraltı suyu çekimi obruk oluşumunu hızlandırıyor. Güneş enerjisi pompayı bedavaya çalıştırınca bu risk artabilir.";

export function ContextBand() {
  return (
    <div className="border-b border-amber-200 bg-amber-50">
      <p className="mx-auto max-w-6xl px-4 py-3 text-sm font-medium text-amber-950">{CONTEXT_TEXT}</p>
    </div>
  );
}

export type Step = 1 | 2 | 3;

const STEPS: { step: Step; title: string; hint: string; icon: LucideIcon }[] = [
  { step: 1, title: 'Tarlanı göster', hint: 'Haritada çiz veya yazarak anlat', icon: MapPin },
  { step: 2, title: 'Planın', hint: 'Güneş–pompa grafiği, haftalık plan', icon: Sun },
  { step: 3, title: 'Etkin', hint: 'Sezon oynatıcı, etki kartları', icon: BarChart3 },
];

export function StepNav({ current, enabled, onSelect }: { current: Step; enabled: boolean; onSelect: (s: Step) => void }) {
  return (
    <nav aria-label="Adımlar" className="grid grid-cols-3 gap-2">
      {STEPS.map(({ step, title, hint, icon: Icon }) => {
        const active = step === current;
        const disabled = step !== 1 && !enabled;
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            aria-current={active ? 'step' : undefined}
            onClick={() => onSelect(step)}
            className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-left transition ${
              active
                ? 'border-wheat-700 bg-wheat-700 text-white shadow-sm'
                : 'border-soil-200 bg-white text-soil-800 hover:border-wheat-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-soil-200'
            }`}
          >
            <Icon size={24} className="hidden shrink-0 sm:block" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold sm:text-base">
                {step}) {title}
              </span>
              <span className={`hidden text-xs sm:block ${active ? 'text-wheat-50' : 'text-soil-500'}`}>{hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-soil-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function TodayAndVision() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-wheat-200 bg-white p-5">
        <h2 className="font-semibold text-soil-900">Bugün çalışan</h2>
        <List
          items={[
            'Doğal dilden tarla bilgisi',
            'FAO-56 su dengesi (gerçek hava verisi)',
            'Güneşe göre saatlik plan',
            'Geriye dönük test',
            'Etki hesabı',
            'Sade Türkçe açıklama',
          ]}
        />
      </div>
      <div className="rounded-xl border border-dashed border-soil-300 bg-white p-5">
        <h2 className="font-semibold text-soil-800">Vizyon</h2>
        <List
          items={[
            'Sentinel-2 NDVI ile tarla bazında kalibrasyon',
            'Pompa kontrol cihazıyla otomatik çalıştırma',
            'Kuyu sayacı ile ölçülmüş tasarruf',
            'Kooperatif paneli',
            'Sesli kullanım',
          ]}
        />
      </div>
    </section>
  );
}

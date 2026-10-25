import { BarChart3, MapPin, Sun, type LucideIcon } from 'lucide-react';

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
            className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
              active
                ? 'border-emerald-900 bg-emerald-900 text-white shadow-sm'
                : 'border-soil-200 bg-white text-soil-800 hover:border-emerald-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-soil-200'
            }`}
          >
            <Icon size={24} className="hidden shrink-0 sm:block" />
            <span className="min-w-0">
              <span className="block text-sm font-semibold sm:text-base">
                {step}) {title}
              </span>
              <span className={`hidden text-xs sm:block ${active ? 'text-emerald-100' : 'text-soil-500'}`}>{hint}</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}

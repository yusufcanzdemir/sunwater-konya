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

const STEPS: { step: Step; title: string; hint: string }[] = [
  { step: 1, title: 'Tarlanı anlat', hint: 'Konum, ürün, kuyu, alışkanlık' },
  { step: 2, title: 'Planın', hint: 'Bu hafta ne zaman, kaç saat' },
  { step: 3, title: 'Etkin', hint: 'Geçen sezonla geriye dönük test' },
];

export function StepNav({ current, enabled, onSelect }: { current: Step; enabled: boolean; onSelect: (s: Step) => void }) {
  return (
    <nav aria-label="Adımlar" className="grid grid-cols-3 gap-2">
      {STEPS.map(({ step, title, hint }) => {
        const active = step === current;
        const disabled = step !== 1 && !enabled;
        return (
          <button
            key={step}
            type="button"
            disabled={disabled}
            aria-current={active ? 'step' : undefined}
            onClick={() => onSelect(step)}
            className={`rounded-lg border px-3 py-2 text-left transition ${
              active
                ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm'
                : 'border-slate-200 bg-white text-slate-800 hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200'
            }`}
          >
            <span className="block text-sm font-semibold">
              {step}) {title}
            </span>
            <span className={`hidden text-xs sm:block ${active ? 'text-emerald-50' : 'text-slate-500'}`}>{hint}</span>
          </button>
        );
      })}
    </nav>
  );
}

function List({ items }: { items: ReactNode[] }) {
  return (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

export function TodayAndVision() {
  return (
    <section className="grid gap-4 md:grid-cols-2">
      <div className="rounded-xl border border-emerald-200 bg-white p-5">
        <h2 className="font-semibold text-emerald-900">Bugün çalışan</h2>
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
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
        <h2 className="font-semibold text-slate-800">Vizyon</h2>
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

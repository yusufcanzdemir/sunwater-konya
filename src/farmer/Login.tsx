// Entry screen of the farmer app. Desktop: sign-in on the left, "find your code" map on the right.
// Phone: the same two parts one under the other. Tapping a field on the map shows its code and enters.

import { ArrowRight, LocateFixed, MousePointerClick } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Logo } from '../components/AppSwitch';
import { t } from '../i18n';
import FieldsMap from '../panel/FieldsMap';
import type { PilotField } from './pilot';

export type Notice = { text: string; planLink?: boolean } | null;

/** "3053", "f3053", "F03053" → "F03053". */
export function normaliseCode(text: string): string {
  const id = text.trim().toUpperCase().replace(/\s+/g, '').replace(/^F?/, 'F');
  return /^F\d+$/.test(id) ? `F${id.slice(1).padStart(5, '0')}` : id;
}

export default function Login({
  season,
  rows,
  classNames,
  notice,
  locating,
  onCode,
  onLocate,
  onPick,
  exampleId,
  embedded = false,
}: {
  /** Inside the product page: a section heading instead of the logo and the app title. */
  embedded?: boolean;
  season: number;
  rows: Map<string, PilotField>;
  classNames: Record<string, string>;
  notice: Notice;
  locating: boolean;
  onCode: (text: string) => void;
  onLocate: () => void;
  onPick: (id: string) => void;
  exampleId: string;
}) {
  const [code, setCode] = useState('');
  const [picked, setPicked] = useState<PilotField | null>(null);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim()) onCode(code);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
      {/* Sign in */}
      <div className="flex shrink-0 flex-col justify-center px-6 py-8 lg:w-[460px] lg:overflow-y-auto lg:px-10">
        <div className="mx-auto w-full max-w-sm">
          {embedded ? (
            <>
              <h2 className="text-3xl font-bold tracking-tight text-stone-900 lg:text-4xl">{t('Tarlanı bul', 'Find your field')}</h2>
              <p className="mt-2 text-stone-600">
                {t('Kodunu biliyorsan yaz. Bilmiyorsan haritada tarlana dokun, kodun çıksın.', 'Type your code, or tap your field on the map to see it.')}
              </p>
            </>
          ) : (
            <>
              <Logo className="h-14 w-14" />
              <h1 className="mt-4 text-3xl font-bold tracking-tight text-stone-900">{t('Tarlanın sulama asistanı', 'Your field’s irrigation assistant')}</h1>
              <p className="mt-2 text-stone-600">{t('Tarla kodunla gir, bugün ne kadar sulayacağını gör.', 'Enter with your field code and see how much to irrigate today.')}</p>
            </>
          )}

          <form onSubmit={submit} className="mt-8">
            <label htmlFor="code" className="text-sm font-semibold text-stone-800">
              {t('Tarla kodu', 'Field code')}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="F03053"
                autoComplete="off"
                autoCapitalize="characters"
                className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-lg font-semibold tracking-wide outline-none placeholder:font-normal placeholder:text-stone-300 focus:border-emerald-700"
              />
              <button type="submit" className="inline-flex items-center gap-1.5 rounded-2xl bg-emerald-900 px-5 font-semibold text-white hover:bg-emerald-950">
                {t('Gir', 'Enter')} <ArrowRight size={18} />
              </button>
            </div>
          </form>

          {notice && (
            <div className="mt-4 rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
              {notice.text}
              {notice.planLink && (
                <a href="/planla" className="mt-1 block font-semibold underline">
                  {t('Tarlanı çizerek plan al →', 'Draw your field to get a plan (Turkish) →')}
                </a>
              )}
            </div>
          )}

          <button
            onClick={onLocate}
            disabled={locating}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 font-semibold text-stone-800 hover:bg-stone-50 disabled:opacity-60"
          >
            <LocateFixed size={19} className="text-emerald-800" />
            {locating ? t('Konum alınıyor…', 'Locating…') : t('Konumumla bul', 'Use my location')}
          </button>

          <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <button onClick={() => onPick(exampleId)} className="font-semibold text-emerald-800 hover:underline">
              {t('Örnek tarlayı aç', 'Open the example field')}
            </button>
            <a href="/planla" className="text-stone-500 hover:underline">
              {t('Pilot alanın dışında mısın? Tarlanı çiz', 'Outside the pilot area? Draw your field')}
            </a>
          </div>
        </div>
      </div>

      {/* Find your code on the map */}
      <div className="relative flex h-[70vh] shrink-0 flex-col p-3 lg:h-auto lg:flex-1 lg:pl-0">
        <div className="pointer-events-none absolute left-6 right-6 top-6 z-10 flex justify-center lg:left-3">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-4 py-2 text-sm font-semibold text-stone-800 shadow">
            <MousePointerClick size={16} className="text-emerald-800" /> {t('Kodunu öğren: haritada tarlana dokun', 'Find your code: tap your field on the map')}
          </span>
        </div>
        <FieldsMap
          season={season}
          scenario="s1"
          visibleIds={null}
          selected={picked}
          onSelect={(id) => setPicked(id ? (rows.get(id) ?? null) : null)}
          classNames={classNames}
          player={null}
          neutral
          className="h-full w-full overflow-hidden rounded-3xl"
        />
        {picked && (
          <div className="absolute bottom-6 left-6 right-6 z-10 mx-auto flex max-w-lg items-center justify-between gap-4 rounded-2xl bg-white p-4 shadow-lg lg:left-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-stone-500">{t('Tarla kodun', 'Your field code')}</p>
              <p className="text-2xl font-bold tracking-wide text-stone-900">{picked.field_id}</p>
              <p className="text-sm text-stone-500">{classNames[picked.class] ?? picked.class}</p>
            </div>
            <button
              onClick={() => onPick(picked.field_id)}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl bg-emerald-900 px-4 py-3 font-semibold text-white hover:bg-emerald-950"
            >
              {t('Bu tarla ile gir', 'Enter with this field')} <ArrowRight size={18} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

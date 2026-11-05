// Farmer app (/): pick your field on the map or by location, see this week's irrigation and your season.

import { LocateFixed, Search, Send, Sprout, SunMedium } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AppSwitch } from '../components/AppSwitch';
import { fmt } from '../components/ui';
import { lang, t } from '../i18n';
import FieldsMap from '../panel/FieldsMap';
import { loadFields, loadManifest, loadShapes, type Manifest } from '../panel/data';
import FieldCard, { FARMER_STATUS } from './FieldCard';
import { findFields, type PilotField } from './pilot';
import type { PilotManifest } from './weekPlan';

/**
 * "Örnek tarla": a 34-decare sugar beet field over its efficient-irrigation budget, small enough for the
 * assumed pump to irrigate on sunny hours in its demo week (a large field needs the pump day and night).
 */
const EXAMPLE_FIELD = 'F03053';

type Notice = { text: string; planLink?: boolean } | null;

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function Home({
  fields,
  locating,
  notice,
  onLocate,
  onExample,
  onSearch,
}: {
  fields: number;
  locating: boolean;
  notice: Notice;
  onLocate: () => void;
  onExample: () => void;
  onSearch: (id: string) => void;
}) {
  const [text, setText] = useState('');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (text.trim()) onSearch(text.trim());
  };
  return (
    <div className="space-y-6">
      <div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Karapınar · {fmt(fields)} {t('tarla uydudan izleniyor', 'fields monitored by satellite')}
        </span>
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-stone-900 sm:text-4xl">
          {t('Tarlanı seç,', 'Pick your field,')}
          <br />
          {t('ne zaman sulayacağını öğren.', 'learn when to irrigate.')}
        </h1>
        <p className="mt-3 text-stone-600">
          {t(
            'Uydu tarlanın ne kadar su kullandığını ölçer, plan güneşli saatlere göre hazırlanır.',
            'Satellites measure how much water your field uses; the plan follows the sunny hours.',
          )}
        </p>
      </div>

      <div className="space-y-2">
        <button
          onClick={onLocate}
          disabled={locating}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-900 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-emerald-950 disabled:opacity-70"
        >
          <LocateFixed size={20} /> {locating ? t('Konum alınıyor…', 'Getting location…') : t('Konumumla tarlamı bul', 'Find my field by location')}
        </button>
        <button
          onClick={onExample}
          className="w-full rounded-2xl border border-stone-200 bg-white px-4 py-3 text-base font-semibold text-stone-800 transition hover:border-stone-300 hover:bg-stone-50"
        >
          {t('Örnek tarlayı aç', 'Open the example field')}
        </button>
        <form onSubmit={submit} className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-3 py-2 focus-within:border-emerald-700">
          <Search size={18} className="text-stone-400" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t('Tarla numarası (ör. F03053)', 'Field number (e.g. F03053)')}
            className="min-w-0 flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-stone-400"
            aria-label={t('Tarla numarası', 'Field number')}
          />
        </form>
        <p className="text-center text-xs text-stone-500">{t('ya da haritada tarlana dokun', 'or tap your field on the map')}</p>
      </div>

      {notice && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-900">
          {notice.text}
          {notice.planLink && (
            <a href="/planla" className="mt-1 block font-semibold underline">
              {t('Tarlanı çizerek plan al →', 'Draw your field to get a plan (Turkish) →')}
            </a>
          )}
        </div>
      )}

      <ol className="grid grid-cols-3 gap-2 text-center text-xs text-stone-600">
        {[
          { Icon: Sprout, text: t('Tarlanı seç', 'Pick your field') },
          { Icon: SunMedium, text: t('Haftalık planı gör', 'See the weekly plan') },
          { Icon: Send, text: t("Telegram'dan al", 'Get it on Telegram') },
        ].map(({ Icon, text: label }, i) => (
          <li key={label} className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
            <Icon size={20} className="mx-auto text-emerald-800" />
            <span className="mt-1.5 block font-medium">
              {i + 1}. {label}
            </span>
          </li>
        ))}
      </ol>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-600">
        {(['within', 'borderline', 'over'] as const).map((s) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-sm ${FARMER_STATUS[s].dot}`} /> {FARMER_STATUS[s].label}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FarmerApp() {
  const [manifest, setManifest] = useState<(Manifest & PilotManifest) | null>(null);
  const [rows, setRows] = useState<PilotField[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(() => new URLSearchParams(window.location.search).get('field'));
  // Off-season sample week (?demo=1), kept while moving between fields
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    document.title = t('SunWater · Tarlam', 'SunWater · My field');
    loadManifest()
      .then(async (m) => {
        setManifest(m as Manifest & PilotManifest);
        setRows((await loadFields(m.seasons[0])) as PilotField[]);
      })
      .catch(() => setError(true));
  }, []);

  const season = manifest?.seasons[0] ?? 0;
  const byId = useMemo(() => new Map((rows ?? []).map((r) => [r.field_id, r])), [rows]);
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;

  const peerMedian = useMemo(() => {
    const byClass = new Map<string, number[]>();
    for (const r of rows ?? []) {
      if (!r.assessed || r.uncertain) continue;
      byClass.set(r.class, [...(byClass.get(r.class) ?? []), r.blue_mm]);
    }
    return new Map([...byClass].map(([c, xs]) => [c, median(xs)]));
  }, [rows]);

  // Keep the address shareable: /?field=F01234 (&demo=1&lang=en)
  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedId) params.set('field', selectedId);
    if (demo) params.set('demo', '1');
    if (lang === 'en') params.set('lang', 'en');
    const url = params.toString() ? `/?${params}` : '/';
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, '', url);
  }, [selectedId, demo]);

  useEffect(() => {
    setTelegramUrl(null);
    if (!selectedId) return;
    let live = true;
    fetch(`/api/telegram-link?field=${encodeURIComponent(selectedId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { startUrl?: string } | null) => live && setTelegramUrl(j?.startUrl ?? null))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [selectedId]);

  const select = (id: string | null) => {
    setNotice(null);
    setSelectedId(id);
  };

  const search = (text: string) => {
    const id = text.toUpperCase().replace(/^F?/, 'F');
    const padded = /^F\d+$/.test(id) ? `F${id.slice(1).padStart(5, '0')}` : id;
    if (byId.has(padded)) select(padded);
    else setNotice({ text: t(`${text} numaralı bir tarla bulamadık.`, `No field numbered ${text}.`) });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setNotice({
        text: t(
          'Tarayıcın konum paylaşmayı desteklemiyor. Haritada tarlana dokunabilirsin.',
          'Your browser cannot share its location. Tap your field on the map instead.',
        ),
      });
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const shapes = await loadShapes();
          const [id] = findFields(shapes, rows ?? [], coords.longitude, coords.latitude);
          if (id) select(id);
          else setNotice({ text: t('Bulunduğun yerde kayıtlı bir tarla yok.', 'There is no pilot field where you are.'), planLink: true });
        } catch {
          setNotice({ text: t('Tarlalar yüklenemedi, haritada tarlana dokunabilirsin.', 'Fields could not be loaded; tap your field on the map.') });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setNotice({ text: t('Konum alınamadı. Haritada tarlana dokunabilirsin.', 'Could not get your location. Tap your field on the map.') });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <AppSwitch current="/" />
      {error ? (
        <p className="p-6 text-stone-600">{t('Veriler yüklenemedi. Sayfayı yenileyin.', 'Data could not be loaded. Please reload the page.')}</p>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <aside className="order-2 overflow-y-auto p-5 lg:order-1 lg:w-[440px] lg:shrink-0 lg:p-6">
            {!manifest || !rows ? (
              <div className="space-y-3">
                <div className="h-6 w-1/2 animate-pulse rounded bg-stone-200" />
                <div className="h-24 animate-pulse rounded-2xl bg-stone-200" />
              </div>
            ) : selected ? (
              <FieldCard
                key={selected.field_id}
                field={selected}
                peerMedianMm={peerMedian.get(selected.class) ?? null}
                season={season}
                manifest={manifest}
                classNames={manifest.classes}
                telegramUrl={telegramUrl}
                demo={demo}
                onDemo={setDemo}
                onBack={() => select(null)}
              />
            ) : (
              <Home
                fields={rows.length}
                locating={locating}
                notice={notice}
                onLocate={locate}
                onExample={() => select(EXAMPLE_FIELD)}
                onSearch={search}
              />
            )}
          </aside>
          <div className="order-1 h-[42vh] shrink-0 p-2 lg:order-2 lg:h-auto lg:flex-1 lg:p-3 lg:pl-0">
            {manifest && (
              <FieldsMap
                season={season}
                scenario="s1"
                visibleIds={null}
                selected={selected}
                onSelect={select}
                classNames={manifest.classes}
                player={null}
                className="h-full w-full overflow-hidden rounded-2xl"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

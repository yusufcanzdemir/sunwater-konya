// Farmer app (/): enter with your field (code, location or map), then a simple home screen for that field.
// The chosen field is remembered in the browser, so the next visit opens the home screen directly.
// This is a convenience, not an account: field codes are not secret.

import { useEffect, useMemo, useState } from 'react';
import { AppSwitch } from '../components/AppSwitch';
import { lang, t } from '../i18n';
import { loadFields, loadManifest, loadShapes, type Manifest } from '../panel/data';
import FieldCard from './FieldCard';
import Landing from './Landing';
import Login, { normaliseCode, type Notice } from './Login';
import { findFields, type FieldShapes, type PilotField } from './pilot';
import type { PilotManifest } from './weekPlan';

/**
 * "Örnek tarla": a 34-decare sugar beet field over its efficient-irrigation budget, small enough for the
 * assumed pump to irrigate on sunny hours in its demo week (a large field needs the pump day and night).
 */
const EXAMPLE_FIELD = 'F03053';
const FIELD_KEY = 'sunwater.field';

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

function rememberedField(): string | null {
  const fromUrl = new URLSearchParams(window.location.search).get('field');
  if (fromUrl) return fromUrl;
  try {
    return window.localStorage.getItem(FIELD_KEY);
  } catch {
    return null;
  }
}

function remember(id: string | null) {
  try {
    if (id) window.localStorage.setItem(FIELD_KEY, id);
    else window.localStorage.removeItem(FIELD_KEY);
  } catch {
    // private mode: the field stays in the address instead
  }
}

export default function FarmerApp() {
  const [manifest, setManifest] = useState<(Manifest & PilotManifest) | null>(null);
  const [rows, setRows] = useState<PilotField[] | null>(null);
  const [shapes, setShapes] = useState<FieldShapes | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(rememberedField);
  // Off-season sample week (?demo=1), kept while moving between fields
  const [demo, setDemo] = useState(() => new URLSearchParams(window.location.search).get('demo') === '1');
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  /** The bot itself (product page "Telegram'dan başla"); null when the bot is not configured. */
  const [botUrl, setBotUrl] = useState<string | null>(null);
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

  // A valid field is remembered however it was opened (code, map, or a /?field= link from Telegram);
  // a remembered or linked code that is not a pilot field goes back to the entry screen
  useEffect(() => {
    if (!rows || !selectedId) return;
    if (byId.has(selectedId)) {
      remember(selectedId);
      return;
    }
    setNotice({ text: t(`${selectedId} numaralı bir tarla bulamadık.`, `No field numbered ${selectedId}.`) });
    setSelectedId(null);
    remember(null);
  }, [rows, selectedId, byId]);

  // The outline for the field photo (and for "Konumumla bul")
  useEffect(() => {
    if (selected && !shapes) loadShapes().then(setShapes, () => undefined);
  }, [selected, shapes]);

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

  useEffect(() => {
    fetch(`/api/telegram-link?field=${EXAMPLE_FIELD}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { botUsername?: string } | null) => setBotUrl(j?.botUsername ? `https://t.me/${j.botUsername}` : null))
      .catch(() => undefined);
  }, []);

  const enter = (id: string) => {
    setNotice(null);
    setSelectedId(id);
    remember(id);
  };

  const leave = () => {
    setSelectedId(null);
    remember(null);
  };

  const enterCode = (text: string) => {
    const id = normaliseCode(text);
    if (byId.has(id)) enter(id);
    else setNotice({ text: t(`${text.trim()} numaralı bir tarla bulamadık.`, `No field numbered ${text.trim()}.`) });
  };

  const locate = () => {
    if (!navigator.geolocation) {
      setNotice({ text: t('Tarayıcın konum paylaşmayı desteklemiyor. Haritadan seçebilirsin.', 'Your browser cannot share its location. Pick on the map instead.') });
      return;
    }
    setLocating(true);
    setNotice(null);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const all = shapes ?? (await loadShapes());
          setShapes(all);
          const [id] = findFields(all, rows ?? [], coords.longitude, coords.latitude);
          if (id) enter(id);
          else setNotice({ text: t('Bulunduğun yerde kayıtlı bir tarla yok.', 'There is no pilot field where you are.'), planLink: true });
        } catch {
          setNotice({ text: t('Tarlalar yüklenemedi, haritadan seçebilirsin.', 'Fields could not be loaded; pick on the map.') });
        } finally {
          setLocating(false);
        }
      },
      () => {
        setLocating(false);
        setNotice({ text: t('Konum alınamadı. Haritadan seçebilirsin.', 'Could not get your location. Pick on the map.') });
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const loading = !manifest || !rows;

  return (
    <div className="flex h-dvh flex-col bg-stone-50">
      <AppSwitch current="/">
        {!selected && (
          <button
            onClick={() => document.getElementById('tarlan')?.scrollIntoView({ behavior: 'smooth' })}
            className="rounded-full bg-emerald-900 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-950"
          >
            {t('Tarlama gir', 'Open my field')}
          </button>
        )}
        {selected && (
          <button
            onClick={leave}
            className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
          >
            {t('Tarla değiştir', 'Change field')}
          </button>
        )}
      </AppSwitch>
      {error ? (
        <p className="p-6 text-stone-600">{t('Veriler yüklenemedi. Sayfayı yenileyin.', 'Data could not be loaded. Please reload the page.')}</p>
      ) : loading ? (
        <div className="mx-auto w-full max-w-md space-y-3 p-5">
          <div className="aspect-square animate-pulse rounded-3xl bg-stone-200" />
          <div className="h-24 animate-pulse rounded-2xl bg-stone-200" />
        </div>
      ) : selected ? (
        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-6xl px-4 py-5 lg:px-6">
            <FieldCard
              key={selected.field_id}
              field={selected}
              rings={shapes?.[selected.field_id] ?? null}
              peerMedianMm={peerMedian.get(selected.class) ?? null}
              season={season}
              manifest={manifest}
              classNames={manifest.classes}
              telegramUrl={telegramUrl}
              demo={demo}
              onDemo={setDemo}
            />
          </div>
        </main>
      ) : (
        <Landing botUrl={botUrl}>
          <Login
            embedded
          season={season}
          rows={byId}
          classNames={manifest.classes}
          notice={notice}
          locating={locating}
          onCode={enterCode}
          onLocate={locate}
          onPick={enter}
          exampleId={EXAMPLE_FIELD}
          />
        </Landing>
      )}
    </div>
  );
}

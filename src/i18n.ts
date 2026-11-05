// UI language of the farmer app (/) and the institutional panel (/panel): Turkish by default, English
// for international visitors (?lang=en, remembered in localStorage). Switching reloads the page, so a
// module constant is enough. The field planner (/planla), the Telegram bot and the API stay Turkish.

export type Lang = 'tr' | 'en';

const KEY = 'sunwater.lang';

/** The browser globals used here; undefined on the server (the API imports this through panel/query). */
interface BrowserLike {
  location: { pathname: string; search: string; href: string };
  localStorage: { getItem(key: string): string | null; setItem(key: string, value: string): void };
}
const browser = (globalThis as { window?: BrowserLike }).window;

function initialLang(): Lang {
  if (!browser || browser.location.pathname.startsWith('/planla')) return 'tr';
  const param = new URLSearchParams(browser.location.search).get('lang');
  try {
    if (param === 'en' || param === 'tr') browser.localStorage.setItem(KEY, param);
    return (param ?? browser.localStorage.getItem(KEY)) === 'en' ? 'en' : 'tr';
  } catch {
    return param === 'en' ? 'en' : 'tr';
  }
}

export const lang: Lang = initialLang();
export const locale = lang === 'en' ? 'en-US' : 'tr-TR';

/** The Turkish or the English text, by the current language. */
export const t = (tr: string, en: string) => (lang === 'en' ? en : tr);

/** "%18" in Turkish, "18%" in English. */
export const pc = (n: string) => (lang === 'en' ? `${n}%` : `%${n}`);

export function setLang(next: Lang) {
  if (!browser) return;
  try {
    browser.localStorage.setItem(KEY, next);
  } catch {
    // the URL parameter below still carries the choice
  }
  const url = new URL(browser.location.href);
  url.searchParams.set('lang', next);
  browser.location.href = url.toString();
}

const CLASS_NAMES_EN: Record<string, string> = {
  sugar_beet: 'Sugar beet',
  maize: 'Maize',
  sunflower: 'Sunflower',
  alfalfa: 'Alfalfa',
  irrigated_winter_cereal: 'Irrigated winter cereal',
  rainfed_winter_cereal: 'Rainfed winter cereal',
  cereal_second_crop: 'Cereal + second crop',
  fallow: 'Fallow',
  other: 'Other',
};

/** Crop class names from manifest.json (Turkish) in the current language. */
export const localClassNames = (names: Record<string, string>): Record<string, string> =>
  lang === 'en' ? Object.fromEntries(Object.keys(names).map((k) => [k, CLASS_NAMES_EN[k] ?? names[k]])) : names;

const MONTHS_TR = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2025-07-14" → "14 Tem" / "14 Jul". */
export const monthDay = (iso: string) => `${Number(iso.slice(8, 10))} ${(lang === 'en' ? MONTHS_EN : MONTHS_TR)[Number(iso.slice(5, 7)) - 1]}`;

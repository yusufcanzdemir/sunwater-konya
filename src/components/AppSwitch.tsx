// Product top bar shared by the farmer app (/), the field planner (/planla) and the institutional panel
// (/panel, reachable by its address only).

import type { ReactNode } from 'react';
import { lang, setLang, t } from '../i18n';

export type Page = '/' | '/planla' | '/panel';

const PAGES: { href: Page; label: string }[] = [
  { href: '/', label: t('Tarlam', 'My field') },
  { href: '/planla', label: t('Tarla çiz', 'Draw a field (TR)') },
  { href: '/panel', label: t('Kurumlar için', 'For institutions') },
];

export function Logo({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#14532d" />
      <circle cx="16" cy="11.5" r="5" fill="#fbbf24" />
      <path d="M16 15.5c-3.6 4.4-5.4 6.4-5.4 8.3a5.4 5.4 0 0 0 10.8 0c0-1.9-1.8-3.9-5.4-8.3z" fill="#7dd3fc" />
    </svg>
  );
}

export function AppSwitch({ current, children }: { current: Page; children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-20 border-b border-black/5 bg-white/90 backdrop-blur">
      <div className="mx-auto flex min-h-14 max-w-screen-2xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <a href="/" className="flex items-center gap-2" aria-label={t('SunWater ana sayfa', 'SunWater home')}>
          <Logo />
          <span className="hidden text-lg font-bold tracking-tight text-emerald-950 sm:inline">SunWater</span>
        </a>
        <nav aria-label={t('Sayfalar', 'Pages')} className="flex items-center gap-1 text-sm">
          {/* The product is for farmers: the institutional panel stays at /panel but is not in the menu */}
          {PAGES.filter((p) => p.href !== '/panel' || current === '/panel').map(({ href, label }) => (
            <a
              key={href}
              href={href}
              aria-current={href === current ? 'page' : undefined}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 font-medium transition ${
                href === current ? 'bg-emerald-950 text-white' : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
              }`}
            >
              {label}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {children}
          {current !== '/planla' && (
            <button
              onClick={() => setLang(lang === 'en' ? 'tr' : 'en')}
              className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm font-semibold text-stone-700 hover:bg-stone-100"
              aria-label={t('Switch to English', 'Türkçeye geç')}
            >
              {lang === 'en' ? 'TR' : 'EN'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

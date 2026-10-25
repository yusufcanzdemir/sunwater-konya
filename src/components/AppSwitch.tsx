// Two-way switch between the farmer planner (/) and the institutional panel (/panel), in both headers.

import { LayoutDashboard, Sprout } from 'lucide-react';

const PAGES = [
  { href: '/', label: 'Çiftçi planlayıcı', Icon: Sprout },
  { href: '/panel', label: 'Kurum paneli', Icon: LayoutDashboard },
] as const;

export function AppSwitch({ current }: { current: '/' | '/panel' }) {
  return (
    <nav aria-label="Uygulama" className="inline-flex rounded-lg border border-soil-300 bg-soil-50 p-0.5 text-sm">
      {PAGES.map(({ href, label, Icon }) => {
        const active = href === current;
        return (
          <a
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-medium transition ${
              active ? 'bg-white text-soil-900 shadow-sm' : 'text-soil-600 hover:text-soil-900'
            }`}
          >
            <Icon size={15} aria-hidden />
            {label}
          </a>
        );
      })}
    </nav>
  );
}

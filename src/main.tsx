import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { lang } from './i18n.ts';
import './index.css';
import FarmerApp from './farmer/FarmerApp.tsx';

// Field planner and institutional panel, served in production too (vercel.json rewrites).
const App = lazy(() => import('./App.tsx'));
const PanelApp = lazy(() => import('./panel/PanelApp.tsx'));
// Dev-only tool pages (need `npm run dev` for their /dev-api backend).
const ReferenceTool = lazy(() => import('./reference/ReferenceTool.tsx'));
const LabelTool = lazy(() => import('./label/LabelTool.tsx'));
const CheckTool = lazy(() => import('./label/CheckTool.tsx'));

const TOOLS: Record<string, ReactNode> = {
  '/planla': <App />,
  '/panel': <PanelApp />,
  '/reference': <ReferenceTool />,
  '/label': <LabelTool />,
  '/check': <CheckTool />,
};
const page = TOOLS[window.location.pathname.replace(/\/$/, '') || '/'] ?? <FarmerApp />;

document.documentElement.lang = lang;

// Opened from the bot's "Tarlamı aç" button (Telegram Mini App): Telegram adds #tgWebAppData… to the
// address. Only then is Telegram's script loaded, to open the page full height.
if (window.location.hash.includes('tgWebApp')) {
  const script = document.createElement('script');
  script.src = 'https://telegram.org/js/telegram-web-app.js';
  script.onload = () => {
    const app = (window as { Telegram?: { WebApp?: { ready(): void; expand(): void } } }).Telegram?.WebApp;
    app?.ready();
    app?.expand();
  };
  document.head.append(script);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
  </StrictMode>,
);

import { StrictMode, Suspense, lazy, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Institutional panel (stage 13), served in production too (vercel.json rewrite).
const PanelApp = lazy(() => import('./panel/PanelApp.tsx'));
// Dev-only tool pages (need `npm run dev` for their /dev-api backend).
const ReferenceTool = lazy(() => import('./reference/ReferenceTool.tsx'));
const LabelTool = lazy(() => import('./label/LabelTool.tsx'));
const CheckTool = lazy(() => import('./label/CheckTool.tsx'));

const TOOLS: Record<string, ReactNode> = {
  '/panel': <PanelApp />,
  '/reference': <ReferenceTool />,
  '/label': <LabelTool />,
  '/check': <CheckTool />,
};
const page = TOOLS[window.location.pathname] ?? <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
  </StrictMode>,
);

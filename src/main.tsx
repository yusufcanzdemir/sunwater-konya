import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';

// Dev-only tool pages (need `npm run dev` for their /dev-api backend).
const ReferenceTool = lazy(() => import('./reference/ReferenceTool.tsx'));

const page = window.location.pathname === '/reference' ? <ReferenceTool /> : <App />;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={null}>{page}</Suspense>
  </StrictMode>,
);

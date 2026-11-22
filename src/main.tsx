import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/app.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);

// PWA: register the service worker (production builds only) and hand it the files already loaded,
// so the whole app shell is available offline after the first visit.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      await navigator.serviceWorker.ready;
      const urls = [location.href.split('#')[0], ...performance.getEntriesByType('resource').map(e => e.name)]
        .filter(u => u.startsWith(location.origin) || u.includes('fonts.g'));
      (reg.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'CACHE_URLS', urls });
    } catch (e) {
      console.warn('Service worker no registrado', e);
    }
  });
}

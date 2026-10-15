import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './v21/App';
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
if (import.meta.env.PROD && 'serviceWorker' in navigator)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* App remains usable without offline support. */
    });
  });
// A page left open across a new release keeps running old code (old share text, old screens). When the owner comes back to the app, reload if a newer build exists.
if (import.meta.env.PROD) {
  const loaded = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/"]')?.getAttribute('src');
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !loaded) return;
    void fetch('/', { cache: 'no-store' }).then(r => r.text()).then(html => {
      const current = /<script[^>]+type="module"[^>]+src="(\/assets\/[^"]+)"/.exec(html)?.[1];
      if (current && current !== loaded) window.location.reload();
    }).catch(() => { /* offline: keep running */ });
  });
}

/* Family Trip Adventure — service worker (offline support).
 * - App shell & itinerary: cached; network-first for HTML/trip.json so edits deploy, cache fallback offline.
 * - Static assets (hashed JS/CSS, icons, fonts): cache-first.
 * - Map tiles/styles: stale-while-revalidate in a bounded cache (areas already viewed work offline).
 * - Routing / geocoding / weather APIs: never cached (always real-time or "unavailable").
 */
const VERSION = 'fta-v2';
// Dev/preview servers may send "Vary: Origin"; module scripts carry an Origin header, so ignore Vary when matching.
const MATCH = { ignoreVary: true, ignoreSearch: false };
const SHELL = `${VERSION}-shell`;
const TILES = `${VERSION}-tiles`;
const MAX_TILES = 1500;
const CORE = ['./', './index.html', './data/trip.json', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => {
  if (e.data?.type === 'CACHE_URLS') {
    caches.open(SHELL).then(async c => {
      // drop hashed assets from previous builds
      const keep = new Set(e.data.urls);
      for (const k of await c.keys()) if (k.url.includes('/assets/') && !keep.has(k.url) && !k.url.includes('MapView') && !k.url.includes('worker')) await c.delete(k);
      return c;
    }).then(c => Promise.all(e.data.urls.map(u => c.match(u).then(hit => hit || fetch(u, { mode: u.startsWith(self.location.origin) ? 'same-origin' : 'cors' }).then(r => r.ok && c.put(u, r)).catch(() => {})))));
  }
});

const NO_CACHE = /routing\.openstreetmap\.de|router\.project-osrm|nominatim\.openstreetmap|api\.open-meteo\.com/;
const TILE_HOSTS = /tiles\.openfreemap\.org|tile\.openstreetmap\.org/;

async function trimTiles() {
  const c = await caches.open(TILES); const keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]);
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (NO_CACHE.test(url.host)) return;

  if (TILE_HOSTS.test(url.host)) {
    e.respondWith(caches.open(TILES).then(async c => {
      const hit = await c.match(req, MATCH);
      const net = fetch(req).then(r => { if (r.ok) { c.put(req, r.clone()); trimTiles(); } return r; }).catch(() => hit);
      return hit || net;
    }));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('/trip.json') || url.pathname.endsWith('.webmanifest');
  if (sameOrigin && isDoc) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(SHELL).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req, MATCH).then(h => h || caches.match('./index.html', MATCH)).then(h => h || caches.match('./', MATCH))));
    return;
  }
  if (sameOrigin || /fonts\.(googleapis|gstatic)\.com/.test(url.host)) {
    e.respondWith(caches.match(req, MATCH).then(hit => hit || fetch(req).then(r => {
      if (r.ok || r.type === 'opaque') { const cp = r.clone(); caches.open(SHELL).then(c => c.put(req, cp)); }
      return r;
    })));
  }
});

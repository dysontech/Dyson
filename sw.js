/* DYSON service worker: offline app shell. Network-first for pages/scripts so updates arrive, cache fallback offline.
   Never touches Supabase, Google Fonts or other cross-origin requests. */
const CACHE = 'dyson-9-shell';
const SHELL = ['app.html', 'start.html', 'index.html', 'style.css', 'views.css', 'core.js', 'i18n.js', 'icons.svg', 'icon.png', 'icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL).catch(() => {})).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(r, copy)); } return res; }).catch(() => caches.match(r).then((m) => m || (r.mode === 'navigate' ? caches.match('app.html') : Response.error()))));
});

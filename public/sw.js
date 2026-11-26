// Offline cache: the app shell is cached on install, art as it is first seen (and in the background on first run).
const CACHE = 'nightbreaker-v2';
const SHELL = ['./', 'index.html', 'style.css', 'app.mjs', 'data.mjs', 'tutorial.mjs', 'manifest.webmanifest', 'icon-192.png', 'icon-180.png',
  'engine/game.mjs', 'engine/session.mjs', 'engine/util.mjs'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', (e) => {
  if (!e.data || !e.data.precache) return;
  e.waitUntil(caches.open(CACHE).then(async (c) => { for (const u of e.data.precache) { if (!(await c.match(u))) { try { await c.add(u); } catch (err) { /* offline: try again next launch */ } } } }));
});
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const isArt = /\/img\//.test(e.request.url);
  e.respondWith(caches.open(CACHE).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit && isArt) return hit;
    try { const res = await fetch(e.request); if (res.ok) c.put(e.request, res.clone()); return res; } catch (err) { if (hit) return hit; throw err; }
  }));
});

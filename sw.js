/* LearningGPT service worker.
   Freshness first: the site ships new lessons daily, so HTML is ALWAYS network-first
   (cache only as an offline fallback). Static assets use stale-while-revalidate.
   /api/ is never cached. Bump VERSION to force-refresh old caches. */
const VERSION = 'lgpt-v1';
const OFFLINE_URL = '/';

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll([OFFLINE_URL, '/icon-192.png'])));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;
  if (url.origin !== location.origin) return;            // never touch third parties
  if (url.pathname.startsWith('/api/')) return;          // never cache the API

  if (e.request.mode === 'navigate') {
    // Pages: network first (fresh lessons), cached copy if offline.
    e.respondWith(
      fetch(e.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(e.request, copy));
          return res;
        })
        .catch(() => caches.match(e.request).then((hit) => hit || caches.match(OFFLINE_URL)))
    );
    return;
  }

  // Assets (js/css/img): stale-while-revalidate.
  e.respondWith(
    caches.match(e.request).then((hit) => {
      const refresh = fetch(e.request)
        .then((res) => {
          if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});

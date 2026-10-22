// AnonChat service worker (ADR-0010, ticket 23).
// Caches the application shell for instant/offline opens. ALL /api traffic
// is network-only — the relay is never served from cache, so message data
// is always live and never persisted by the worker.
// Bump on visual/static changes so cached clients pick up the new shell.
const SHELL_CACHE = 'anonchat-shell-v2';
const SHELL_ASSETS = ['/', '/manifest.json', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // The relay API is never cached — network only, always.
  if (url.pathname.startsWith('/api/')) {
    return; // let the browser handle it (default network fetch)
  }

  // Cache-first for same-origin static assets (Next.js immutable chunks, icons).
  if (
    event.request.method === 'GET' &&
    url.origin === self.location.origin &&
    (url.pathname.startsWith('/_next/static/') || url.pathname === '/icon-512.png')
  ) {
    event.respondWith(
      caches.match(event.request).then(
        (hit) =>
          hit ||
          fetch(event.request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // Network-first for navigations with a cached-shell fallback (offline open).
  if (event.request.method === 'GET' && event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put('/', copy));
          return response;
        })
        .catch(() => caches.match('/')),
    );
  }
});

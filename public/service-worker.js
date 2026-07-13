// Service worker — cache offline básico do app shell.
// Estratégia: cache-first pra assets estáticos, network-first pra HTML.

const CACHE_NAME = 'frota-app-v1';

const PRECACHE = [
  '/',
  '/login.html',
  '/register.html',
  '/instalar.html',
  '/manifest.json',
  '/css/design-system.css',
  '/css/components.css',
  '/assets/icons/icon-192.png',
  '/assets/icons/icon-512.png',
  '/assets/images/car-diagram.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Nunca interceptar Firebase/CDN — só same-origin GET
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;

  const isHTML = event.request.mode === 'navigate' || url.pathname.endsWith('.html');

  if (isHTML) {
    // network-first: HTML sempre fresco, cache como fallback offline
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // cache-first: css/js/imagens
    event.respondWith(
      caches.match(event.request).then(
        (cached) =>
          cached ||
          fetch(event.request).then((res) => {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
            return res;
          })
      )
    );
  }
});

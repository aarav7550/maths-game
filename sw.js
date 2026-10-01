// Bump this version string whenever you deploy changes so old caches get replaced.
const CACHE_VERSION = 'numbers-v29';
const CACHE_NAME = `numbers-cache-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/storage.js',
  './js/skills.js',
  './js/popups.js',
  './js/game.js',
  './js/trendchart.js',
  './js/greetings.js',
  './js/ui.js',
  './js/history.js',
  './js/challenge.js',
  './js/entercode.js',
  './js/challengedetails.js',
  './js/info.js',
  './js/nav.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  // Cache each file separately so one missing icon can't make the whole install fail.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(url).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('numbers-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Network-first for EVERYTHING on this site: when online, every device always gets the newest
// deployed files (this is what keeps phone and laptop in step); the cache is only the offline fallback.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request, { cache: 'no-cache' })
      .then((response) => {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || (request.mode === 'navigate' ? caches.match('./index.html') : undefined))
      )
  );
});

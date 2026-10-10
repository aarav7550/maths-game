// Bump this version string whenever you deploy changes so devices notice a new version.
const CACHE_VERSION = 'numbers-v60';
const CACHE_NAME = `numbers-cache-${CACHE_VERSION}`;

const ASSETS = [
  './',
  './index.html',
  './style.css',
  './js/registry.js',
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
  './js/keys.js',
  './manifest.json',
  './fonts/inter-latin-wght-normal.woff2',
  './fonts/sora-latin-wght-normal.woff2',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png'
];

// INSTALL: download the whole new version into its own cache, straight from the server
// (cache:'reload' skips the browser's HTTP cache so we never save stale copies).
// We do NOT call skipWaiting() here: a new version waits quietly until the user taps
// "Refresh" on the update message, so the app never switches versions mid-use.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => {})))
    )
  );
});

// ACTIVATE: delete caches from older versions and take control of open pages.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key.startsWith('numbers-cache-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// The page sends this when the user taps "Refresh" on the update message.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// FETCH: cache-first. Files come from this version's saved copy (instant, works offline);
// anything not saved yet is fetched from the network and saved for next time.
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      const isPage = request.mode === 'navigate';
      return cache.match(request, { ignoreSearch: isPage }).then((cached) => {
        if (cached) return cached;
        if (isPage) {
          return cache.match('./index.html').then((page) => page || fetch(request));
        }
        return fetch(request).then((response) => {
          if (response && response.ok) cache.put(request, response.clone());
          return response;
        });
      });
    })
  );
});
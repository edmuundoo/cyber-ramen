const CACHE_NAME = 'cyber-ramen-v105';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
  './css/main.css',
  './css/sectors.css',
  './js/config.js',
  './js/state.js',
  './js/audio.js',
  './js/renderer.js',
  './js/art3d.js',
  './js/webgl3d.js',
  './js/kitchen.js',
  './js/customers.js',
  './js/economy.js',
  './js/tutorial.js',
  './js/main.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(event.request))
  );
});

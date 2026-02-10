const CACHE_NAME = 'nexstream-v15';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/formats.html',
  '/logo.webp',
  '/og-image.webp',
  '/manifest.json'
];

// Install Event: Cache static assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Activate Event: CLEAN PURGE OF EVERYTHING OLD
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          console.log('Nuclear Purge: Clearing old cache', cache);
          return caches.delete(cache);
        })
      );
    })
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // CRITICAL: COMPLETELY BYPASS Service Worker for Backend/SSE routes
  // By NOT calling event.respondWith(), we allow the browser to handle the request natively.
  // This is essential for SSE and large streams which SWs often fail to proxy correctly.
  if (
    url.pathname.includes('/events') ||
    url.pathname.includes('/info') ||
    url.pathname.includes('/convert') ||
    url.pathname.startsWith('/api') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Network First strategy for HTML/Routes to ensure latest version
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache First strategy for static assets (images, etc)
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
          return networkResponse;
        }
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseToCache);
        });
        return networkResponse;
      });
    })
  );
});
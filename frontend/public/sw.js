const CACHE_NAME = "nexstream-v15";
const ASSETS_TO_CACHE = [
  "/",
  "/index.html",
  "/formats.html",
  "/logo.webp",
  "/og-image.webp",
  "/manifest.json",
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          console.log("Nuclear Purge: Clearing old cache", cache);
          return caches.delete(cache);
        }),
      );
    }),
  );
  self.clients.claim();
});

// Fetch Event
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  if (
    url.pathname.includes("/events") ||
    url.pathname.includes("/info") ||
    url.pathname.includes("/convert") ||
    url.pathname.startsWith("/api") ||
    event.request.method !== "GET"
  ) {
    return;
  }

  if (
    event.request.mode === "navigate" ||
    url.pathname.endsWith(".html") ||
    url.pathname === "/"
  ) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            (networkResponse.type === "basic" || networkResponse.type === "cors")
          ) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch((error) => {
          console.error("SW fetch failed:", error);
          // Return a fallback or just let it fail
          return caches.match(event.request);
        });
    }),
  );
});

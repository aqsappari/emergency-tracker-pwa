const CACHE_NAME = "evac-routing-cache-v1";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./js/app.js",
  "./js/map.js",
  "./js/routing.js",
  "./export.geojson", // This ensures your road network is stored in the browser cache!
  // Add your CSS or icon paths here if needed
];

// Install Event: Cache all essential assets in the browser
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

// Activate Event: Clean up old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      );
    }),
  );
  self.clients.claim();
});

// Fetch Event: Serve from browser cache first, fallback to network
self.addEventListener("fetch", (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse; // Found in browser storage!
      }
      return fetch(event.request)
        .then((networkResponse) => {
          // Dynamically cache new requests (like map tiles)
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
            return networkResponse;
          });
        })
        .catch(() => {
          // Fallback behavior if offline and asset isn't cached
        });
    }),
  );
});

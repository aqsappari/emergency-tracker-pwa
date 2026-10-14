const CACHE_NAME = "gabaylink-navigator-v2";
const ASSETS_TO_CACHE = [
  "./index.html",
  "./manifest.json",
  "./evacuation_centers.json",
  "./js/constants.js",
  "./js/map.js",
  "./js/routing.js",
  "./js/app.js",
  "https://cdn.tailwindcss.com",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
  "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css",
  "https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Runtime caching for map tiles (Carto / OSM)
  if (
    url.origin.includes("basemaps.cartocdn.com") ||
    url.origin.includes("openstreetmap.org")
  ) {
    event.respondWith(
      caches.open("gabaylink-tiles-cache").then((cache) => {
        return cache.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          return fetch(event.request)
            .then((networkResponse) => {
              cache.put(event.request, networkResponse.clone());
              return networkResponse;
            })
            .catch(() => {
              return new Response("", {
                status: 404,
                statusText: "Offline tile unavailable",
              });
            });
        });
      }),
    );
    return;
  }

  // Standard cache-first strategy for app assets
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(event.request).catch(() => {});
    }),
  );
});

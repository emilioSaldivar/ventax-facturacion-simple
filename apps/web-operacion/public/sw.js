// __CACHE_VERSION__ es reemplazado en build time (ver infra/docker/frontend.Dockerfile)
// con el commit sha, para que el archivo cambie de bytes en cada deploy y el navegador
// detecte y active un service worker nuevo.
const CACHE_VERSION = "__CACHE_VERSION__";
const CACHE_NAME = `ventax-operacion-static-${CACHE_VERSION}`;
const STATIC_ASSETS = [
  "/app/manifest.webmanifest",
  "/app/icons/ventax-icon.svg",
  "/app/icons/ventax-maskable.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) {
    return;
  }

  // App shell / navegacion: siempre preferir la red para que un deploy nuevo se refleje
  // de inmediato; el cache solo se usa como respaldo si no hay conexion.
  if (request.mode === "navigate" || url.pathname === "/app/" || url.pathname === "/app/index.html") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  if (url.pathname.startsWith("/app/assets/") || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) {
          return cached;
        }

        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});

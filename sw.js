/* Versioned complete shell. Never writes or removes localStorage/financial data. */
const CACHE_NAME = "coachcontrol-shell-v5";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./finance.js",
  "./data-store.js",
  "./financial-ui.js",
  "./mobile-ui.js",
  "./mobile-ui.css",
  "./icons/app-icon.svg",
  "./icons/icon-180.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];
const shellURLs = new Set(
  ASSETS.map((path) => new URL(path, self.location).href),
);
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(ASSETS);
    })(),
  );
  // No skipWaiting: an update waits for old tabs to close, avoiding mixed UI versions.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("coachcontrol-shell-") && key !== CACHE_NAME,
          )
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin)
    return;
  if (!shellURLs.has(req.url) && req.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(
        req.mode === "navigate"
          ? new URL("./index.html", self.location).href
          : req.url,
      );
      if (cached) return cached;
      return fetch(req); // No catch-all API/runtime cache; preserve error status and TLS.
    })(),
  );
});

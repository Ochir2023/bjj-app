const CACHE_NAME='bjj-cache-v1';
const FILES_TO_CACHE=['index.html','app.js','manifest.json','style.css','icon-192.png','icon-512.png'];

self.addEventListener('install',e=>{ e.waitUntil(caches.open(CACHE_NAME).then(cache=>cache.addAll(FILES_TO_CACHE))); self.skipWaiting(); });
self.addEventListener('activate',e=>{ e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch',e=>{ e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request))); });

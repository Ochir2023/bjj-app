const CACHE_NAME = 'pwa-cache-v4';

self.addEventListener('install', e=>{
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache=>{
      return cache.addAll([
        '/',
        '/index.html',
        '/app.js',
        '/style.css'
      ]);
    })
  );
});

self.addEventListener('activate', e=>{
  e.waitUntil(
    caches.keys().then(keys=>{
      return Promise.all(
        keys.filter(k=>k!==CACHE_NAME)
            .map(k=>caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

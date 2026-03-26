const CACHE_NAME = 'notejust-cache-v6';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './main.js',
  './db.js',
  './ui.js',
  './editor.js',
  './image-handler.js',
  './manifest.json',
  './favicon.png',
  './logo.png'
];

// Kurulum (Install) - Kaynakları önbelleğe al
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Service Worker: Önbelleğe alınıyor...');
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// Fetch - İstekleri yakala ve önbellekten sun (Stale-while-revalidate veya Network-first)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // Önbellekte varsa döndür, yoksa ağdan çek
      return response || fetch(event.request);
    })
  );
});

// Aktivasyon (Activate) - Eski önbellekleri temizle
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Eski önbellek temizleniyor...');
            return caches.delete(cache);
          }
        })
      );
    })
  );
});

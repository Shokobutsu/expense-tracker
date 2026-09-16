const CACHE_NAME = 'expense-tracker-v9';
const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './js/qrcode.min.js',
  './js/storage.js',
  './js/charts.js',
  './js/app.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// Install Event: pre-cache static assets and activate immediately
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Pre-caching v9 offline assets');
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate Event: purge stale caches and claim clients
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging outdated cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
      .then(() => {
        // Broadcast update notification to clients
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'NEW_VERSION', version: '2.1' });
          });
        });
      })
  );
});

// Fetch Event:
// 1. /api/ calls: Network first with offline JSON error fallback
// 2. Code assets (.html, .js, .css, navigate): Network First with Cache Fallback for instant updates
// 3. Static binary assets (images, icons, fonts): Cache First with Background Update
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // If calling API, try network first
  if (url.pathname.includes('/api/')) {
    event.respondWith(
      fetch(event.request).catch(() => {
        return new Response(JSON.stringify({ error: 'Device is offline or server unavailable' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      })
    );
    return;
  }

  // Code Assets: Network First with Cache Fallback
  const isCodeAsset = event.request.mode === 'navigate' ||
    url.pathname.endsWith('.html') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.includes('?v=');

  if (isCodeAsset) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
          });
        })
    );
    return;
  }

  // Binary / Media Assets: Cache First with Network Revalidation
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(() => null);

      return cachedResponse || fetchPromise;
    })
  );
});

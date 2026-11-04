/**
 * Service Worker: SATYA Workforce Management
 * Cache Name: satya-workforce-v1
 * Scope: Strictly isolated static caching and Web Push RFC handler.
 * DILARANG KERAS CACHE: /api/, /auth/, geolokasi, dan data presensi.
 */

const CACHE_NAME = 'satya-workforce-v1';

// Static assets to precache on install
const PRECACHE_ASSETS = [
  '/',
  '/workforce.webmanifest',
  '/icons/workforce-192.png',
  '/icons/workforce-512.png',
  '/icons/workforce-maskable-512.png',
];

// 1. INSTALL LIFECYCLE
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW-Workforce] Precache failed, continuing install:', err);
      });
    }).then(() => self.skipWaiting())
  );
});

// 2. ACTIVATE LIFECYCLE
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith('satya-workforce-')) {
            console.log('[SW-Workforce] Removing outdated cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. FETCH HANDLER: STATIC ONLY, ZERO TOUCH ON API / AUTH / GEOLOCATION / PRESENCE
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // STRICT EXCLUSION: API, Auth, Presensi, Geolocation, Telemetry MUST bypass cache
  const isExcluded =
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/auth/') ||
    url.pathname.includes('geolocation') ||
    url.pathname.includes('presence') ||
    url.pathname.includes('attendance') ||
    url.pathname.includes('checkpoint') ||
    url.searchParams.has('nocache');

  if (isExcluded) {
    // Pure network pass-through
    return;
  }

  // Only cache static files or same-origin navigation
  const isStaticAsset =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.webp') ||
    url.pathname.endsWith('.ico') ||
    url.pathname.endsWith('.webmanifest');

  if (isStaticAsset) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request).then((networkResponse) => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        });
      })
    );
    return;
  }

  // Navigation requests: Network first with cache fallback
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => {
        return caches.match(request).then((cached) => {
          return cached || caches.match('/');
        });
      })
    );
  }
});

// 4. WEB PUSH RFC HANDLER
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'SATYA Workforce Alert';
  const options = {
    body: data.body || 'Notifikasi tugas lapangan baru dari Danru / Dispatcher.',
    icon: data.icon || '/icons/workforce-192.png',
    badge: data.badge || '/icons/workforce-192.png',
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
    },
    vibrate: [100, 50, 100],
    tag: data.tag || 'satya-operational-alert',
    renotify: true,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// 5. NOTIFICATION CLICK HANDLER
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // Focus existing window if available
      for (const client of clientList) {
        const clientUrl = new URL(client.url);
        if (clientUrl.pathname === targetUrl || targetUrl === '/') {
          if ('focus' in client) {
            return client.focus();
          }
        }
      }

      // If no window is open, open new window with internal safe URL
      if (clients.openWindow) {
        const safeUrl = targetUrl.startsWith('/') ? targetUrl : '/';
        return clients.openWindow(safeUrl);
      }
    })
  );
});


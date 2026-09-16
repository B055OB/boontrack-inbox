// BoonTrack Service Worker for PWA, Web Push & Affiliate Dashboard Caching
const CACHE_NAME = 'boontrack-affiliate-v2';
const CURRENT_CACHES = [CACHE_NAME];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => !CURRENT_CACHES.includes(key))
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// Cache Boundary: Network Only for dynamic auth & dashboard routes
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  const pathname = url.pathname;

  // Only intercept GET requests
  if (event.request.method !== 'GET') {
    return;
  }

  // 1. P0.5: Network Only strategy for dashboard, affiliate APIs, and auth routes
  const isNetworkOnly =
    pathname.startsWith('/dashboard') ||
    pathname.startsWith('/affiliate/dashboard') ||
    pathname === '/affiliate' ||
    pathname.startsWith('/api/v1/affiliate') ||
    pathname.startsWith('/auth') ||
    pathname.startsWith('/api/v1/auth');

  if (isNetworkOnly) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. Cache-First / Stale-While-Revalidate for public static assets
  const isStaticAsset =
    pathname.startsWith('/_next/static/') ||
    pathname.startsWith('/app-brand/') ||
    pathname.match(/\.(js|css|png|jpg|jpeg|svg|webp|ico|woff2?)$/i);

  if (isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => cachedResponse);

        return cachedResponse || fetchPromise;
      })
    );
    return;
  }
});

// Handle Push Notifications from Web Push Server
self.addEventListener('push', (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || 'BoonTrack Notifikasi';
  const options = {
    body: data.body || 'Ada notifikasi terbaru untuk toko Anda.',
    icon: data.icon || '/logo.png',
    badge: data.badge || '/logo.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/',
      dateOfArrival: Date.now(),
      primaryKey: data.id || '1',
    },
    actions: [
      { action: 'open', title: 'Buka Dashboard' },
      { action: 'close', title: 'Tutup' },
    ],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// Handle Notification Click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') return;

  const targetUrl = event.notification.data?.url || '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

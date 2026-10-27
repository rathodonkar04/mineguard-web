/**
 * MineGuard Progressive Web App (PWA) Service Worker
 * Smart India Hackathon 2026 (Problem Statement 26025)
 * 
 * Provides:
 * - Offline asset caching for remote colliery pithead computers & field tablets
 * - Network-first with cache fallback for read-only GET /api/* routes
 * - Background cache update & stale-while-revalidate for dashboard bundle
 */

const STATIC_CACHE_NAME = 'mineguard-static-v1.6';
const API_CACHE_NAME = 'mineguard-api-v1.6';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg'
];

// 1. Service Worker Installation
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// 2. Service Worker Activation & Cache Housekeeping
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== STATIC_CACHE_NAME && name !== API_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Fetch Request Interceptor
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Bypass non-GET requests (POST, PUT, DELETE are handled via client-side IndexedDB outbox)
  if (request.method !== 'GET') {
    return;
  }

  // Camera and health requests must never be served as stale cached data.
  if (url.pathname.startsWith('/api/camera') || url.pathname.includes('/health') || url.pathname.startsWith('/socket.io')) return;

  // Handle API GET Requests (Network First, Cache Fallback)
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(API_CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          const cachedResponse = await caches.match(request);
          if (cachedResponse) {
            // Return cached copy with offline indicator header
            const headers = new Headers(cachedResponse.headers);
            headers.append('X-MineGuard-Offline-Cache', 'true');
            return new Response(cachedResponse.body, {
              status: cachedResponse.status,
              statusText: 'OK (Offline Cache Fallback)',
              headers
            });
          }
          return new Response(JSON.stringify({
            offline: true,
            message: 'You are currently working in offline mode on the mine bench. Telemetry is being served from local cache.'
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
          });
        })
    );
    return;
  }

  // Handle Static App Assets (Stale-While-Revalidate)
  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      const fetchPromise = fetch(request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          caches.open(STATIC_CACHE_NAME).then((cache) => {
            cache.put(request, networkResponse.clone());
          });
        }
        return networkResponse;
      }).catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});

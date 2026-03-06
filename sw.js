// ============================================================
//  Maa Kama Dental Clinic — Service Worker
//  Handles caching for offline support
//  Version: bump CACHE_NAME whenever you update the app
// ============================================================

const CACHE_NAME = 'maa-kama-dental-v1';

// Files to cache on install (app shell)
const PRECACHE_ASSETS = [
  './index.html',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400;1,600&family=Nunito:wght@300;400;500;600;700&display=swap'
];

// ── Install: pre-cache app shell ──────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Pre-caching app shell');
      // addAll fails if any request fails, so we cache individually
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn('[SW] Failed to cache:', url, err))
        )
      );
    })
  );
  // Take over immediately without waiting for old SW to die
  self.skipWaiting();
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Deleting old cache:', key);
            return caches.delete(key);
          })
      )
    )
  );
  // Immediately control all open pages
  self.clients.claim();
});

// ── Fetch: Network-first for API, Cache-first for assets ──────
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and cross-origin requests (except fonts)
  if (event.request.method !== 'GET') return;

  // Skip Google Apps Script / WhatsApp API calls — always go to network
  if (
    url.hostname.includes('script.google.com') ||
    url.hostname.includes('wa.me') ||
    url.hostname.includes('api.whatsapp.com')
  ) {
    return;
  }

  // For Google Fonts & CDN assets: Cache-first
  if (
    url.hostname.includes('fonts.googleapis.com') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then(cached => {
        if (cached) return cached;
        return fetch(event.request).then(response => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          return response;
        });
      })
    );
    return;
  }

  // For same-origin assets: Stale-While-Revalidate
  // Serve from cache instantly, update cache in background
  event.respondWith(
    caches.open(CACHE_NAME).then(cache =>
      cache.match(event.request).then(cached => {
        const fetchPromise = fetch(event.request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200) {
              cache.put(event.request, networkResponse.clone());
            }
            return networkResponse;
          })
          .catch(() => {
            // Offline fallback: return index.html for navigation requests
            if (event.request.destination === 'document') {
              return cache.match('./index.html');
            }
          });

        // Return cached version immediately, or wait for network
        return cached || fetchPromise;
      })
    )
  );
});

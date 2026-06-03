const CACHE_NAME = 'matkaking-v1.0.0';
const STATIC_CACHE = 'matkaking-static-v1.0.0';
const DYNAMIC_CACHE = 'matkaking-dynamic-v1.0.0';

const STATIC_ASSETS = [
  '/',
  '/manifest.json',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/favicon.ico'
];

const API_CACHE_PATTERNS = [
  /^\/api\/v1\/all$/,
  /^\/api\/v1\/latest$/,
  /^\/api\/v1\/market$/,
  /^\/api\/v1\/content\/homepage$/
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('Service Worker: Install Event');
  
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => {
        console.log('Service Worker: Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((error) => {
        console.error('Service Worker: Failed to cache static assets', error);
      })
  );
  
  // Force the waiting service worker to become the active service worker
  self.skipWaiting();
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activate Event');
  
  event.waitUntil(
    caches.keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log('Service Worker: Deleting old cache', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
  );
  
  // Take control of all clients immediately
  self.clients.claim();
});

// Fetch event - implement caching strategy
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip cross-origin requests
  if (url.origin !== location.origin) {
    return;
  }
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  event.respondWith(handleFetch(request));
});

async function handleFetch(request) {
  const url = new URL(request.url);
  
  try {
    // Strategy 1: Static assets - Cache First
    if (isStaticAsset(url.pathname)) {
      return await cacheFirst(request, STATIC_CACHE);
    }
    
    // Strategy 2: API endpoints - Network First with short cache
    if (isApiEndpoint(url.pathname)) {
      return await networkFirstWithCache(request, DYNAMIC_CACHE, 30000); // 30 seconds
    }
    
    // Strategy 3: HTML pages - Network First with fallback
    if (request.destination === 'document') {
      return await networkFirstWithFallback(request);
    }
    
    // Strategy 4: Other resources - Network First
    return await networkFirst(request);
    
  } catch (error) {
    console.error('Service Worker: Fetch error', error);
    return new Response('Network error', { status: 503 });
  }
}

// Check if the request is for a static asset
function isStaticAsset(pathname) {
  const staticPatterns = [
    /\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2)$/,
    /^\/favicon\.ico$/,
    /^\/manifest\.json$/,
    /^\/pwa-icon-/
  ];
  
  return staticPatterns.some(pattern => pattern.test(pathname));
}

// Check if the request is for a cacheable API endpoint
function isApiEndpoint(pathname) {
  return API_CACHE_PATTERNS.some(pattern => pattern.test(pathname));
}

// Cache First strategy
async function cacheFirst(request, cacheName) {
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }
  
  const networkResponse = await fetch(request);
  
  if (networkResponse.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, networkResponse.clone());
  }
  
  return networkResponse;
}

// Network First strategy
async function networkFirst(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

// Network First with Cache (for API endpoints)
async function networkFirstWithCache(request, cacheName, maxAge = 300000) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(cacheName);
      const responseClone = networkResponse.clone();
      
      // Add timestamp for cache expiry
      const responseWithTimestamp = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers: {
          ...Object.fromEntries(responseClone.headers.entries()),
          'sw-cached-at': Date.now().toString()
        }
      });
      
      cache.put(request, responseWithTimestamp);
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      const cachedAt = parseInt(cachedResponse.headers.get('sw-cached-at') || '0');
      const age = Date.now() - cachedAt;
      
      // Return cached response if it's not too old
      if (age < maxAge) {
        return cachedResponse;
      }
    }
    
    throw error;
  }
}

// Network First with Fallback (for HTML pages)
async function networkFirstWithFallback(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Return cached index.html for SPA routing
    const indexResponse = await caches.match('/');
    if (indexResponse) {
      return indexResponse;
    }
    
    throw error;
  }
}

// Handle background sync for offline actions
self.addEventListener('sync', (event) => {
  console.log('Service Worker: Background Sync', event.tag);
  
  if (event.tag === 'background-sync-results') {
    event.waitUntil(syncResults());
  }
});

async function syncResults() {
  try {
    const cache = await caches.open(DYNAMIC_CACHE);
    
    // Update critical API endpoints
    const criticalEndpoints = [
      '/api/v1/all',
      '/api/v1/latest',
      '/api/v1/market'
    ];
    
    for (const endpoint of criticalEndpoints) {
      try {
        const response = await fetch(endpoint);
        if (response.ok) {
          cache.put(endpoint, response.clone());
        }
      } catch (error) {
        console.error('Service Worker: Failed to sync', endpoint, error);
      }
    }
  } catch (error) {
    console.error('Service Worker: Background sync failed', error);
  }
}

// Handle push notifications (for future use)
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push Event');
  
  if (!event.data) {
    return;
  }
  
  const data = event.data.json();
  const options = {
    body: data.body || 'New Matka results available!',
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: 'matka-result',
    renotify: true,
    requireInteraction: false,
    actions: [
      {
        action: 'view',
        title: 'View Results'
      },
      {
        action: 'dismiss',
        title: 'Dismiss'
      }
    ]
  };
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'MATKAKING', options)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification Click', event.action);
  
  event.notification.close();
  
  if (event.action === 'view') {
    event.waitUntil(
      clients.openWindow('/')
    );
  }
});

// Handle messages from the main thread
self.addEventListener('message', (event) => {
  console.log('Service Worker: Message received', event.data);
  
  if (event.data.type === 'CACHE_UPDATE') {
    event.waitUntil(updateCache(event.data.url));
  }
  
  if (event.data.type === 'GET_VERSION') {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

async function updateCache(url) {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(url, response.clone());
    }
  } catch (error) {
    console.error('Service Worker: Cache update failed', error);
  }
}
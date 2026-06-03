// PWA Service Worker registration and utilities

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker not supported');
    return false;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js');
    
    console.log('Service Worker registered successfully:', registration);
    
    // Handle service worker updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      
      if (newWorker) {
        console.log('New Service Worker found, installing...');
        
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              // New update available
              console.log('New Service Worker installed, update available');
              showUpdateNotification();
            } else {
              // Service Worker installed for the first time
              console.log('Service Worker installed for the first time');
            }
          }
        });
      }
    });
    
    // Check for existing service worker
    if (registration.active) {
      console.log('Service Worker is active');
    }
    
    return true;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return false;
  }
}

export function showUpdateNotification() {
  // Create a simple notification for app updates
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 left-1/2 transform -translate-x-1/2 bg-blue-600 text-white px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3';
  notification.innerHTML = `
    <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
    </svg>
    <span>App update available!</span>
    <button onclick="window.location.reload()" class="bg-white text-blue-600 px-3 py-1 rounded text-sm font-semibold ml-2">
      Update Now
    </button>
    <button onclick="this.parentElement.remove()" class="text-blue-200 hover:text-white ml-2">
      <svg class="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;
  
  document.body.appendChild(notification);
  
  // Auto-remove after 10 seconds
  setTimeout(() => {
    if (notification.parentElement) {
      notification.remove();
    }
  }, 10000);
}

export async function updateServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      registration.update();
    }
  }
}

export async function unregisterServiceWorker() {
  if ('serviceWorker' in navigator) {
    const registration = await navigator.serviceWorker.getRegistration();
    if (registration) {
      const unregistered = await registration.unregister();
      console.log('Service Worker unregistered:', unregistered);
      return unregistered;
    }
  }
  return false;
}

export function isRunningPWA() {
  // Check if the app is running in PWA mode
  const isStandalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
  const isWebkitStandalone = window.navigator.standalone === true;
  
  return isStandalone || isWebkitStandalone;
}

export async function checkConnectivity() {
  if (!navigator.onLine) {
    return false;
  }
  
  try {
    const response = await fetch('/api/v1/latest', {
      method: 'HEAD',
      cache: 'no-cache'
    });
    return response.ok;
  } catch {
    return false;
  }
}

export function setupOfflineHandling() {
  const showOfflineMessage = () => {
    const message = document.createElement('div');
    message.id = 'offline-message';
    message.className = 'fixed top-0 left-0 right-0 bg-red-600 text-white text-center py-2 z-50';
    message.innerHTML = `
      <div class="flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM13 17h-2v-6h2v6zm0-8h-2V7h2v2z"/>
        </svg>
        <span>You're offline. Some features may not work properly.</span>
      </div>
    `;
    document.body.appendChild(message);
  };
  
  const hideOfflineMessage = () => {
    const message = document.getElementById('offline-message');
    if (message) {
      message.remove();
    }
  };
  
  const showOnlineMessage = () => {
    const message = document.createElement('div');
    message.className = 'fixed top-0 left-0 right-0 bg-green-600 text-white text-center py-2 z-50';
    message.innerHTML = `
      <div class="flex items-center justify-center gap-2">
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
        </svg>
        <span>Connection restored!</span>
      </div>
    `;
    document.body.appendChild(message);
    
    setTimeout(() => {
      if (message.parentElement) {
        message.remove();
      }
    }, 3000);
  };
  
  window.addEventListener('offline', () => {
    console.log('PWA: Going offline');
    showOfflineMessage();
  });
  
  window.addEventListener('online', () => {
    console.log('PWA: Coming online');
    hideOfflineMessage();
    showOnlineMessage();
  });
  
  // Initial check
  if (!navigator.onLine) {
    showOfflineMessage();
  }
}

export function requestNotificationPermission() {
  if (!('Notification' in window)) {
    console.warn('Notifications not supported');
    return Promise.resolve('denied');
  }
  
  if (Notification.permission === 'granted') {
    return Promise.resolve('granted');
  }
  
  if (Notification.permission === 'denied') {
    return Promise.resolve('denied');
  }
  
  return Notification.requestPermission();
}

export function showNotification(title, options = {}) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }
  
  const defaultOptions = {
    icon: '/pwa-icon-192.png',
    badge: '/pwa-icon-192.png',
    tag: 'matka-notification',
    requireInteraction: false,
    ...options
  };
  
  return new Notification(title, defaultOptions);
}

// Cache management utilities
export async function clearAppCache() {
  if ('caches' in window) {
    const cacheNames = await caches.keys();
    await Promise.all(
      cacheNames.map(cacheName => caches.delete(cacheName))
    );
    console.log('All caches cleared');
  }
}

export async function getCacheSize() {
  if (!('caches' in window) || !('storage' in navigator) || !('estimate' in navigator.storage)) {
    return null;
  }
  
  try {
    const estimate = await navigator.storage.estimate();
    return {
      used: estimate.usage,
      available: estimate.quota,
      percentage: (estimate.usage / estimate.quota * 100).toFixed(2)
    };
  } catch (error) {
    console.error('Error getting cache size:', error);
    return null;
  }
}
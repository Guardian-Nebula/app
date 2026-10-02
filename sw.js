// Guardian Nebula — service worker
// Purpose: (1) let the app be installed to a phone's home screen,
// (2) let JS call registration.showNotification() so reminders render
// as real OS notifications while this app/tab is open or running installed.
// This does NOT implement Push — it cannot wake the app once fully closed.
// That needs a push server (VAPID keys + a backend) sending real Push
// events; ask for that to be built once a specific need is clear.

const CACHE_NAME = 'guardian-nebula-v1';
const SHELL = ['./', './index.html', './logo.svg', './manifest.json'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Network-first for the app shell, falling back to cache when offline.
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      if (clients.length > 0) { clients[0].focus(); return; }
      return self.clients.openWindow('./');
    })
  );
});

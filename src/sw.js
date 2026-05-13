import { precacheAndRoute } from 'workbox-precaching';

// Injected by vite-plugin-pwa
precacheAndRoute(self.__WB_MANIFEST);

// Network-first for navigation
self.addEventListener('fetch', (e) => {
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).catch(() => caches.match('/index.html'))
    );
  }
});

// Minimal service worker: exists to satisfy PWA installability checks.
// Deliberately no caching - the app must always load the newest deployment,
// and Cloudflare's CDN already handles asset caching.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});

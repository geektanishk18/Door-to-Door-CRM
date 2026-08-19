/* Ground Control — service worker.
   Two jobs only: (1) cache the app shell so the PWA opens instantly /
   offline, (2) receive Web Push events and show a notification even when
   the app is fully closed. It deliberately does NOT intercept Supabase API
   calls or the CDN scripts — those always go straight to the network so
   sync/auth logic in index.html behaves exactly as it does today.
*/
const CACHE_VERSION = 'gc-shell-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

// Network-first for the HTML shell (so a new deploy is picked up on next
// load), cache-first for the rest of the shell. Everything cross-origin
// (Supabase, Google Fonts, jsdelivr) is left completely alone.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const isHTML = req.mode === 'navigate' || url.pathname.endsWith('/index.html') || url.pathname === '/';
  if (isHTML) {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (SHELL_FILES.some((f) => url.pathname.endsWith(f.replace('./', '/')))) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      }))
    );
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Ground Control', body: 'You have a follow-up due.', tag: 'followups', url: '/?tab=follow' };
  try { if (event.data) data = { ...data, ...event.data.json() }; } catch (e) { /* non-JSON payload, use defaults */ }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      tag: data.tag,
      renotify: true,
      icon: './icons/icon-192.png',
      badge: './icons/icon-96.png',
      data: { url: data.url || '/?tab=follow' },
      vibrate: [80, 40, 80]
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/?tab=follow';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) { c.postMessage({ type: 'OPEN_TAB', url: target }); return c.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});

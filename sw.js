// Offline support: cache the app, serve it when there's no network.
// Bump VERSION whenever you change any file so installed copies pick up the update.
const VERSION = 'rtm-2026-11-24i';
const SHELL = ['/', '/index.html', '/privacy.html', '/manifest.webmanifest', '/js/engine.js', '/js/params-2026.js',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png', '/icons/icon.svg', '/icons/favicon-32.png'];

self.addEventListener('install', e => {
  // cache what we can; one missing file must not stop the app from working offline
  e.waitUntil(caches.open(VERSION).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Pages: network first so updates show up, cache as fallback when offline.
  if (req.mode === 'navigate') {
    const key = (url.pathname === '/' || url.pathname === '/index.html') ? '/' : url.pathname;
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(key, copy)); }
      return res;
    }).catch(() => caches.match(key).then(hit => hit || caches.match('/'))));
    return;
  }

  // Own files and Google Fonts: cache first, then network.
  if (url.origin === location.origin || /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    })));
  }
});

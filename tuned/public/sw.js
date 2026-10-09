// Offline shell + long-lived cache for the pose model and engine.
const CACHE = 'tuned-v1';
const SHELL = ['./', 'index.html', 'css/app.css', 'js/app.js', 'js/data.js', 'js/store.js', 'js/engine.js', 'js/screen.js', 'js/pose.js', 'js/voice.js', 'js/coach.js', 'js/api.js', 'js/config.js', 'js/rtm.js', 'js/pt.js', 'js/partners.js', 'icon.svg', 'manifest.webmanifest'];

self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.includes('/api/')) return;
  if (url.pathname.includes('/vendor/')) {
    // Cache first: model and wasm are large and versioned by filename.
    e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })));
    return;
  }
  // Network first for app code so updates land immediately.
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then(m => m || caches.match('index.html'))));
});

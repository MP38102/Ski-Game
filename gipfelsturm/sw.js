// Offline cache for Gipfelsturm (web / home-screen app).
const VERSION = 'gipfelsturm-v1.0.0';
const JS = ['util', 'math3d', 'mesh', 'shaders', 'renderer', 'env', 'terrain', 'props', 'mountains', 'i18n', 'progress', 'characters',
  'challenges', 'world', 'player', 'npc', 'camera', 'input', 'audio', 'art', 'map', 'preview', 'minigames', 'game', 'ui', 'main'];
const FILES = ['./', 'index.html', 'style.css', 'manifest.webmanifest', 'img/emblem.svg', 'img/favicon.svg',
  'fonts/fredoka-latin-500-normal.woff2', 'fonts/fredoka-latin-600-normal.woff2', 'fonts/fredoka-latin-700-normal.woff2',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png'].concat(JS.map((f) => 'js/' + f + '.js'));

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('gipfelsturm-') && k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Network first so a new deploy shows up right away; the cache is the offline fallback.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok && res.type === 'basic') {
      const copy = res.clone();
      caches.open(VERSION).then((c) => c.put(e.request, copy));
    }
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});

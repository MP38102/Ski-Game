// Offline cache for the web version of Yeti Rush.
const VERSION = 'yetirush-v1.0.0';
const FILES = [
  './', 'index.html', 'style.css', 'manifest.webmanifest',
  'js/util.js', 'js/i18n.js', 'js/audio.js', 'js/art.js', 'js/world.js',
  'js/input.js', 'js/game.js', 'js/ui.js', 'js/main.js',
  'img/logo.svg', 'img/yeti-mark.svg', 'img/favicon.svg',
  'fonts/fredoka-latin-500-normal.woff2', 'fonts/fredoka-latin-600-normal.woff2', 'fonts/fredoka-latin-700-normal.woff2',
  'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request)));
});

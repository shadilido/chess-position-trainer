// Offline support: cache the whole app (incl. the Stockfish engine) on first load.
const VERSION = 'cpt-v2.0.1';
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/marble.svg',
  'js/app.js',
  'js/online.js',
  'js/online-ui.js',
  'js/firebase-config.js',
  'js/vendor/firebase.js',
  'privacy.html',
  'terms.html',
  'js/background.js',
  'js/board.js',
  'js/engine.js',
  'js/pieces.js',
  'js/positions.js',
  'js/review.js',
  'js/sound.js',
  'js/store.js',
  'js/util.js',
  'js/vendor/chess.js',
  'engine/stockfish-18-lite-single.js',
  'engine/stockfish-18-lite-single.wasm',
  'data/positions.json',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(req).then(res => {
        if (res.ok){
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match('index.html'));
    })
  );
});

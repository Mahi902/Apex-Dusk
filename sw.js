/* Apex Dusk service worker. Bump VERSION to force clients to refetch everything. */
const VERSION = 'v1';
const CORE = 'apex-dusk-core-' + VERSION;
const EXT = 'apex-dusk-ext-' + VERSION;

const CORE_FILES = [
  './',
  './index.html',
  './apexdusk2.html',
  './README.md',
  './manifest.webmanifest',
  './img/logo-720.png',
  './img/icon-192.png',
  './img/icon-512.png',
  './img/icon-maskable-512.png',
  './img/apple-touch-icon.png',
  './img/favicon-32.png'
];

// Third-party files the game needs. Cached so it can run offline.
const EXTERNAL_FILES = [
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/utils/SkeletonUtils.js',
  'https://fonts.googleapis.com/css2?family=Chakra+Petch:ital,wght@0,500;0,700;1,700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const core = await caches.open(CORE);
    await core.addAll(CORE_FILES.map((u) => new Request(u, { cache: 'reload' })));
    // Best effort: a CDN hiccup must not block installing the app.
    const ext = await caches.open(EXT);
    await Promise.all(EXTERNAL_FILES.map(async (u) => {
      try { await ext.put(u, await fetch(new Request(u, { mode: 'no-cors' }))); } catch (e) {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [CORE, EXT];
    for (const k of await caches.keys()) {
      if (k.startsWith('apex-dusk-') && !keep.includes(k)) await caches.delete(k);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') self.skipWaiting();
});

// Same-origin pages and the README: network first, so updates show up, cache when offline.
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (e) {
    const hit = (await cache.match(request, { ignoreSearch: true })) ||
                (await caches.match(request, { ignoreSearch: true }));
    if (hit) return hit;
    if (request.mode === 'navigate') {
      const home = await caches.match('./index.html');
      if (home) return home;
    }
    throw e;
  }
}

// Third-party files and images: cache first, fill the cache on first use.
async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone());
  return res;
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!/^https?:$/.test(url.protocol)) return;

  if (url.origin === self.location.origin) {
    const isImage = /\/img\/.+\.(png|webp|jpg|svg)$/i.test(url.pathname);
    event.respondWith(isImage ? cacheFirst(req, CORE) : networkFirst(req, CORE));
    return;
  }
  const hosts = ['cdnjs.cloudflare.com', 'cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  if (hosts.includes(url.hostname)) event.respondWith(cacheFirst(req, EXT));
});

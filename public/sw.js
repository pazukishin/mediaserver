/*
 * Service worker de MediaServer.
 *
 * Reglas deliberadas:
 *  - Los datos de la API (biblioteca, estado, escaneo) NUNCA se cachean: servir
 *    una lista vieja en un servidor de medios es peor que no servir nada.
 *  - Las carátulas sí (son inmutables y pesadas).
 *  - La navegación es red-primero con la cáscara cacheada como respaldo, para
 *    que la app abra aunque el servidor no responda.
 */
const VERSION = 'mediaserver-v2';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const ART_CACHE = `${VERSION}-artwork`;
const SHELL_URLS = ['/', '/manifest.webmanifest', '/favicon.svg', '/theme-boot.js'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_URLS))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isArtwork(pathname) {
  return pathname.startsWith('/api/channels/artwork') || (pathname.startsWith('/api/items/') && pathname.includes('/artwork'));
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return cached ?? Response.error();
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached ?? (await network) ?? Response.error();
}

async function networkFirstShell(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put('/', response.clone());
    return response;
  } catch (error) {
    const cached = (await cache.match('/')) ?? (await cache.match(request));
    if (cached) return cached;
    throw error;
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    if (isArtwork(url.pathname)) {
      event.respondWith(cacheFirst(request, ART_CACHE));
    }
    // El resto de la API va siempre a la red, sin intermediación.
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstShell(request));
    return;
  }

  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/font')) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});

// Estrategia por tipo de recurso. La regla que lo gobierna todo: nunca hacer
// esperar a la app por la red.
const VERSION = 'v2';
const SHELL_CACHE = `lm-shell-${VERSION}`;
const ASSET_CACHE = `lm-assets-${VERSION}`;
const COVER_CACHE = 'lm-covers';

const SHELL_URLS = ['/', '/index.html', '/manifest.json', '/icon-192.png', '/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  const vigentes = [SHELL_CACHE, ASSET_CACHE, COVER_CACHE];
  event.waitUntil(
    caches.keys()
      .then((nombres) => Promise.all(nombres.filter((n) => !vigentes.includes(n)).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const guardado = await cache.match(request);
  if (guardado) return guardado;

  const respuesta = await fetch(request);
  // Las respuestas opacas (portadas de otro dominio) también se guardan.
  if (respuesta && (respuesta.ok || respuesta.type === 'opaque')) {
    cache.put(request, respuesta.clone());
  }
  return respuesta;
}

async function navegacion(request) {
  try {
    const respuesta = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put('/index.html', respuesta.clone());
    return respuesta;
  } catch {
    const cache = await caches.open(SHELL_CACHE);
    return (await cache.match('/index.html')) ?? Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Los datos viven en localStorage. Interceptar /api solo servía para que la
  // app se quedase esperando a que la red fallase: que falle rápido y ya está.
  if (url.pathname.startsWith('/api/')) return;

  if (event.request.mode === 'navigate') {
    event.respondWith(navegacion(event.request));
    return;
  }

  if (url.hostname === 'static.listadomanga.com') {
    event.respondWith(cacheFirst(event.request, COVER_CACHE));
    return;
  }

  // Los bundles de Vite llevan hash en el nombre: son inmutables.
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(event.request, ASSET_CACHE));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE));
  }
});

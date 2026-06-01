// Service Worker — Gestión Transportes Pucarani PWA
// Diseñado para vivir en una SUBCARPETA (ej: /gestion/) sin interferir
// con la página de presentación que está en la raíz del dominio.

const CACHE_VERSION = 'pucarani-gestion-v2';

// El "scope" es la carpeta donde está este SW (ej: /gestion/).
const SCOPE = self.registration.scope; // ej: https://transportespucarani.cl/gestion/

// Recursos que se precachean. Las librerías pesadas (jszip, xlsx) se
// sirven desde caché para velocidad; el HTML se busca primero en la red.
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './jszip.min.js',
  './xlsx.full.min.js',
  './icon-192.png',
  './icon-512.png',
];

// Recursos que SIEMPRE deben buscarse en la red primero (para que las
// actualizaciones se vean al instante). Caen al caché solo si no hay internet.
const NETWORK_FIRST = ['index.html', 'manifest.json', './', '/'];

function isNetworkFirst(url) {
  return NETWORK_FIRST.some(p =>
    url.pathname.endsWith(p) || url.href === SCOPE || url.href === SCOPE + 'index.html'
  );
}

// Instala: precachea el app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// Activa: limpia caches viejos de versiones anteriores
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const inScope = url.href.startsWith(SCOPE);             // dentro de /gestion/
  const isExternal = url.origin !== self.location.origin; // fuentes, iconos CDN

  if (inScope) {
    if (isNetworkFirst(url)) {
      // HTML y manifest → RED PRIMERO (actualizaciones instantáneas),
      // caché solo como respaldo sin internet.
      event.respondWith(
        fetch(req).then(resp => {
          const copy = resp.clone();
          caches.open(CACHE_VERSION).then(c => c.put(req, copy));
          return resp;
        }).catch(() => caches.match(req).then(c => c || caches.match('./index.html')))
      );
    } else {
      // Librerías e íconos (no cambian seguido) → CACHÉ PRIMERO (rápido),
      // red como respaldo.
      event.respondWith(
        caches.match(req).then(cached => {
          if (cached) return cached;
          return fetch(req).then(resp => {
            const copy = resp.clone();
            caches.open(CACHE_VERSION).then(c => c.put(req, copy));
            return resp;
          }).catch(() => caches.match('./index.html'));
        })
      );
    }
  } else if (isExternal) {
    // Recursos externos (Google Fonts, Tabler Icons) → red primero, cache respaldo
    event.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE_VERSION).then(c => c.put(req, copy));
        return resp;
      }).catch(() => caches.match(req))
    );
  }
  // Peticiones del mismo origen FUERA de /gestion/ (la presentación en la
  // raíz) NO se interceptan: el navegador las maneja normalmente.
});


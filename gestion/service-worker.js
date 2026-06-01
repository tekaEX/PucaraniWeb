// Service Worker — Gestión Transportes Pucarani PWA
// Diseñado para vivir en una SUBCARPETA (ej: /gestion/) sin interferir
// con la página de presentación que está en la raíz del dominio.

const CACHE_VERSION = 'pucarani-gestion-v1';

// El "scope" es la carpeta donde está este SW (ej: /gestion/).
// Solo gestionamos peticiones dentro de este scope; todo lo demás
// (incluida la página de presentación en la raíz) pasa sin tocarse.
const SCOPE = self.registration.scope; // ej: https://transportespucarani.cl/gestion/

const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './jszip.min.js',
  './xlsx.full.min.js',
  './icon-192.png',
  './icon-512.png',
];

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
  const inScope = url.href.startsWith(SCOPE);          // dentro de /gestion/
  const isExternal = url.origin !== self.location.origin; // fuentes, iconos CDN

  if (inScope) {
    // App shell (dentro de la subcarpeta) → cache primero, red de respaldo
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
  // Cualquier otra petición del mismo origen pero FUERA de /gestion/
  // (ej: la página de presentación en la raíz) NO se intercepta:
  // el navegador la maneja normalmente.
});

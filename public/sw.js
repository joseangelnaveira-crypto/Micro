// Service worker escrito a mano (sin next-pwa/serwist): este proyecto compila en
// producción con Turbopack, y esas herramientas asumen hooks de compilación webpack para
// generar el manifest de precache. Estrategia de caché "sobre la marcha" (runtime caching),
// sin lista de precache ni build tooling.
//
// Sube estos números cuando haga falta invalidar la caché de un despliegue anterior.
const STATIC_CACHE = 'academia-static-v1';
const DOC_CACHE = 'academia-docs-v1'; // debe coincidir con DOC_CACHE_NAME en src/lib/offline/sync.ts

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC_CACHE));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name !== STATIC_CACHE && name !== DOC_CACHE)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

function isDocumentRequest(request, url) {
  return (
    request.mode === 'navigate' ||
    (request.headers.get('accept') || '').includes('text/x-component') ||
    url.searchParams.has('_rsc')
  );
}

async function networkFirstDocument(request, url) {
  const cache = await caches.open(DOC_CACHE);
  try {
    const response = await fetch(request);
    cache.put(url.pathname, response.clone());
    return response;
  } catch {
    const cached = await caches.match(url.pathname, { ignoreSearch: true });
    if (cached) return cached;
    return new Response(
      '<!doctype html><meta charset="utf-8"><p>Sin conexión y esta página aún no se ha guardado.</p>',
      { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    );
  }
}

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  const cache = await caches.open(cacheName);
  cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (isDocumentRequest(request, url)) {
    event.respondWith(networkFirstDocument(request, url));
    return;
  }

  event.respondWith(cacheFirst(request, STATIC_CACHE));
});

// Recordatorios de inactividad (Web Push, enviados por /api/send-reminders).
self.addEventListener('push', (event) => {
  let payload = { title: 'Academia de Microbiología', body: 'Tienes preguntas pendientes de repasar.' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch { /* noop: se usa el payload por defecto */ }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: payload.url || '/dashboard' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data && event.notification.data.url ? event.notification.data.url : '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
      for (const client of clientsList) {
        if (client.url.includes(url) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

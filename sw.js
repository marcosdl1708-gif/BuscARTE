const CACHE = 'buscarte-v1';
const SHELL = [
  '/',
  '/index.html',
  '/buscARTE_login.html',
  '/buscARTE_registro.html',
  '/buscARTE_busqueda.html',
  '/buscARTE_anuncios.html',
  '/buscARTE_mensajes.html',
  '/manifest.json',
  '/icons/icon-192.png',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network first — siempre intenta red, cae a cache si offline
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('supabase.co')) return; // nunca cachear API
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const clone = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, clone));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

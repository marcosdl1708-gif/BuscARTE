const CACHE_VERSION = 'buscarte-v2';
const OFFLINE_URL = '/index.html';

const SHELL = [
  '/',
  '/index.html',
  '/buscARTE_busqueda.html',
  '/buscARTE_anuncios.html',
  '/buscARTE_login.html',
  '/buscARTE_registro.html',
  '/buscARTE_generador.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(async cache => {
      await Promise.allSettled(SHELL.map(url => cache.add(url)));
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

function shouldBypass(request) {
  if (request.method !== 'GET') return true;

  const url = new URL(request.url);

  // No cachear APIs, funciones, extensiones ni recursos de otros orígenes.
  if (url.origin !== self.location.origin) return true;
  if (url.pathname.startsWith('/.netlify/functions/')) return true;
  if (url.hostname.includes('supabase.co')) return true;

  return false;
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_VERSION);

  try {
    const response = await fetch(request);

    // Cachear solo respuestas válidas del propio sitio.
    if (response && response.ok && response.type === 'basic') {
      cache.put(request, response.clone()).catch(() => {});
    }

    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const offline = await cache.match(OFFLINE_URL);
      if (offline) return offline;
    }

    throw error;
  }
}

self.addEventListener('fetch', event => {
  if (shouldBypass(event.request)) return;
  event.respondWith(networkFirst(event.request));
});

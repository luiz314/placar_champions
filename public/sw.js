// Service Worker do Placar de Vôlei - Suporte Offline Completo (PWA)
// Altere a versão sempre que a lista de arquivos pré-carregados mudar.
const CACHE_NAME = 'placar-volei-cache-v5';

const STATIC_ASSETS = [
  '/',
  '/placar',
  '/privacidade',
  '/termos',
  '/css/style.css',
  '/js/socket.io.min.js',
  '/js/auth.js',
  '/js/audio.js',
  '/js/scoreboard.js',
  '/manifest.json',
  '/icon.svg',
  '/logo.png'
];

// Instalação do Service Worker e pré-cache de assets essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function saveInCache(request, response) {
  if (response && response.status === 200 && response.type === 'basic') {
    const clone = response.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;

  // Fontes do Google: cache primeiro (mantém o visual do placar offline)
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return response;
      }))
    );
    return;
  }

  // Socket.IO, API e demais serviços externos (ex: login Google) vão direto à rede
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) return;

  // Rede primeiro (deploys novos chegam imediatamente); sem rede, usa a cópia em cache
  event.respondWith(
    fetch(request)
      .then((response) => saveInCache(request, response))
      .catch(async () => {
        const cached = await caches.match(request, { ignoreSearch: request.mode === 'navigate' });
        if (cached) return cached;
        if (request.mode === 'navigate') {
          // Placar funciona offline; demais páginas caem no portal
          return (await caches.match(url.pathname.startsWith('/placar') ? '/placar' : '/')) || Response.error();
        }
        return Response.error();
      })
  );
});

// Service Worker do Placar de Vôlei - Suporte Offline Completo (PWA)
const CACHE_NAME = 'placar-volei-cache-v1';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/css/style.css',
  '/js/socket.io.min.js',
  '/js/audio.js',
  '/js/scoreboard.js',
  '/manifest.json',
  '/icon.svg'
];

// Instalação do Service Worker e pré-cache de assets essenciais
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => self.skipWaiting())
  );
});

// Ativação e limpeza de caches antigos
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Interceptação de requisições de rede
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Não interceptar requisições do Socket.IO (transporte websocket/polling) ou APIs dinâmicas
  if (url.pathname.startsWith('/socket.io/') || url.pathname.startsWith('/api/')) {
    return;
  }

  // Requisição de Navegação de Página (HTML)
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // Se estiver offline ou a rede falhar, retorna o index.html em cache
          return caches.match('/')
            .then((cachedHome) => cachedHome || caches.match('/index.html'));
        })
    );
    return;
  }

  // Requisições para arquivos estáticos da mesma origem (CSS, JS, imagens)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          // Atualiza em background (stale-while-revalidate) para manter o cache atualizado
          fetch(request)
            .then((freshResponse) => {
              if (freshResponse && freshResponse.status === 200) {
                caches.open(CACHE_NAME).then((cache) => cache.put(request, freshResponse));
              }
            })
            .catch(() => { /* Sem rede, usa versão do cache */ });
          return cachedResponse;
        }

        // Se ainda não estiver em cache, tenta rede e salva em cache
        return fetch(request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const clone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return networkResponse;
        });
      })
    );
    return;
  }

  // Recursos de terceiros (como Google Fonts): Stale-While-Revalidate com fallback
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res && res.status === 200) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return res;
      }).catch(() => {
        return new Response('', { status: 408, statusText: 'Offline' });
      });
    })
  );
});

const CACHE_NAME = 'gavioes-fundo-v4';
const PRECACHE_URLS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png'
];
const SHELL_URL = './index.html';

// Safari recusa servir, para navegação, uma Response marcada como "redirected"
// (ex: quando o Cloudflare Access faz um 302 no meio do caminho). Por isso toda
// resposta que vai pro cache passa por aqui, que devolve uma cópia "limpa".
async function toPlainResponse(res) {
  if (!res.redirected) return res;
  const body = await res.clone().arrayBuffer();
  return new Response(body, { status: res.status, statusText: res.statusText, headers: res.headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE_URLS.map((url) =>
        fetch(url, { cache: 'reload' })
          .then((res) => (res.ok ? toPlainResponse(res) : null))
          .then((plain) => plain && cache.put(url, plain))
          .catch(() => {})
      ))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const isSameOrigin = new URL(req.url).origin === self.location.origin;

  if (isSameOrigin) {
    event.respondWith((async () => {
      const cached = await caches.match(req, { ignoreSearch: true });
      if (cached) {
        // Atualiza em segundo plano, sem bloquear a resposta já cacheada
        fetch(req).then(async (res) => {
          if (res && res.ok) {
            const plain = await toPlainResponse(res);
            const cache = await caches.open(CACHE_NAME);
            cache.put(req, plain);
          }
        }).catch(() => {});
        return cached;
      }
      try {
        const res = await fetch(req);
        if (res && res.ok) {
          const plain = await toPlainResponse(res);
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, plain.clone());
          return plain;
        }
        return res;
      } catch (err) {
        // Offline e sem entrada exata no cache: cai pro shell do app (SPA) em
        // vez de devolver nada — Safari quebra a navegação se a resposta é vazia.
        if (req.mode === 'navigate') {
          const shell = await caches.match(SHELL_URL, { ignoreSearch: true });
          if (shell) return shell;
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      }
    })());
  } else {
    // Fotos de avatar (randomuser.me): cache-first, guarda o que conseguir buscar
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      try {
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) {
          const cache = await caches.open(CACHE_NAME);
          cache.put(req, res.clone());
        }
        return res;
      } catch (err) {
        return new Response('', { status: 504, statusText: 'Offline' });
      }
    })());
  }
});

const CACHE_NAME = 'gavioes-fundo-v2';
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
    // App shell: serve do cache na hora, atualiza em segundo plano quando online
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req).then(async (res) => {
          if (res && res.ok) {
            const plain = await toPlainResponse(res);
            caches.open(CACHE_NAME).then((cache) => cache.put(req, plain.clone()));
            return plain;
          }
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
  } else {
    // Fotos de avatar (randomuser.me): cache-first, guarda o que conseguir buscar
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          if (res && (res.ok || res.type === 'opaque')) {
            caches.open(CACHE_NAME).then((cache) => cache.put(req, res.clone()));
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
});

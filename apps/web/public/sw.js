const CACHE_NAME = "eg_static_v2";
const OFFLINE_FALLBACK = "/campo";
const PRECACHE_URLS = [OFFLINE_FALLBACK];

const isSameOrigin = (url) => url.origin === self.location.origin;
const isStaticAppAsset = (pathname) => pathname.startsWith("/_next/");
const isApiRequest = (pathname) => pathname.startsWith("/api/");
const isPublicAsset = (pathname) =>
  /\.(?:css|js|png|jpg|jpeg|gif|webp|avif|svg|ico|txt|xml|webmanifest|woff2?)$/i.test(pathname);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never intercept non-GET, cross-origin, API, or hashed app build assets.
  // Caching Next.js runtime chunks with cache-first causes stale JS/CSS after deploys.
  if (
    event.request.method !== "GET"
    || !isSameOrigin(url)
    || isApiRequest(url.pathname)
    || isStaticAppAsset(url.pathname)
  ) {
    return;
  }

  // For navigation requests: network-first, fall back to the last cached page shell.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return res;
        })
        .catch(() => caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_FALLBACK)))
    );
    return;
  }

  // Keep a small cache only for public assets that help offline field usage.
  if (!isPublicAsset(url.pathname)) {
    return;
  }

  event.respondWith(caches.match(event.request).then((cached) => {
    if (cached) return cached;
    return fetch(event.request).then((res) => {
      if (res.ok) {
        const clone = res.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
      }
      return res;
    });
  }));
});

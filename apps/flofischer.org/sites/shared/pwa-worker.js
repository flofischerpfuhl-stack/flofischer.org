const PWA_VERSION = "2026-09-01-2";
const CACHE_PREFIX = "ff-pwa-";
const CACHE_NAME = `${CACHE_PREFIX}${self.PWA_CONFIG.site}-${PWA_VERSION}`;
const scopeUrl = new URL(self.registration.scope);
const localMatch = scopeUrl.pathname.match(/^\/(__(?:root|seele|gehirn))(?:\/|$)/);
const localPrefix = localMatch ? `/${localMatch[1]}` : "";

function scoped(path) {
  if (!localPrefix || path.startsWith("/shared/")) return path;
  return path === "/" ? `${localPrefix}/` : `${localPrefix}${path}`;
}

const shellUrls = self.PWA_CONFIG.shell.map(scoped);

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await Promise.allSettled(shellUrls.map(async (url) => {
      const response = await fetch(url, { cache: "reload" });
      if (response.ok) await cache.put(url, response);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
      .map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || (await cache.match(scoped("/"))) || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok || response.type === "opaque") await cache.put(request, response.clone());
  return response;
}

async function networkFirstStatic(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request));
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const allowedExternal = url.hostname === "cdn.jsdelivr.net"
    || url.hostname === "fonts.googleapis.com"
    || url.hostname === "fonts.gstatic.com";
  const cacheableDestination = ["style", "script", "font", "image", "manifest"].includes(request.destination);

  if (sameOrigin && ["style", "script", "manifest"].includes(request.destination)) {
    event.respondWith(networkFirstStatic(request));
  } else if ((sameOrigin && cacheableDestination) || allowedExternal) {
    event.respondWith(cacheFirst(request));
  }
});

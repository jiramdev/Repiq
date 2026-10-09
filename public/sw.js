/* Repiq service worker.
 *
 * - Navigations: network first, falling back to the last cached copy of that
 *   page, then to the cached dashboard, then to /offline.html.
 * - /_next/static (content-hashed): cache first.
 * - Icons, fonts, manifest: stale-while-revalidate.
 * - API routes, server actions (POST) and RSC fetches are never cached.
 * - Updates wait until the page asks (SKIP_WAITING) so a workout is never
 *   reloaded underneath the user.
 *
 * Bump VERSION when this file's caching logic changes.
 */
const VERSION = "v2";
const STATIC_CACHE = `repiq-static-${VERSION}`;
const PAGE_CACHE = `repiq-pages-${VERSION}`;
const ASSET_CACHE = `repiq-assets-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE, ASSET_CACHE]);
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k.startsWith("repiq-") && !keep.has(k)).map((k) => caches.delete(k))
      );
      if (self.registration.navigationPreload) {
        await self.registration.navigationPreload.enable();
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "CLEAR_CACHES") {
    event.waitUntil(
      Promise.all([caches.delete(PAGE_CACHE), caches.delete(ASSET_CACHE)])
    );
  }
});

function isCacheableResponse(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

async function handleNavigation(event) {
  const cache = await caches.open(PAGE_CACHE);
  try {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(event.request));
    if (isCacheableResponse(response)) {
      cache.put(event.request, response.clone());
    }
    return response;
  } catch {
    const cached =
      (await cache.match(event.request, { ignoreSearch: true })) || (await cache.match("/"));
    if (cached) return cached;
    return (await caches.match(OFFLINE_URL)) || Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (isCacheableResponse(response)) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return cached || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin && url.pathname.startsWith("/api/")) return;
  // React Server Component payloads: let Next handle failures itself.
  if (request.headers.get("RSC") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate" && sameOrigin) {
    event.respondWith(handleNavigation(event));
    return;
  }

  if (sameOrigin && url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  if (
    (sameOrigin &&
      (url.pathname.startsWith("/icons/") ||
        url.pathname.startsWith("/_next/image") ||
        url.pathname === "/manifest.webmanifest" ||
        url.pathname === "/apple-touch-icon.png" ||
        url.pathname.startsWith("/icon"))) ||
    url.hostname === "fonts.gstatic.com"
  ) {
    event.respondWith(staleWhileRevalidate(request, ASSET_CACHE));
  }
});

// ---------------------------------------------------------------------------
// Push notifications (rest timer)

self.addEventListener("push", (event) => {
  let data = {};
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data = { body: event.data.text() };
    }
  }

  const title = data.title || "Rest complete";
  const options = {
    body: data.body || "Time for your next set.",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    vibrate: [200, 100, 200],
    tag: data.tag || "repiq-rest-timer",
    renotify: true,
    data: { url: data.url || "/" },
  };

  event.waitUntil(
    (async () => {
      // If the app is open and visible, the in-page timer already beeps and
      // vibrates; just tell it instead of stacking a system notification.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.find((c) => c.visibilityState === "visible" && c.focused);
      if (visible && data.type === "rest-complete") {
        visible.postMessage({ type: "REST_COMPLETE", timerId: data.timerId });
        return;
      }
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === target && "focus" in client) return client.focus();
      }
      for (const client of clientList) {
        if ("navigate" in client && "focus" in client) {
          return client.navigate(target).then((c) => (c || client).focus());
        }
      }
      return self.clients.openWindow ? self.clients.openWindow(target) : undefined;
    })
  );
});

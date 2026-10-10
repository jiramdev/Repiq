/* Repiq service worker.
 *
 * - Navigations: network first with a 4 s timeout. On timeout or offline it
 *   falls back to the cached copy of that page, else /offline.html. It never
 *   serves one page's HTML under another URL.
 * - Workout lock-in: while this device knows of an active workout, offline
 *   (or slow) navigations to any other page are redirected to that workout.
 * - /_next/static (content-hashed): cache first.
 * - Icons, fonts, manifest: stale-while-revalidate.
 * - API routes, server actions (POST), RSC fetches and /auth are never cached.
 * - Cached pages hold the signed-in user's data: at most MAX_PAGES are kept,
 *   and they're wiped on sign-out and whenever the sign-in page loads.
 * - Updates wait until the page asks (SKIP_WAITING) so a workout is never
 *   reloaded underneath the user.
 *
 * Bump VERSION when this file's caching logic changes.
 */
const VERSION = "v3";
const STATIC_CACHE = `repiq-static-${VERSION}`;
const PAGE_CACHE = `repiq-pages-${VERSION}`;
const ASSET_CACHE = `repiq-assets-${VERSION}`;
const META_CACHE = "repiq-meta";
const ACTIVE_WORKOUT_KEY = "/__repiq/active-workout";
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/icon-512.png", "/icons/logo.svg"];
const NAVIGATION_TIMEOUT_MS = 4000;
const MAX_PAGES = 25;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC_CACHE, PAGE_CACHE, ASSET_CACHE, META_CACHE]);
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

// --- active workout (lock-in) ------------------------------------------------

async function getActiveWorkoutUrl() {
  try {
    const cache = await caches.open(META_CACHE);
    const res = await cache.match(ACTIVE_WORKOUT_KEY);
    if (!res) return null;
    const { url } = await res.json();
    return typeof url === "string" && /^\/workout\/\d+$/.test(url) ? url : null;
  } catch {
    return null;
  }
}

async function setActiveWorkoutUrl(url) {
  const cache = await caches.open(META_CACHE);
  if (typeof url === "string" && /^\/workout\/\d+$/.test(url)) {
    await cache.put(
      ACTIVE_WORKOUT_KEY,
      new Response(JSON.stringify({ url }), { headers: { "Content-Type": "application/json" } })
    );
  } else {
    await cache.delete(ACTIVE_WORKOUT_KEY);
  }
}

self.addEventListener("message", (event) => {
  const type = event.data && event.data.type;
  if (type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (type === "CLEAR_CACHES") {
    event.waitUntil(
      Promise.all([caches.delete(PAGE_CACHE), caches.delete(ASSET_CACHE), caches.delete(META_CACHE)])
    );
  } else if (type === "ACTIVE_WORKOUT") {
    event.waitUntil(setActiveWorkoutUrl(event.data.url));
  }
});

// --- caching helpers ---------------------------------------------------------

function isCacheableResponse(response) {
  return response && response.ok && response.type === "basic" && !response.redirected;
}

function isAuthPath(pathname) {
  return pathname === "/auth" || pathname.startsWith("/auth/");
}

async function trimCache(cache, max) {
  const keys = await cache.keys();
  // Oldest entries first (insertion order).
  await Promise.all(keys.slice(0, Math.max(0, keys.length - max)).map((k) => cache.delete(k)));
}

/**
 * What to show when the network can't answer (offline or too slow):
 * the active workout, else this page's cached copy, else (only when really
 * offline) the offline page. Returns null when there's nothing to fall back on.
 */
async function fallbackFor(request, offline) {
  const url = new URL(request.url);
  const active = await getActiveWorkoutUrl();
  if (active && url.pathname !== active && !isAuthPath(url.pathname)) {
    return Response.redirect(new URL(active, self.location.origin).href, 302);
  }
  const cache = await caches.open(PAGE_CACHE);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  if (!offline) return null;
  return (await caches.match(OFFLINE_URL)) || Response.error();
}

async function handleNavigation(event) {
  const { request } = event;
  const url = new URL(request.url);

  const network = (async () => {
    const preloaded = await event.preloadResponse;
    const response = preloaded || (await fetch(request));
    if (isCacheableResponse(response) && !isAuthPath(url.pathname)) {
      const cache = await caches.open(PAGE_CACHE);
      await cache.put(request, response.clone());
      await trimCache(cache, MAX_PAGES);
    }
    return response;
  })();

  let timer;
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve("timeout"), NAVIGATION_TIMEOUT_MS);
  });

  try {
    const first = await Promise.race([network, timeout]);
    if (first !== "timeout") return first;
    // Weak gym wifi: show what we have instead of a blank screen, if anything.
    const fallback = await fallbackFor(request, false);
    if (fallback) {
      event.waitUntil(network.catch(() => undefined));
      return fallback;
    }
    return await network;
  } catch {
    return fallbackFor(request, true);
  } finally {
    clearTimeout(timer);
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
        url.pathname.startsWith("/splash/") ||
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
      // If the app is open and in front, its own timer already beeps and
      // vibrates, so don't stack a system notification on top.
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const visible = windows.find((c) => c.visibilityState === "visible" && c.focused);
      if (visible && data.type === "rest-complete") return;
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

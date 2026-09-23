// ─── AniMood Service Worker ─────────────────────────────────────────────────
// Cache-first for static assets (JS, CSS, images), network-first for API calls.
// Offline fallback: cached pages, the app shell stays usable from cache.

const CACHE_NAME = "animood-v1";

// Assets to pre-cache on install — the critical app shell.
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/favicon.svg",
  "/icons.svg",
];

// ─── INSTALL — pre-cache the app shell ─────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      // Best-effort pre-cache — don't fail the install if a resource is temporarily down
      for (const url of PRECACHE_URLS) {
        try {
          const req = new Request(url, { cache: "reload" });
          const res = await fetch(req);
          if (res.ok) cache.put(req, res);
        } catch { /* skip — will cache on next visit */ }
      }
    })()
  );
  // Activate immediately without waiting for all tabs to close
  self.skipWaiting();
});

// ─── ACTIVATE — clean up old caches ────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      );
    })()
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ─── FETCH — cache-first for static, network-first for API/dynamic ─────────
const API_PATTERNS = [
  /^https:\/\/api\.jikan\.moe/,
  /^https:\/\/api\.animethemes\.moe/,
  /^https:\/\/api\.cloudinary\.com/,
  /^https:\/\/pjkvhhxwjzpmxmhdhwcp\.supabase\.co/,
  /^https:\/\/graphql\.anilist\.co/,
];

function isApiRequest(url) {
  return API_PATTERNS.some((pat) => pat.test(url));
}

function isStaticAsset(url) {
  const { pathname } = new URL(url);
  return (
    pathname.startsWith("/assets/") ||
    pathname.endsWith(".js") ||
    pathname.endsWith(".css") ||
    pathname.endsWith(".svg") ||
    pathname.endsWith(".png") ||
    pathname.endsWith(".jpg") ||
    pathname.endsWith(".webp") ||
    pathname.endsWith(".ico") ||
    pathname === "/favicon.svg" ||
    pathname === "/icons.svg" ||
    pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = request.url;

  // ═══ Static assets: cache-first ════════════════════════════════════════
  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          // Offline and not in cache — return a fallback
          if (url.endsWith(".png") || url.endsWith(".svg") || url.endsWith(".ico")) {
            return new Response(null, { status: 204 });
          }
          return new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // ═══ API requests: network-first, cache as fallback ════════════════════
  if (isApiRequest(url)) {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          return new Response(JSON.stringify({ error: "offline" }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })()
    );
    return;
  }

  // ═══ Navigation (HTML pages): network-first, fallback to cached index ═══
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(request);
          if (res.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          const cached = await caches.match("/");
          return cached || new Response("Offline", { status: 503 });
        }
      })()
    );
    return;
  }

  // ═══ Everything else: pass through ═══════════════════════════════════════
  // Don't intercept — let the browser handle normally
});
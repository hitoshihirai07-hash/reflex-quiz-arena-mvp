/* Reflex Quiz Arena PWA Service Worker */
const VERSION = "20260124131128";
const CORE_CACHE = `rqa-core-${VERSION}`;
const RUNTIME_CACHE = `rqa-runtime-${VERSION}`;

const CORE_ASSETS = [
  "/",
  "/index.html",
  "/puzzles/",
  "/puzzles/index.html",
  "/puzzles/15/",
  "/puzzles/15/index.html",
  "/puzzles/rules/",
  "/puzzles/rules/index.html",
  "/assets/puzzle15.js",
  "/puzzles/2048/",
  "/puzzles/2048/index.html",
  "/assets/puzzle2048.js",
  "/offline.html",
  "/manifest.webmanifest",
  "/assets/style.css",
  "/assets/config.js",
  "/assets/game.js",
  "/data/questions.js",
  "/assets/icons/icon-192.png",
  "/assets/icons/icon-512.png",
  "/assets/favicon.svg"
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CORE_CACHE);
    await cache.addAll(CORE_ASSETS);
    self.skipWaiting(); // install fast; UI will prompt before taking control on client
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k.startsWith("rqa-") && ![CORE_CACHE, RUNTIME_CACHE].includes(k)) return caches.delete(k);
    }));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isSameOrigin(url) {
  try { return new URL(url).origin === self.location.origin; } catch(e) { return false; }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Don't interfere with admin pages (basic auth, private)
  if (url.pathname.startsWith("/admin")) {
    return; // browser default fetch
  }

  // Navigation: network-first, fallback to cache/offline
  if (req.mode === "navigate") {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        // cache only successful HTML
        if (res && res.ok && isSameOrigin(req.url)) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(req, res.clone());
        }
        return res;
      } catch (e) {
        const cached = await caches.match(req);
        return cached || (await caches.match("/offline.html"));
      }
    })());
    return;
  }

  // Only cache same-origin static assets
  if (!isSameOrigin(req.url)) return;

  // Static: stale-while-revalidate
  const dest = req.destination;
  if (["script","style","image","font"].includes(dest) || url.pathname.startsWith("/data/") || url.pathname.startsWith("/assets/")) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = await cache.match(req);
      const fetchPromise = fetch(req).then((res) => {
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })());
    return;
  }
});

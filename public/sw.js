/*
 * ChordBase's service worker: keeps the app, and the pages that were opened while online, working with no
 * connection (a church basement with poor wifi). It never touches anything but plain page and file requests:
 * saving changes and everything else the app sends is left alone.
 *
 *  - /_next/static/*       built files, never change under the same name: kept for good, used first.
 *  - pages and their data  tried on the network first (so you always get the latest while online), kept as you
 *                          open them, and used when the network fails or is slow.
 *  - icons and fonts       kept, and refreshed in the background.
 *
 * Signing out clears everything kept here (see clearOfflineData in offline-support.tsx).
 */

const VERSION = "v1";
const STATIC = `chordbase-static-${VERSION}`;
const PAGES = `chordbase-pages-${VERSION}`;
/** On a slow connection, a page already kept is shown after this long rather than waiting on the network. */
const SLOW_MS = 4000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([STATIC, PAGES]);
      for (const name of await caches.keys()) {
        if (name.startsWith("chordbase-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

/** Pages that are about signing in, and the phone remote (which is checked by a PIN), are never kept. */
const NEVER = [/^\/r\//, /^\/auth\//, /^\/login/, /^\/forgot-password/, /^\/reset-password/];

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (NEVER.some((re) => re.test(url.pathname))) return;

  // Next asks for just the outline of a page ahead of time; keeping that would overwrite the full page.
  if (request.headers.has("Next-Router-Prefetch") || request.headers.has("Next-Router-Segment-Prefetch")) return;

  const isPage = request.mode === "navigate" || request.headers.get("RSC") === "1" || url.searchParams.has("_rsc");
  if (isPage) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (/\.(?:svg|png|jpe?g|webp|ico|woff2?)$/.test(url.pathname) || url.pathname === "/manifest.webmanifest") {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  const fresh = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => undefined);
  return hit ?? (await fresh) ?? new Response("", { status: 503 });
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("slow")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(PAGES);
  const kept = () => cache.match(request, { ignoreVary: true }).then((hit) => hit ?? (request.mode === "navigate" ? cache.match(request.url, { ignoreVary: true }) : undefined));
  const have = await kept();
  try {
    const network = fetch(request);
    // With a copy already kept, don't make anyone wait on a slow connection.
    const response = await (have ? withTimeout(network, SLOW_MS) : network);
    // A redirect usually means "sign in first": never keep that as if it were the page.
    if (response.ok && !response.redirected && response.type === "basic") cache.put(request, response.clone());
    return response;
  } catch {
    const hit = have ?? (await kept());
    if (hit) return hit;
    return request.mode === "navigate" ? offlinePage() : new Response("", { status: 503 });
  }
}

function offlinePage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · ChordBase</title>
<style>body{font-family:system-ui,sans-serif;margin:0;min-height:100vh;display:grid;place-items:center;background:#fff;color:#171717;padding:1.5rem}
main{max-width:26rem}h1{font-size:1.5rem;margin:0 0 .5rem}p{line-height:1.6;color:#52525b}
button{font:inherit;padding:.6rem 1rem;border-radius:.4rem;border:1px solid #171717;background:#171717;color:#fff;cursor:pointer}
@media(prefers-color-scheme:dark){body{background:#0a0a0a;color:#ededed}p{color:#a1a1aa}button{background:#ededed;color:#0a0a0a;border-color:#ededed}}</style></head>
<body><main><h1>You're offline</h1><p>This page wasn't saved on this device, so it can't open without a connection. Pages you have opened (and setlists you chose to keep for offline use) still work. Try again when the connection is back.</p>
<button onclick="location.reload()">Try again</button></main></body></html>`;
  return new Response(html, { status: 503, headers: { "content-type": "text/html; charset=utf-8" } });
}

// A page can ask for addresses to be kept ahead of time ("keep this setlist for offline use").
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-urls" || !Array.isArray(data.urls)) return;
  const reply = event.ports && event.ports[0];
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGES);
      let kept = 0;
      await Promise.all(
        data.urls.map(async (address) => {
          try {
            const response = await fetch(address, { credentials: "same-origin" });
            if (response.ok && !response.redirected) {
              await cache.put(address, response);
              kept++;
            }
          } catch {
            // Not reachable right now; it simply isn't kept.
          }
        }),
      );
      if (reply) reply.postMessage({ kept });
    })(),
  );
});

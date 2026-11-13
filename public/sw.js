/* Agent Town service worker — offline shell only.
 * NEVER cache GitHub API responses (api.github.com).
 */
const SHELL_CACHE = 'agent-town-shell-v3';

// Precache is filled at install from the Vite-emitted asset list posted by the page,
// plus a small static allowlist of shell URLs relative to this worker's scope.
const STATIC_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/icon-32.png',
];

function isGitHubApi(url) {
  try {
    const u = new URL(url);
    return u.hostname === 'api.github.com' || u.hostname.endsWith('.github.com');
  } catch {
    return false;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      await cache.addAll(STATIC_SHELL);
      self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || data.type !== 'CACHE_URLS' || !Array.isArray(data.urls)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const sameOrigin = data.urls.filter((u) => {
        try {
          const url = new URL(u, self.location.href);
          return url.origin === self.location.origin && !isGitHubApi(url.href);
        } catch {
          return false;
        }
      });
      await cache.addAll(sameOrigin);
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  // Hard rule: never touch GitHub API traffic.
  if (isGitHubApi(req.url)) return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Pages go to the network first, so a new deploy shows on the next load instead of a stale page;
  // the cached shell is only the offline fallback.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(SHELL_CACHE);
        try {
          const fresh = await fetch(req);
          if (fresh.ok) await cache.put('./index.html', fresh.clone());
          return fresh;
        } catch {
          const fallback = await cache.match('./index.html');
          if (fallback) return fallback;
          throw new Error('offline');
        }
      })(),
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      const cached = await cache.match(req, { ignoreSearch: true });
      if (cached) {
        // Stale-while-revalidate for same-origin shell assets only.
        event.waitUntil(
          fetch(req)
            .then((res) => {
              if (res && res.ok) return cache.put(req, res.clone());
            })
            .catch(() => undefined),
        );
        return cached;
      }
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok && url.protocol.startsWith('http')) {
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        throw new Error('offline');
      }
    })(),
  );
});

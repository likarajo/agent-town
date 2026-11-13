/** Register the shell-only service worker. Never caches GitHub API traffic (enforced in sw.js). */
import { desktop } from './desktop';

export async function registerPwa(): Promise<void> {
  // The desktop app loads from disk, where service workers don't apply.
  if (!('serviceWorker' in navigator) || desktop || window.location.protocol === 'file:') return;

  try {
    const base = new URL(import.meta.env.BASE_URL, window.location.href);

    // The worker caches every same-origin response, which breaks the Vite dev server (stale
    // modules, style.css served as JS). Skipping registration alone would leave an old worker active.
    if (import.meta.env.DEV) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const ours = registrations.filter((r) => r.scope === base.href);
      await Promise.all(ours.map((r) => r.unregister()));
      return;
    }

    const reg = await navigator.serviceWorker.register(new URL('sw.js', base).pathname, {
      scope: base.pathname,
    });

    const cacheBuildAssets = () => {
      const urls: string[] = [];
      document.querySelectorAll('script[src]').forEach((el) => {
        const src = (el as HTMLScriptElement).src;
        if (src) urls.push(src);
      });
      document.querySelectorAll('link[href]').forEach((el) => {
        const href = (el as HTMLLinkElement).href;
        if (href) urls.push(href);
      });
      reg.active?.postMessage({ type: 'CACHE_URLS', urls });
    };

    if (reg.active) cacheBuildAssets();
    navigator.serviceWorker.ready.then(() => cacheBuildAssets());
  } catch (err) {
    console.warn('Service worker registration skipped:', err);
  }
}

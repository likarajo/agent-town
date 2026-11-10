/** Register the shell-only service worker. Never caches GitHub API traffic (enforced in sw.js). */

export async function registerPwa(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;

  const swUrl = new URL('sw.js', import.meta.env.BASE_URL).pathname;

  try {
    const reg = await navigator.serviceWorker.register(swUrl, {
      scope: new URL('.', import.meta.env.BASE_URL).pathname,
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

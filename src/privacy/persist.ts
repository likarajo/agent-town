import { desktop } from '../desktop';

/**
 * Settings are entered once and kept until the user resets them. After every change, ask the
 * browser not to evict this site's storage, and have the desktop app write it to disk right away
 * so a crash or forced quit can't lose it.
 */
export function keepSettings(): void {
  desktop?.flushStorage?.();
  void globalThis.navigator?.storage?.persist?.().catch(() => false);
}

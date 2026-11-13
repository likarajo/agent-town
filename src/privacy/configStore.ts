/**
 * Owner config: which second-brain repo and roster file to read. Stored in localStorage on this
 * device only (or set in the desktop app's `.env`); never baked into the build.
 */
import { desktop } from '../desktop';
import { keepSettings } from './persist';

export interface OwnerConfig {
  /** owner/name of the second-brain repo. */
  secondBrainRepo: string;
  /** GitHub link to the roster file, or a path inside the second-brain repo. */
  rosterUrl: string;
}

const CONFIG_KEY = 'agent-town.owner.config';

/** What Settings saved on this device, ignoring any desktop `.env` values. */
export function getStoredOwnerConfig(): OwnerConfig {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIG_KEY) ?? '{}') as Record<string, unknown>;
    const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
    // Before the roster existed, the repo was saved as `wikiRepo` with a `your-user/` placeholder.
    const legacyRepo = text(parsed.wikiRepo).startsWith('your-user/') ? '' : text(parsed.wikiRepo);
    return {
      secondBrainRepo: text(parsed.secondBrainRepo) || legacyRepo,
      rosterUrl: text(parsed.rosterUrl),
    };
  } catch {
    return { secondBrainRepo: '', rosterUrl: '' };
  }
}

/** Fields the desktop `.env` sets; Settings shows them read-only. */
export function envLockedFields(): Record<keyof OwnerConfig, boolean> {
  return {
    secondBrainRepo: Boolean(desktop?.secondBrainRepo),
    rosterUrl: Boolean(desktop?.rosterUrl),
  };
}

export function getOwnerConfig(): OwnerConfig {
  const stored = getStoredOwnerConfig();
  return {
    secondBrainRepo: desktop?.secondBrainRepo || stored.secondBrainRepo,
    rosterUrl: desktop?.rosterUrl || stored.rosterUrl,
  };
}

export function setOwnerConfig(config: OwnerConfig): void {
  localStorage.setItem(
    CONFIG_KEY,
    JSON.stringify({ secondBrainRepo: config.secondBrainRepo.trim(), rosterUrl: config.rosterUrl.trim() }),
  );
  keepSettings();
}

export function resetOwnerConfig(): void {
  localStorage.removeItem(CONFIG_KEY);
  keepSettings();
}

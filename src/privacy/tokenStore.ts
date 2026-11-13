import { desktop } from '../desktop';
import { keepSettings } from './persist';

const TOKEN_KEY = 'agent-town.github.token';

/** `env`: the desktop app's `.env` file. `device`: pasted into Settings (localStorage). */
export type TokenSource = 'env' | 'device';

function getStoredToken(): string | null {
  try {
    const value = localStorage.getItem(TOKEN_KEY);
    return value && value.trim() ? value.trim() : null;
  } catch {
    return null;
  }
}

export function getTokenSource(): TokenSource | null {
  if (desktop?.githubToken) return 'env';
  return getStoredToken() ? 'device' : null;
}

export function getToken(): string | null {
  return desktop?.githubToken || getStoredToken();
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token.trim());
  keepSettings();
}

export function forgetToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  keepSettings();
}

export function hasToken(): boolean {
  return Boolean(getToken());
}

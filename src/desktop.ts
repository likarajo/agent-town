/** Values the desktop app's preload script exposes from the `.env` file next to the app. */
export interface DesktopConfig {
  platform: string;
  /** The `.env` file that was read, or null when none was found. */
  envFile: string | null;
  /** Every place the app looked for `.env`, in order. */
  envSearchPaths: string[];
  githubToken: string | null;
  secondBrainRepo: string | null;
  rosterUrl: string | null;
  /** Write saved settings (localStorage) to disk now instead of at the next idle flush. */
  flushStorage?: () => void;
}

declare global {
  interface Window {
    agentTownDesktop?: DesktopConfig;
  }
}

export const desktop: DesktopConfig | null =
  typeof window === 'undefined' ? null : (window.agentTownDesktop ?? null);

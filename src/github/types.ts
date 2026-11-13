/** Shared activity model for sample + live GitHub sources. */
import type { TownBuilding } from '../town/types';

export interface OpenPrSummary {
  title: string;
  number: number;
  updatedAt: string;
  /** Display label only — sample uses fake names; live uses the roster's repos. */
  repoLabel: string;
  url?: string;
}

export interface CommitSummary {
  message: string;
  sha: string;
  date: string;
  repoLabel: string;
  url?: string;
}

export interface WikiExcerpt {
  title: string;
  markdown: string;
}

export interface BuildingActivity {
  buildingId: string;
  openPrs: OpenPrSummary[];
  recentCommits: CommitSummary[];
  wikiExcerpt: WikiExcerpt | null;
  cues: {
    hasOpenPrs: boolean;
    hasRecentCommits: boolean;
  };
  /** True when this payload is clearly labelled placeholder/sample content. */
  isSample: boolean;
  /** Set when some live reads failed; whatever did load is still shown. */
  error?: string;
}

export type DataMode = 'sample' | 'live';

export interface TownDataSource {
  readonly mode: DataMode;
  getActivity(building: TownBuilding): Promise<BuildingActivity>;
}

/** Paths that must never be fetched or displayed (privacy hard rule). */
export const BLOCKED_WIKI_PREFIXES = ['immigration/', 'finance/', 'health/', 'relationships/'] as const;

export function isBlockedWikiPath(path: string): boolean {
  const normalized = path.replace(/^\/+/, '').toLowerCase();
  return BLOCKED_WIKI_PREFIXES.some(
    (prefix) => normalized === prefix.slice(0, -1) || normalized.startsWith(prefix),
  );
}

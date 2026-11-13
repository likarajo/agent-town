import type { BuildingType } from './catalog';

export type { BuildingType };

export interface TownBuilding {
  id: string;
  name: string;
  role: string;
  buildingType: BuildingType;
  label: string;
  q: number;
  r: number;
  accent: string;
  /** Second-brain section folder the bot owns, or '' when it has none. */
  wikiSection: string;
  /** GitHub repos (owner/name) whose PRs and commits show on this building. */
  repos: string[];
  /** Set on grey stand-ins for a roster that is loading or failed; shown on hover. */
  placeholderReason?: string;
}

export interface Ground {
  cols: number;
  rows: number;
  tileW: number;
  tileH: number;
}

export interface TownData {
  ground: Ground;
  buildings: TownBuilding[];
}

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

export interface ActivityCue {
  hasOpenPrs: boolean;
  hasRecentCommits: boolean;
  isSample: boolean;
  /** Why some of this bot's data didn't load; the building turns grey and shows it on hover. */
  error?: string;
}

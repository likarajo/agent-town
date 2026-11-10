export type BuildingType =
  | 'workshop'
  | 'printshop'
  | 'lab'
  | 'realty'
  | 'depot'
  | 'townhall'
  | 'bank'
  | 'consulate'
  | 'gym'
  | 'plaza';

export interface TownBuilding {
  id: string;
  name: string;
  role: string;
  buildingType: BuildingType;
  label: string;
  q: number;
  r: number;
  accent: string;
  wikiSectionPlaceholder: string;
}

export interface TownData {
  version: number;
  title: string;
  privacyNote: string;
  ground: {
    cols: number;
    rows: number;
    tileW: number;
    tileH: number;
  };
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
}

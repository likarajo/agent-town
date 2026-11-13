/**
 * The fixed building catalog. A bot's building comes only from its own roster row (the Building
 * value picks one of these), so the same row always gets the same look, colour and plot.
 */

type Plot = readonly [number, number];

export const GROUND = { cols: 17, rows: 17, tileW: 64, tileH: 32 } as const;

export const ARCHITECTURE = {
  plaza: { label: 'Central Plaza', accent: '#c4a35a', plot: [8, 8] },
  townhall: { label: 'Town Hall', accent: '#6b8cae', plot: [4, 1] },
  workshop: { label: 'Workshop', accent: '#d17a4a', plot: [1, 4] },
  printshop: { label: 'Print Shop', accent: '#c76b8a', plot: [9, 1] },
  lab: { label: 'Lab', accent: '#5aa8a0', plot: [1, 9] },
  realty: { label: 'Realty Office', accent: '#8a9a5b', plot: [14, 6] },
  depot: { label: 'Supply Depot', accent: '#b08d57', plot: [10, 14] },
  bank: { label: 'Bank', accent: '#7a6bb0', plot: [13, 13] },
  consulate: { label: 'Consulate', accent: '#4a7c9b', plot: [6, 14] },
  gym: { label: 'Gym', accent: '#c45c5c', plot: [14, 10] },
  /** Any Building value not listed above. */
  generic: { label: 'Office', accent: '#a3916b', plot: null },
} as const satisfies Record<string, { label: string; accent: string; plot: Plot | null }>;

export type BuildingType = keyof typeof ARCHITECTURE;

/** Plots for bots whose building type is taken by an earlier row, or has no home plot. */
export const SPARE_PLOTS: readonly Plot[] = [
  [12, 2],
  [2, 12],
  [11, 5],
  [5, 11],
  [5, 5],
  [15, 1],
  [1, 15],
  [16, 16],
];

/** The one stand-in look: shown while the roster loads and wherever something failed to load. */
export const PLACEHOLDER_ACCENT = '#8b9196';

import { BUILDING_SCALE, type Design } from '../buildings';
import type { Ground, TownBuilding } from '../types';

/** Metres per map tile. */
export const TILE = 10;
/** Metres per pixel of design height: the 2D designs measure height in pixels. */
export const METRES_PER_PX = 0.3;
/** A design's units in metres at the size buildings are drawn: tiles across, pixels up. */
export const UNIT = { across: TILE * BUILDING_SCALE, up: METRES_PER_PX * BUILDING_SCALE } as const;

/** The middle of tile (q, r) in world space: x runs along q, z along r, and y is up. */
export function tileToWorld(q: number, r: number): { x: number; z: number } {
  return { x: (q + 0.5) * TILE, z: (r + 0.5) * TILE };
}

export function islandSize(ground: Ground): { width: number; depth: number } {
  return { width: ground.cols * TILE, depth: ground.rows * TILE };
}

export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  /** Height of the tallest part, in metres. */
  height: number;
}

/** The box a building stands in, for collisions, picking and labels. */
export function footprintOf(building: TownBuilding, design: Design): Footprint {
  const { x, z } = tileToWorld(building.q, building.r);
  const hx = design.extent[0] * UNIT.across;
  const hz = design.extent[1] * UNIT.across;
  return { minX: x - hx, maxX: x + hx, minZ: z - hz, maxZ: z + hz, height: design.height * UNIT.up };
}

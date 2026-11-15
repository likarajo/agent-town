import type { TownData } from './types';

/**
 * Streets, trees and walking routes for a town. Everything here comes from the buildings' plots,
 * so the same roster always gets the same streets and the same trees, on every device.
 */

export interface Tile {
  q: number;
  r: number;
}

export type Direction = 'q+' | 'q-' | 'r+' | 'r-';

export interface RoadTile extends Tile {
  links: Direction[];
}

export type DecorationKind = 'tree' | 'pine' | 'bush' | 'flowers' | 'lamp' | 'bench';

/** q and r are fractional so things don't line up on the grid. */
export interface Decoration extends Tile {
  kind: DecorationKind;
  variant: number;
}

export interface TownLayout {
  /** Where every street leads: the plaza, or the middle of the ground when there is none. */
  hub: Tile;
  hasPlaza: boolean;
  roads: RoadTile[];
  decorations: Decoration[];
  /** Each building's route to the hub, one tile at a time, from its own tile to the hub's. */
  paths: Record<string, Tile[]>;
}

/** Tiles kept clear in front of each building so its name label stays readable. */
const LABEL_CLEARANCE: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [1, 2],
  [2, 2],
];

export const PLAZA_RADIUS = 1.35;

const key = (q: number, r: number) => `${q},${r}`;

/** Repeatable noise in [0, 1) for a tile and a purpose (`salt`). */
export function tileNoise(q: number, r: number, salt: number): number {
  let h = Math.imul(q | 0, 374761393) + Math.imul(r | 0, 668265263) + Math.imul(salt | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function lPath(from: Tile, to: Tile, qFirst: boolean): Tile[] {
  const path: Tile[] = [{ q: from.q, r: from.r }];
  let { q, r } = from;
  const alongQ = () => {
    while (q !== to.q) path.push({ q: (q += Math.sign(to.q - q)), r });
  };
  const alongR = () => {
    while (r !== to.r) path.push({ q, r: (r += Math.sign(to.r - r)) });
  };
  if (qFirst) {
    alongQ();
    alongR();
  } else {
    alongR();
    alongQ();
  }
  return path;
}

function direction(from: Tile, to: Tile): Direction {
  if (to.q !== from.q) return to.q > from.q ? 'q+' : 'q-';
  return to.r > from.r ? 'r+' : 'r-';
}

/** A busy bot out walking: where it is (in tiles), which way it's heading, and whether it's moving. */
export interface WalkerSpot extends Tile {
  moving: boolean;
  /** Unit direction of travel, in tiles. */
  dq: number;
  dr: number;
}

/** Tiles per millisecond, and the pause (ms) at each end of the walk. */
const WALK_SPEED = 0.0006;
const WALK_PAUSE = 1400;

const lerpTile = (a: Tile, b: Tile, t: number): Tile => ({ q: a.q + (b.q - a.q) * t, r: a.r + (b.r - a.r) * t });

/**
 * Where a busy bot is, `now` ms in, on its walk from its door to the plaza and back along its
 * street (`path`, from the layout). It keeps to the right-hand side of the street. `phase` (0–1)
 * staggers the bots so they don't all set off together.
 */
export function walkerPosition(path: Tile[], now: number, phase: number, toPlaza: boolean): WalkerSpot | null {
  if (path.length < 2) return null;
  const pts = path.map((t) => ({ q: t.q, r: t.r }));
  pts[0] = lerpTile(pts[0], pts[1], 0.45);
  if (toPlaza) pts[pts.length - 1] = lerpTile(pts[pts.length - 1], pts[pts.length - 2], 0.9);
  const segments = pts.slice(1).map((pt, i) => Math.hypot(pt.q - pts[i].q, pt.r - pts[i].r));
  const length = segments.reduce((s, l) => s + l, 0);
  const travel = length / WALK_SPEED;
  const cycle = 2 * (travel + WALK_PAUSE);
  const t = (((now + phase * cycle) % cycle) + cycle) % cycle;
  const outward = t < cycle / 2;
  const along = outward
    ? Math.min(length, Math.max(0, (t - WALK_PAUSE) * WALK_SPEED))
    : Math.max(0, length - Math.max(0, (t - cycle / 2 - WALK_PAUSE) * WALK_SPEED));
  let rest = along;
  let i = 0;
  while (i < segments.length - 1 && rest > segments[i]) rest -= segments[i++];
  const a = pts[i];
  const b = pts[i + 1];
  const pos = lerpTile(a, b, segments[i] ? rest / segments[i] : 0);
  const sign = outward ? 1 : -1;
  const dq = ((b.q - a.q) / (segments[i] || 1)) * sign;
  const dr = ((b.r - a.r) / (segments[i] || 1)) * sign;
  return { q: pos.q + dr * 0.11, r: pos.r - dq * 0.11, moving: along > 0 && along < length, dq, dr };
}

/** The plaza's own bot strolls round the fountain instead. */
export function strollPosition(hub: Tile, now: number, phase: number): WalkerSpot {
  const angle = now / 4000 + phase * Math.PI * 2;
  return { q: hub.q + Math.cos(angle) * 0.75, r: hub.r + Math.sin(angle) * 0.75, moving: true, dq: -Math.sin(angle), dr: Math.cos(angle) };
}

export function layoutTown(town: TownData): TownLayout {
  const { cols, rows } = town.ground;
  const plaza = town.buildings.find((b) => b.buildingType === 'plaza');
  const hub: Tile = plaza ? { q: plaza.q, r: plaza.r } : { q: Math.floor(cols / 2), r: Math.floor(rows / 2) };
  const isHub = (t: Tile) => t.q === hub.q && t.r === hub.r;
  const occupied = new Set(town.buildings.map((b) => key(b.q, b.r)));

  const links = new Map<string, Set<Direction>>();
  const paths: Record<string, Tile[]> = {};
  for (const b of town.buildings) {
    if (isHub(b)) continue;
    // Prefer the L-shaped route that crosses fewer other buildings' plots.
    const blocked = (path: Tile[]) => path.slice(1, -1).filter((t) => occupied.has(key(t.q, t.r))).length;
    const qFirst = lPath(b, hub, true);
    const rFirst = lPath(b, hub, false);
    const path = blocked(rFirst) < blocked(qFirst) ? rFirst : qFirst;
    paths[b.id] = path;

    path.forEach((t, i) => {
      if (occupied.has(key(t.q, t.r)) || isHub(t)) return;
      const tileLinks = links.get(key(t.q, t.r)) ?? new Set<Direction>();
      if (i > 0) tileLinks.add(direction(t, path[i - 1]));
      if (i < path.length - 1) tileLinks.add(direction(t, path[i + 1]));
      links.set(key(t.q, t.r), tileLinks);
    });
  }

  const roads: RoadTile[] = [...links.entries()]
    .map(([k, set]) => {
      const [q, r] = k.split(',').map(Number);
      return { q, r, links: [...set].sort() };
    })
    .sort((a, b) => a.q + a.r - (b.q + b.r) || a.q - b.q);

  const nearPlaza = (q: number, r: number, extra: number) =>
    Boolean(plaza) && Math.hypot(q - hub.q, r - hub.r) < PLAZA_RADIUS + extra;

  const reserved = new Set(occupied);
  for (const b of town.buildings) {
    for (const [dq, dr] of LABEL_CLEARANCE) reserved.add(key(b.q + dq, b.r + dr));
  }

  const decorations: Decoration[] = [];
  for (const road of roads) {
    if (nearPlaza(road.q, road.r, 0.3) || tileNoise(road.q, road.r, 5) >= 0.4) continue;
    // A lamp at the kerb, beside the street rather than in it.
    const alongQ = road.links.some((l) => l[0] === 'q');
    decorations.push({ kind: 'lamp', q: road.q + (alongQ ? 0 : 0.34), r: road.r + (alongQ ? 0.34 : 0), variant: 0 });
  }
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const k = key(q, r);
      if (reserved.has(k) || links.has(k) || nearPlaza(q, r, 0.55)) continue;
      const n = tileNoise(q, r, 1);
      const edge = q === 0 || r === 0 || q === cols - 1 || r === rows - 1;
      const kind: DecorationKind | null =
        n < (edge ? 0.5 : 0.22)
          ? 'tree'
          : n < (edge ? 0.62 : 0.3)
            ? 'pine'
            : n < (edge ? 0.66 : 0.38)
              ? 'bush'
              : n < (edge ? 0.68 : 0.43)
                ? 'flowers'
                : null;
      if (!kind) continue;
      decorations.push({
        kind,
        q: q + (tileNoise(q, r, 2) - 0.5) * 0.36,
        r: r + (tileNoise(q, r, 3) - 0.5) * 0.36,
        variant: Math.floor(tileNoise(q, r, 4) * 3),
      });
    }
  }
  if (plaza) {
    // Benches round the fountain, but none in front, where the plaza's label sits.
    for (const [dq, dr] of [
      [0.95, -0.95],
      [-0.95, 0.95],
      [-0.95, -0.95],
    ]) {
      decorations.push({ kind: 'bench', q: hub.q + dq, r: hub.r + dr, variant: dq === dr ? 0 : 1 });
    }
  }

  return { hub, hasPlaza: Boolean(plaza), roads, decorations, paths };
}

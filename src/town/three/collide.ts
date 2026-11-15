/**
 * Walking physics for the first-person view, in metres on the ground plane (x, z). Pure, so it can
 * be tested without a renderer.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/** Something round you can't walk through: a tree trunk or a lamp post. */
export interface Post {
  x: number;
  z: number;
  r: number;
}

export interface Obstacles {
  /** Building footprints. */
  rects: Rect[];
  posts: Post[];
  /** The edge of the island. */
  bounds: Rect;
}

export const GRAVITY = 18;
export const JUMP_SPEED = 6.2;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function outOfRect(x: number, z: number, radius: number, rect: Rect): [number, number] {
  const cx = clamp(x, rect.minX, rect.maxX);
  const cz = clamp(z, rect.minZ, rect.maxZ);
  const dx = x - cx;
  const dz = z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= radius * radius) return [x, z];
  if (d2 > 1e-12) {
    const d = Math.sqrt(d2);
    return [cx + (dx / d) * radius, cz + (dz / d) * radius];
  }
  // The centre is inside the rectangle: leave by the nearest side.
  const sides: Array<[number, [number, number]]> = [
    [x - rect.minX, [rect.minX - radius, z]],
    [rect.maxX - x, [rect.maxX + radius, z]],
    [z - rect.minZ, [x, rect.minZ - radius]],
    [rect.maxZ - z, [x, rect.maxZ + radius]],
  ];
  return sides.reduce((best, side) => (side[0] < best[0] ? side : best))[1];
}

function outOfPost(x: number, z: number, radius: number, post: Post): [number, number] {
  const dx = x - post.x;
  const dz = z - post.z;
  const reach = radius + post.r;
  const d2 = dx * dx + dz * dz;
  if (d2 >= reach * reach) return [x, z];
  const d = Math.sqrt(d2) || 1e-6;
  return [post.x + (dx / d) * reach, post.z + (dz / d) * reach];
}

/**
 * Move a walker (a circle of `radius`) by (dx, dz). Running into a wall slides along it instead of
 * stopping dead, and the island's edge holds like a wall. Long moves go in short steps so they
 * can't tunnel through a thin wall.
 */
export function moveCircle(
  x: number,
  z: number,
  dx: number,
  dz: number,
  radius: number,
  obstacles: Obstacles,
): { x: number; z: number } {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (radius * 0.5)));
  const { bounds } = obstacles;
  for (let i = 0; i < steps; i++) {
    x += dx / steps;
    z += dz / steps;
    for (const rect of obstacles.rects) [x, z] = outOfRect(x, z, radius, rect);
    for (const post of obstacles.posts) [x, z] = outOfPost(x, z, radius, post);
    x = clamp(x, bounds.minX + radius, bounds.maxX - radius);
    z = clamp(z, bounds.minZ + radius, bounds.maxZ - radius);
  }
  return { x, z };
}

/** A spot to stand near (x, z): pushed out of any building or post it falls inside. */
export function freeSpot(x: number, z: number, radius: number, obstacles: Obstacles): { x: number; z: number } {
  return moveCircle(x, z, 0, 0, radius, obstacles);
}

/** One step of jumping and falling. The ground is at height 0; you can't climb onto roofs. */
export function stepVertical(y: number, vy: number, dt: number): { y: number; vy: number; grounded: boolean } {
  const nextVy = vy - GRAVITY * dt;
  const nextY = y + nextVy * dt;
  if (nextY <= 0) return { y: 0, vy: 0, grounded: true };
  return { y: nextY, vy: nextVy, grounded: false };
}

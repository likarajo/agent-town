import { describe, expect, it } from 'vitest';
import { freeSpot, JUMP_SPEED, moveCircle, stepVertical, type Obstacles } from './collide';

const R = 0.35;
const world: Obstacles = {
  rects: [{ minX: 10, maxX: 20, minZ: 10, maxZ: 20 }],
  posts: [{ x: 40, z: 40, r: 0.5 }],
  bounds: { minX: 0, maxX: 100, minZ: 0, maxZ: 100 },
};

describe('moveCircle', () => {
  it('walks freely where nothing is in the way', () => {
    const { x, z } = moveCircle(50, 50, 3, -2, R, world);
    expect(x).toBeCloseTo(53);
    expect(z).toBeCloseTo(48);
  });

  it('stops at a wall instead of walking into the building', () => {
    const { x } = moveCircle(5, 15, 10, 0, R, world);
    expect(x).toBeCloseTo(10 - R);
  });

  it('slides along a wall when walking into it at an angle', () => {
    const { x, z } = moveCircle(5, 15, 8, 4, R, world);
    expect(x).toBeCloseTo(10 - R);
    expect(z).toBeCloseTo(19);
  });

  it("can't tunnel through a building in one long step", () => {
    const { x } = moveCircle(5, 15, 30, 0, R, world);
    expect(x).toBeLessThan(10);
  });

  it('goes round posts such as tree trunks', () => {
    const { x, z } = moveCircle(38, 40, 2, 0, R, world);
    expect(Math.hypot(x - 40, z - 40)).toBeGreaterThanOrEqual(0.5 + R - 1e-9);
  });

  it('holds at the edge of the island', () => {
    expect(moveCircle(98, 2, 10, -10, R, world)).toEqual({ x: 100 - R, z: R });
  });
});

describe('freeSpot', () => {
  it('moves a spot inside a building out through its nearest wall', () => {
    expect(freeSpot(11, 15, R, world)).toEqual({ x: 10 - R, z: 15 });
  });
});

describe('stepVertical', () => {
  it('jumps, rises, falls and lands back on the ground', () => {
    let state = { y: 0, vy: JUMP_SPEED, grounded: false };
    let highest = 0;
    for (let i = 0; i < 200 && !(i > 0 && state.grounded); i++) {
      state = stepVertical(state.y, state.vy, 1 / 60);
      highest = Math.max(highest, state.y);
    }
    expect(highest).toBeGreaterThan(0.8);
    expect(state).toEqual({ y: 0, vy: 0, grounded: true });
  });

  it('stays on the ground when standing still', () => {
    expect(stepVertical(0, 0, 1 / 60)).toEqual({ y: 0, vy: 0, grounded: true });
  });
});

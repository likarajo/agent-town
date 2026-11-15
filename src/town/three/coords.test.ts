import { describe, expect, it } from 'vitest';
import { designOf } from '../buildings';
import { buildTown } from '../../roster/town';
import { footprintOf, TILE, tileToWorld, UNIT } from './coords';

describe('footprintOf', () => {
  it('puts each building in the middle of its own plot', () => {
    const town = buildTown([
      { name: 'Atlas', job: '', building: 'townhall', section: '', repos: [] },
      { name: 'Forge', job: '', building: 'workshop', section: '', repos: [] },
    ]);
    for (const b of town.buildings) {
      const f = footprintOf(b, designOf(b.buildingType));
      const { x, z } = tileToWorld(b.q, b.r);
      expect((f.minX + f.maxX) / 2).toBeCloseTo(x);
      expect((f.minZ + f.maxZ) / 2).toBeCloseTo(z);
      expect(f.minX).toBeGreaterThanOrEqual(b.q * TILE - 0.2);
      expect(f.maxX).toBeLessThanOrEqual((b.q + 1) * TILE + 0.2);
      expect(f.height).toBeCloseTo(designOf(b.buildingType).height * UNIT.up);
    }
  });

  it('uses the town hall plot from the catalog (q 4, r 1)', () => {
    expect(tileToWorld(4, 1)).toEqual({ x: 45, z: 15 });
  });
});

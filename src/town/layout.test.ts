import { describe, expect, it } from 'vitest';
import { buildTown } from '../roster/town';
import type { RosterBot } from '../roster/parse';
import { layoutTown, strollPosition, walkerPosition } from './layout';

const bot = (name: string, building: string): RosterBot => ({ name, job: '', building, section: '', repos: [] });

const roster = [
  bot('Juno', 'plaza'),
  bot('Atlas', 'townhall'),
  bot('Forge', 'workshop'),
  bot('Quill', 'printshop'),
  bot('Beacon', 'lab'),
  bot('Scout', 'realty'),
  bot('Pantry', 'depot'),
  bot('Pip', 'kiosk'),
];

const key = (t: { q: number; r: number }) => `${t.q},${t.r}`;

describe('layoutTown', () => {
  const town = buildTown(roster);
  const layout = layoutTown(town);
  const plots = new Set(town.buildings.map(key));

  it('leads every street to the plaza', () => {
    const plaza = town.buildings.find((b) => b.buildingType === 'plaza')!;
    expect(layout.hub).toEqual({ q: plaza.q, r: plaza.r });
    expect(layout.hasPlaza).toBe(true);
    for (const b of town.buildings) {
      if (b === plaza) continue;
      const path = layout.paths[b.id];
      expect(path[0]).toEqual({ q: b.q, r: b.r });
      expect(path[path.length - 1]).toEqual(layout.hub);
      for (let i = 1; i < path.length; i++) {
        expect(Math.abs(path[i].q - path[i - 1].q) + Math.abs(path[i].r - path[i - 1].r)).toBe(1);
      }
    }
  });

  it('never puts a street on a building plot', () => {
    for (const road of layout.roads) expect(plots.has(key(road))).toBe(false);
  });

  it('keeps trees off plots, streets and the space for name labels', () => {
    const roads = new Set(layout.roads.map(key));
    for (const d of layout.decorations) {
      if (d.kind === 'lamp' || d.kind === 'bench') continue;
      const tile = { q: Math.round(d.q), r: Math.round(d.r) };
      expect(plots.has(key(tile))).toBe(false);
      expect(roads.has(key(tile))).toBe(false);
      for (const b of town.buildings) {
        expect([key({ q: b.q + 1, r: b.r + 1 }), key({ q: b.q + 2, r: b.r + 2 })]).not.toContain(key(tile));
      }
    }
  });

  it('draws the same streets and trees whatever order the roster lists the bots in', () => {
    const reversed = layoutTown(buildTown([...roster].reverse()));
    expect(new Set(reversed.roads.map((r) => `${key(r)}:${r.links.join('')}`))).toEqual(
      new Set(layout.roads.map((r) => `${key(r)}:${r.links.join('')}`)),
    );
    expect(reversed.decorations).toEqual(layout.decorations);
  });

  it('walks a busy bot out to the plaza, pauses, and walks it back', () => {
    const path = [
      { q: 0, r: 0 },
      { q: 1, r: 0 },
      { q: 2, r: 0 },
      { q: 3, r: 0 },
    ];
    const start = walkerPosition(path, 0, 0, true)!;
    expect(start.moving).toBe(false);
    expect(start.q).toBeCloseTo(0.45);
    const out = walkerPosition(path, 3000, 0, true)!;
    expect(out.moving).toBe(true);
    expect(out.q).toBeGreaterThan(start.q);
    expect(out.dq).toBe(1);
    // Halfway through the cycle it is at the plaza end, then heads home.
    const back = walkerPosition(path, 7000, 0, true)!;
    expect(back.dq).toBe(-1);
    expect(Math.max(...[start, out, back].map((s) => s.q))).toBeLessThanOrEqual(2.1 + 1e-9);
  });

  it('keeps walkers to their side of the street and the plaza bot near the fountain', () => {
    const spot = walkerPosition([{ q: 0, r: 0 }, { q: 4, r: 0 }], 3000, 0, false)!;
    expect(spot.r).toBeCloseTo(-0.11);
    const stroll = strollPosition({ q: 8, r: 8 }, 1234, 0.3);
    expect(Math.hypot(stroll.q - 8, stroll.r - 8)).toBeCloseTo(0.75);
  });

  it('has no walk for a building with no street', () => {
    expect(walkerPosition([{ q: 8, r: 8 }], 0, 0, true)).toBeNull();
  });

  it('meets in the middle of the ground when there is no plaza', () => {
    const noPlaza = layoutTown(buildTown([bot('Atlas', 'townhall'), bot('Forge', 'workshop')]));
    expect(noPlaza.hasPlaza).toBe(false);
    expect(noPlaza.hub).toEqual({ q: 8, r: 8 });
    expect(noPlaza.decorations.some((d) => d.kind === 'bench')).toBe(false);
  });
});

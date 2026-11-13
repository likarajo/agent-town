import { describe, expect, it } from 'vitest';
import { ARCHITECTURE, GROUND, PLACEHOLDER_ACCENT } from '../town/catalog';
import type { TownData } from '../town/types';
import type { RosterBot } from './parse';
import { buildTown, placeholderTown } from './town';

function bot(name: string, building = '', extra: Partial<RosterBot> = {}): RosterBot {
  return { name, job: '', building, section: '', repos: [], ...extra };
}

/** id → [architecture, accent, q, r]: everything that makes a bot's building look the way it does. */
function spots(town: TownData): Record<string, [string, string, number, number]> {
  return Object.fromEntries(town.buildings.map((b) => [b.id, [b.buildingType, b.accent, b.q, b.r]]));
}

const team = [
  bot('Juno', 'plaza'),
  bot('Atlas', 'townhall'),
  bot('Forge', 'workshop'),
  bot('Kit', 'workshop'),
  bot('Quill', 'printshop'),
  bot('Nova', 'observatory'),
  bot('Pip'),
];

describe('buildTown', () => {
  it('takes the look, colour and plot from the fixed catalog and carries roster fields over', () => {
    const town = buildTown([bot('Juno', 'plaza', { job: 'Coordinator', section: 'inbox', repos: ['me/tools'] })]);
    expect(town.buildings).toEqual([
      {
        id: 'juno',
        name: 'Juno',
        role: 'Coordinator',
        buildingType: 'plaza',
        label: 'Central Plaza',
        q: 8,
        r: 8,
        accent: ARCHITECTURE.plaza.accent,
        wikiSection: 'inbox',
        repos: ['me/tools'],
      },
    ]);
  });

  it('draws the same town every time for the same roster', () => {
    expect(buildTown(team)).toEqual(buildTown(team.map((b) => ({ ...b }))));
  });

  it('ignores row order when no two rows share a building type', () => {
    const unique = team.filter((b) => b.name !== 'Kit');
    const shuffled = [unique[5], unique[0], unique[4], unique[3], unique[2], unique[1]];
    expect(spots(buildTown(shuffled))).toEqual(spots(buildTown(unique)));
  });

  it("gives a shared building type's home plot to the earlier row, and the same look to both", () => {
    const home = [...ARCHITECTURE.workshop.plot];
    const forgeFirst = spots(buildTown([bot('Forge', 'workshop'), bot('Kit', 'workshop')]));
    const kitFirst = spots(buildTown([bot('Kit', 'workshop'), bot('Forge', 'workshop')]));
    expect(forgeFirst.forge.slice(2)).toEqual(home);
    expect(forgeFirst.kit.slice(2)).not.toEqual(home);
    expect(kitFirst.kit.slice(2)).toEqual(home);
    expect([forgeFirst.kit[0], forgeFirst.kit[1]]).toEqual(['workshop', ARCHITECTURE.workshop.accent]);
  });

  it("doesn't move a bot when other rows are added or removed", () => {
    const before = spots(buildTown(team));
    const fewer = spots(buildTown(team.filter((b) => b.name !== 'Atlas' && b.name !== 'Quill')));
    const more = spots(buildTown([...team, bot('Zed', 'gym'), bot('Yara', 'bank')]));
    for (const id of ['juno', 'forge', 'kit', 'nova', 'pip']) {
      expect(fewer[id]).toEqual(before[id]);
      expect(more[id]).toEqual(before[id]);
    }
  });

  it('gives unknown and missing building types the one generic look, labelled with their value', () => {
    const [nova, pip] = buildTown([bot('Nova', 'observatory'), bot('Pip')]).buildings;
    expect([nova.buildingType, nova.label, nova.accent]).toEqual(['generic', 'Observatory', ARCHITECTURE.generic.accent]);
    expect([pip.buildingType, pip.label, pip.accent]).toEqual(['generic', 'Office', ARCHITECTURE.generic.accent]);
  });

  it('ignores building names that only exist on Object.prototype', () => {
    const [building] = buildTown([bot('Proto', 'constructor')]).buildings;
    expect([building.buildingType, building.label]).toEqual(['generic', 'Constructor']);
  });

  it('gives every bot a unique id', () => {
    const ids = buildTown([bot('Pip!', 'lab'), bot('pip'), bot('Pip', 'depot')]).buildings.map((b) => b.id);
    expect(ids).toEqual(['pip', 'pip-2', 'pip-3']);
  });

  it('never stacks two buildings, and widens the ground when the map is full', () => {
    const town = buildTown(Array.from({ length: 30 }, (_, i) => bot(`Bot ${i}`, 'workshop')));
    expect(new Set(town.buildings.map((b) => `${b.q},${b.r}`)).size).toBe(30);
    expect(town.ground.cols).toBeGreaterThan(Math.max(...town.buildings.map((b) => b.q)));
    expect(GROUND.cols).toBe(17);
  });
});

describe('placeholderTown', () => {
  it('puts one unnamed grey stand-in on every home plot, each carrying the reason', () => {
    const town = placeholderTown('Token rejected');
    const homes = Object.values(ARCHITECTURE).filter((a) => a.plot).length;
    expect(town.buildings).toHaveLength(homes);
    for (const b of town.buildings) {
      expect([b.name, b.accent, b.placeholderReason]).toEqual(['', PLACEHOLDER_ACCENT, 'Token rejected']);
      expect(ARCHITECTURE[b.buildingType].plot).toEqual([b.q, b.r]);
    }
  });
});

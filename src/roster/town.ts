import { ARCHITECTURE, GROUND, PLACEHOLDER_ACCENT, SPARE_PLOTS, type BuildingType } from '../town/catalog';
import type { Ground, TownBuilding, TownData } from '../town/types';
import type { RosterBot } from './parse';

type Plot = readonly [number, number];

const HOME_PLOTS: Array<[BuildingType, Plot]> = Object.entries(ARCHITECTURE).flatMap(([type, style]) =>
  style.plot ? [[type as BuildingType, style.plot]] : [],
);

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'bot'
  );
}

/** FNV-1a: a stable number from a bot id, the same on every device. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193) >>> 0;
  return h;
}

function titleCase(text: string): string {
  return text.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function architectureOf(building: string): BuildingType {
  return Object.hasOwn(ARCHITECTURE, building) ? (building as BuildingType) : 'generic';
}

/**
 * One building per bot, decided by the bot's own row, so the same roster draws the same town on
 * every device:
 * - the Building value picks the architecture (look, colour, home plot) from the fixed catalog;
 * - if two rows pick the same architecture, the earlier row keeps the home plot;
 * - any other bot gets a spare plot chosen from its name, so adding, removing or reordering other
 *   rows leaves it where it was unless two bots want the same spot.
 */
export function buildTown(bots: RosterBot[]): TownData {
  const key = ([q, r]: Plot) => `${q},${r}`;
  const taken = new Set<string>();
  const ground: Ground = { ...GROUND };
  const ids = new Set<string>();

  const entries = bots.map((bot) => {
    const base = slugify(bot.name);
    let id = base;
    for (let n = 2; ids.has(id); n++) id = `${base}-${n}`;
    ids.add(id);
    return { bot, id, type: architectureOf(bot.building), plot: null as Plot | null };
  });

  for (const entry of entries) {
    const home = ARCHITECTURE[entry.type].plot;
    if (home && !taken.has(key(home))) {
      taken.add(key(home));
      entry.plot = home;
    }
  }

  // Sorted by id so the outcome doesn't depend on row order when two bots want the same spot.
  const homeless = entries.filter((entry) => !entry.plot).sort((a, b) => (a.id < b.id ? -1 : 1));
  let overflow = 0;
  for (const entry of homeless) {
    const start = hash(entry.id) % SPARE_PLOTS.length;
    const candidates = [...SPARE_PLOTS.slice(start), ...SPARE_PLOTS.slice(0, start), ...HOME_PLOTS.map(([, p]) => p)];
    let plot = candidates.find((p) => !taken.has(key(p)));
    if (!plot) {
      plot = [GROUND.cols + 1 + 3 * Math.floor(overflow / 5), 1 + 3 * (overflow % 5)];
      overflow++;
      ground.cols = Math.max(ground.cols, plot[0] + 2);
    }
    taken.add(key(plot));
    entry.plot = plot;
  }

  const buildings = entries.map(({ bot, id, type, plot }): TownBuilding => {
    const style = ARCHITECTURE[type];
    return {
      id,
      name: bot.name,
      role: bot.job,
      buildingType: type,
      label: type === 'generic' && bot.building ? titleCase(bot.building) : style.label,
      q: plot![0],
      r: plot![1],
      accent: style.accent,
      wikiSection: bot.section,
      repos: bot.repos,
    };
  });

  return { ground, buildings };
}

/** Grey stand-ins on every home plot, for a roster that is still loading or failed to load. */
export function placeholderTown(reason: string): TownData {
  const buildings = HOME_PLOTS.map(
    ([type, [q, r]]): TownBuilding => ({
      id: `placeholder-${type}`,
      name: '',
      role: '',
      buildingType: type,
      label: '',
      q,
      r,
      accent: PLACEHOLDER_ACCENT,
      wikiSection: '',
      repos: [],
      placeholderReason: reason,
    }),
  );
  return { ground: { ...GROUND }, buildings };
}

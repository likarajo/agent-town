import { PLACEHOLDER_ACCENT } from './catalog';
import { mixHex, shadeHex } from './color';
import type { Box, Face, Painter, Point } from './paint';
import type { BuildingType } from './types';

/**
 * One fixed design per building type. Each paints around its tile's centre; the renderer adds the
 * open-PR flag at `flag`. Lit windows always mean commits in the last 7 days.
 */
export interface Design {
  /** Footprint half-extents in tiles, along u (q) and v (r). */
  extent: readonly [number, number];
  /** Height of the tallest part above the ground, in px. */
  height: number;
  /** Where the open-PR flagpole stands, as (u, v, z). */
  flag: readonly [number, number, number];
  pole: number;
  paint(p: Painter, accent: string, lit: boolean): void;
}

/** Buildings are drawn a little larger than their designs so they stand out on the island. */
export const BUILDING_SCALE = 1.15;

export const tinted = (accent: string, base: string, amount: number) => mixHex(base, accent, amount);

function middle(quad: Point[]): Point {
  return [quad.reduce((s, q) => s + q[0], 0) / quad.length, quad.reduce((s, q) => s + q[1], 0) / quad.length];
}

function along(b: Box, s: number): number {
  return b.u0 + (b.u1 - b.u0) * s;
}

const plaza: Design = {
  extent: [0.45, 0.45],
  height: 22,
  flag: [0.3, -0.3, 0],
  pole: 34,
  paint(p, accent, lit) {
    const stone = tinted(accent, '#e9e2d3', 0.18);
    const [x, y] = p.at(0, 0, 5);
    const [wx, wy] = p.groundRadii(0.35);
    p.cylinder(0, 0, 0.42, 0, 5, stone);
    const glowing = lit && p.scene.night > 0.05;
    p.ellipse(x, y, wx, wy, glowing ? '#8fd8ff' : p.lit(lit ? '#79c0e8' : '#5f9fc6'));
    p.cylinder(0, 0, 0.06, 5, 15, stone);
    p.cylinder(0, 0, 0.16, 15, 17, stone);
    // Droplets arc from the bowl into the basin.
    p.ctx.fillStyle = glowing ? '#d8f4ff' : p.lit('#e4f3ff');
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      const t = (p.now / 900 + k / 8) % 1;
      const reach = 0.08 + 0.22 * t;
      const [dx, dy] = p.at(Math.cos(angle) * reach, Math.sin(angle) * reach, 17 + 10 * Math.sin(Math.PI * t) - 12 * t);
      p.ctx.fillRect(dx - 0.8, dy - 0.8, 1.6, 1.6);
    }
  },
};

const hall: Box = { u0: -0.4, u1: 0.4, v0: -0.3, v1: 0.3, z0: 0, z1: 26 };
const clockTower: Box = { u0: -0.12, u1: 0.12, v0: -0.12, v1: 0.12, z0: 26, z1: 58 };

function clockFace(p: Painter, quad: Point[]): void {
  const [x, y] = middle(quad);
  p.ellipse(x, y, 3.6, 3.6, p.lit('#fbf7ee'));
  p.ctx.strokeStyle = p.lit('#2d3640');
  p.ctx.lineWidth = 0.9;
  p.ctx.beginPath();
  p.ctx.moveTo(x, y - 2.6);
  p.ctx.lineTo(x, y);
  p.ctx.lineTo(x + 1.9, y + 0.6);
  p.ctx.stroke();
}

const townhall: Design = {
  extent: [0.4, 0.3],
  height: 74,
  flag: [0, 0, 74],
  pole: 16,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#f2ece2', 0.14);
    const roof = shadeHex(accent, -0.2);
    p.box(hall, wall);
    p.windows(hall, 'left', 5, 2, 3, 24, lit, { skip: (col, row) => row === 0 && col === 2 });
    p.facePatch(hall, 'left', 0.43, 0.57, 0, 10, '#4a4036');
    p.windows(hall, 'right', 3, 2, 3, 24, lit);
    p.hipRoof(hall, 9, roof);
    p.box(clockTower, wall);
    // One clock, facing the square; two side by side on a slim tower read as a pair of eyes.
    clockFace(p, p.patch(clockTower, 'left', 0.2, 0.8, 40, 52));
    p.facePatch(clockTower, 'right', 0.38, 0.62, 38, 52, shadeHex(wall, -0.35));
    p.hipRoof(clockTower, 16, roof);
  },
};

const shed: Box = { u0: -0.42, u1: 0.42, v0: -0.3, v1: 0.3, z0: 0, z1: 20 };
const chimney: Box = { u0: -0.34, u1: -0.24, v0: -0.24, v1: -0.14, z0: 20, z1: 42 };

const workshop: Design = {
  extent: [0.42, 0.3],
  height: 42,
  flag: [0.36, -0.22, 29],
  pole: 16,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#eadbcc', 0.28);
    const roof = shadeHex(accent, -0.12);
    p.box(shed, wall);
    p.facePatch(shed, 'left', 0.08, 0.46, 0, 14, '#77726b');
    for (let z = 3; z < 14; z += 3) p.facePatch(shed, 'left', 0.08, 0.46, z, z + 0.7, '#5d5953');
    p.windows(shed, 'left', 2, 1, 6, 15, lit, { from: 0.52, to: 0.96 });
    p.windows(shed, 'right', 3, 1, 8, 17, lit);
    p.box(chimney, shadeHex(accent, -0.3));
    if (lit) {
      for (let k = 0; k < 3; k++) {
        const t = (p.now / 2200 + k / 3) % 1;
        const [x, y] = p.at(-0.29, -0.19, 44 + t * 22);
        p.ellipse(x + t * 7, y, 2.5 + t * 4, 2 + t * 3, `rgba(236, 236, 236, ${0.55 * (1 - t)})`);
      }
    }
    // Sawtooth roof: three teeth with north-light glazing facing right.
    const rise = 9;
    const step = (shed.u1 - shed.u0) / 3;
    for (let i = 0; i < 3; i++) {
      const ua = shed.u0 + i * step;
      const ub = ua + step;
      const { v0, v1, z1 } = shed;
      p.poly([p.at(ua, v1, z1), p.at(ub, v1, z1 + rise), p.at(ub, v0, z1 + rise), p.at(ua, v0, z1)], p.lit(roof, 0.04));
      p.glass([p.at(ub, v1, z1), p.at(ub, v0, z1), p.at(ub, v0, z1 + rise), p.at(ub, v1, z1 + rise)], 'right', lit);
      p.poly([p.at(ua, v1, z1), p.at(ub, v1, z1), p.at(ub, v1, z1 + rise)], p.lit(wall, -0.03));
    }
  },
};

const shop: Box = { u0: -0.32, u1: 0.32, v0: -0.32, v1: 0.32, z0: 0, z1: 38 };

const printshop: Design = {
  extent: [0.32, 0.32],
  height: 38,
  flag: [-0.2, -0.2, 38],
  pole: 16,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#f5efe5', 0.12);
    p.box(shop, wall);
    p.parapet(shop, wall);
    p.windows(shop, 'left', 3, 2, 17, 36, lit);
    p.windows(shop, 'right', 3, 2, 17, 36, lit);
    p.glass(p.patch(shop, 'left', 0.1, 0.9, 2, 11), 'left', lit);
    p.facePatch(shop, 'right', 0.15, 0.35, 0, 10, '#4b423a');
    p.glass(p.patch(shop, 'right', 0.5, 0.85, 3, 10), 'right', lit);
    // Striped awning over the shop window.
    for (let k = 0; k < 6; k++) {
      const s0 = 0.06 + k * 0.147;
      const s1 = s0 + 0.147;
      p.poly(
        [
          p.at(along(shop, s0), shop.v1, 14),
          p.at(along(shop, s1), shop.v1, 14),
          p.at(along(shop, s1), shop.v1 + 0.12, 10),
          p.at(along(shop, s0), shop.v1 + 0.12, 10),
        ],
        p.lit(k % 2 ? '#fbf6ee' : accent),
      );
    }
  },
};

const labBlock: Box = { u0: -0.36, u1: 0.36, v0: -0.36, v1: 0.36, z0: 0, z1: 28 };

const lab: Design = {
  extent: [0.36, 0.36],
  height: 40,
  flag: [0.24, -0.24, 28],
  pole: 16,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#f1f3f1', 0.1);
    p.box(labBlock, wall);
    p.parapet(labBlock, wall);
    for (const face of ['left', 'right'] as Face[]) {
      p.windows(labBlock, face, 6, 1, 4, 12, lit);
      p.windows(labBlock, face, 6, 1, 15, 23, lit);
      p.facePatch(labBlock, face, 0, 1, 25, 28, accent);
    }
    // Observatory dome; its slit glows when the bot has been busy.
    p.cylinder(-0.1, -0.1, 0.17, 28, 32, '#dfe3e6');
    p.dome(-0.1, -0.1, 0.17, 32, '#e6eaee');
    const [x, y] = p.at(-0.1, -0.1, 32);
    const [rx] = p.groundRadii(0.17);
    p.poly(
      [
        [x - 1.1, y],
        [x + 1.1, y],
        [x + 1.1, y - rx * 0.9],
        [x - 1.1, y - rx * 0.9],
      ],
      lit ? '#9effd6' : p.lit('#55606a'),
    );
  },
};

const lobby: Box = { u0: -0.3, u1: 0.3, v0: -0.3, v1: 0.3, z0: 0, z1: 9 };
const glassTower: Box = { u0: -0.26, u1: 0.26, v0: -0.26, v1: 0.26, z0: 9, z1: 64 };
const fin: Box = { u0: 0.23, u1: 0.29, v0: 0.23, v1: 0.29, z0: 9, z1: 70 };
const plantRoom: Box = { u0: -0.14, u1: 0.06, v0: -0.14, v1: 0.06, z0: 64, z1: 69 };

const realty: Design = {
  extent: [0.3, 0.3],
  height: 81,
  flag: [0.14, -0.2, 64],
  pole: 14,
  paint(p, accent, lit) {
    const frame = tinted(accent, '#e9edf0', 0.12);
    p.box(lobby, frame);
    p.glass(p.patch(lobby, 'left', 0.15, 0.85, 1, 8), 'left', lit);
    p.glass(p.patch(lobby, 'right', 0.15, 0.85, 1, 8), 'right', lit);
    p.box(glassTower, mixHex('#7fa4bb', accent, 0.18), frame);
    p.windows(glassTower, 'left', 3, 8, 12, 62, lit);
    p.windows(glassTower, 'right', 3, 8, 12, 62, lit);
    p.box(fin, accent);
    p.box(plantRoom, frame);
    const [x, y] = p.at(-0.04, -0.04, 69);
    p.ctx.strokeStyle = p.lit('#4a5058');
    p.ctx.lineWidth = 1;
    p.ctx.beginPath();
    p.ctx.moveTo(x, y);
    p.ctx.lineTo(x, y - 12);
    p.ctx.stroke();
    // An aircraft light that blinks after dark.
    if (p.scene.night > 0.3 && Math.sin(p.now / 500) > 0) p.ellipse(x, y - 12, 1.6, 1.6, '#ff6b5e');
  },
};

const warehouse: Box = { u0: -0.44, u1: 0.44, v0: -0.32, v1: 0.32, z0: 0, z1: 20 };

const depot: Design = {
  extent: [0.44, 0.32],
  height: 27,
  flag: [0.3, 0, 27],
  pole: 14,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#e4ddd0', 0.22);
    p.box(warehouse, wall);
    for (let s = 0.08; s < 0.95; s += 0.08) p.facePatch(warehouse, 'right', s, s + 0.012, 0, 20, shadeHex(wall, -0.14));
    for (const [s0, s1] of [
      [0.12, 0.4],
      [0.56, 0.84],
    ]) {
      p.facePatch(warehouse, 'left', s0, s1, 0, 13, '#77716a');
      p.facePatch(warehouse, 'left', s0, s1, 0, 1.6, '#e0b13c');
      p.glass(p.patch(warehouse, 'left', s0 + 0.09, s1 - 0.09, 14.5, 16.5), 'left', lit);
    }
    p.windows(warehouse, 'right', 3, 1, 13, 18, lit);
    p.gableRoof(warehouse, 7, shadeHex(accent, -0.18), wall, 'u');
    p.box({ u0: 0.18, u1: 0.3, v0: 0.34, v1: 0.46, z0: 0, z1: 7 }, '#b98a52');
    p.box({ u0: 0.31, u1: 0.41, v0: 0.36, v1: 0.46, z0: 0, z1: 5 }, '#a87c48');
  },
};

const bankHall: Box = { u0: -0.38, u1: 0.38, v0: -0.3, v1: 0.3, z0: 0, z1: 30 };

const bank: Design = {
  extent: [0.38, 0.3],
  height: 41,
  flag: [0, -0.18, 41],
  pole: 14,
  paint(p, accent, lit) {
    const stone = tinted(accent, '#efe7d8', 0.12);
    p.box(bankHall, stone);
    // A portico: columns in front of a shaded recess, up a short flight of steps.
    p.facePatch(bankHall, 'left', 0.08, 0.92, 4, 27, shadeHex(stone, -0.45));
    for (let k = 0; k < 5; k++) {
      const s = 0.1 + k * 0.19;
      p.facePatch(bankHall, 'left', s, s + 0.07, 4, 27, shadeHex(stone, 0.1));
    }
    p.facePatch(bankHall, 'left', 0.04, 0.96, 0, 4, shadeHex(stone, 0.12), 0.03);
    p.windows(bankHall, 'right', 3, 2, 5, 27, lit);
    p.gableRoof(bankHall, 11, shadeHex(accent, -0.2), stone, 'v');
    const [x, y] = middle([p.at(bankHall.u0, bankHall.v1, 30), p.at(bankHall.u1, bankHall.v1, 30), p.at(0, bankHall.v1, 41)]);
    p.ellipse(x, y + 0.5, 2.6, 2.6, p.lit(accent, 0.1));
  },
};

const residence: Box = { u0: -0.32, u1: 0.32, v0: -0.32, v1: 0.32, z0: 0, z1: 38 };

const consulate: Design = {
  extent: [0.32, 0.32],
  height: 50,
  flag: [0, 0, 50],
  pole: 14,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#f5f0e8', 0.1);
    p.box(residence, wall);
    p.windows(residence, 'left', 3, 3, 3, 36, lit, { skip: (col, row) => col === 1 && row === 0 });
    p.windows(residence, 'right', 3, 3, 3, 36, lit);
    p.facePatch(residence, 'left', 0.42, 0.58, 0, 10, '#433a33');
    p.poly(
      [
        p.at(along(residence, 0.38), residence.v1, 12),
        p.at(along(residence, 0.62), residence.v1, 12),
        p.at(along(residence, 0.62), residence.v1 + 0.08, 11),
        p.at(along(residence, 0.38), residence.v1 + 0.08, 11),
      ],
      p.lit(accent),
    );
    const [x, y] = middle(p.patch(residence, 'left', 0.45, 0.55, 14, 18));
    p.ellipse(x, y, 2.4, 2.4, p.lit('#d9b44a'));
    p.hipRoof(residence, 12, shadeHex(accent, -0.15));
  },
};

const gymHall: Box = { u0: -0.41, u1: 0.41, v0: -0.31, v1: 0.31, z0: 0, z1: 24 };
const billboard: Box = { u0: -0.22, u1: 0.22, v0: -0.08, v1: -0.04, z0: 24, z1: 34 };

const gym: Design = {
  extent: [0.41, 0.31],
  height: 34,
  flag: [0.32, -0.22, 24],
  pole: 14,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#eceff1', 0.1);
    p.box(gymHall, wall);
    p.parapet(gymHall, wall);
    p.windows(gymHall, 'left', 6, 1, 1, 22, lit);
    p.facePatch(gymHall, 'right', 0, 1, 17, 21, accent);
    p.windows(gymHall, 'right', 3, 1, 4, 14, lit);
    p.box(billboard, accent);
    const [x, y] = middle(p.patch(billboard, 'left', 0.2, 0.8, 26, 32));
    p.ctx.fillStyle = p.lit('#ffffff');
    p.ctx.fillRect(x - 4, y - 0.6, 8, 1.2);
    p.ctx.fillRect(x - 5.5, y - 2.4, 2, 4.8);
    p.ctx.fillRect(x + 3.5, y - 2.4, 2, 4.8);
  },
};

const office: Box = { u0: -0.3, u1: 0.3, v0: -0.3, v1: 0.3, z0: 0, z1: 40 };

const generic: Design = {
  extent: [0.3, 0.3],
  height: 45,
  flag: [-0.18, -0.18, 40],
  pole: 14,
  paint(p, accent, lit) {
    const wall = tinted(accent, '#efebe4', 0.18);
    p.box(office, wall);
    p.parapet(office, wall);
    for (const face of ['left', 'right'] as Face[]) {
      p.windows(office, face, 3, 4, 3, 36, lit);
      p.facePatch(office, face, 0, 1, 37, 40, accent);
    }
    p.box({ u0: -0.12, u1: 0.06, v0: -0.12, v1: 0.06, z0: 40, z1: 45 }, '#cfd4d8');
  },
};

/** The one stand-in: a plain grey block, no lights, no flag, whatever the bot's building. */
export const PLACEHOLDER_DESIGN: Design = {
  extent: [0.3, 0.3],
  height: 40,
  flag: [0, 0, 40],
  pole: 0,
  paint(p) {
    p.box(office, PLACEHOLDER_ACCENT, shadeHex(PLACEHOLDER_ACCENT, 0.08));
    for (const face of ['left', 'right'] as Face[]) {
      p.windows(office, face, 3, 4, 3, 36, false, { color: shadeHex(PLACEHOLDER_ACCENT, -0.3) });
    }
  },
};

/** The boxes the designs are built from, shared with the 3D models so both views match. */
export const SHAPES = {
  hall,
  clockTower,
  shed,
  chimney,
  shop,
  labBlock,
  lobby,
  glassTower,
  fin,
  plantRoom,
  warehouse,
  bankHall,
  residence,
  gymHall,
  billboard,
  office,
} as const;

const DESIGNS: Record<BuildingType, Design> = {
  plaza,
  townhall,
  workshop,
  printshop,
  lab,
  realty,
  depot,
  bank,
  consulate,
  gym,
  generic,
};

export function designOf(type: BuildingType): Design {
  return DESIGNS[type] ?? generic;
}

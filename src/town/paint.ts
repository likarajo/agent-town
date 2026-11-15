import { hexToRgb, shadeHex } from './color';
import type { Scene } from './scene';

export type Point = [number, number];

/** A box in tile space around a tile's centre: u along q and v along r (in tiles), z up (in px). */
export interface Box {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  z0: number;
  z1: number;
}

export type Face = 'left' | 'right';

export interface WindowOptions {
  from?: number;
  to?: number;
  skip?: (col: number, row: number) => boolean;
  color?: string;
}

const NIGHT_TINT = [26, 38, 74] as const;

export function convexHull(points: Point[]): Point[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: Point, a: Point, b: Point) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = (list: Point[]) => {
    const out: Point[] = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    return out.slice(0, -1);
  };
  return [...half(pts), ...half(pts.reverse())];
}

/**
 * Draws one frame of the town. Coordinates are relative to the canvas origin, which the renderer
 * moves to whatever is being drawn; colours go through `lit` so everything follows the time of day.
 * The light comes from the upper left: left faces (facing +v) are bright, right faces (+u) dark.
 */
export class Painter {
  private readonly colors = new Map<string, string>();

  constructor(
    readonly ctx: CanvasRenderingContext2D,
    readonly scene: Scene,
    readonly tileW: number,
    readonly tileH: number,
    /** Milliseconds; frozen when the user prefers reduced motion. */
    readonly now: number,
  ) {}

  at(u: number, v: number, z = 0): Point {
    return [(u - v) * (this.tileW / 2), (u + v) * (this.tileH / 2) - z];
  }

  /** On-screen radii of a circle on the ground, `r` tiles in radius. */
  groundRadii(r: number): [number, number] {
    return [(r * this.tileW) / Math.SQRT2, (r * this.tileH) / Math.SQRT2];
  }

  /** A surface colour under the current daylight: dimmer and bluer at night. */
  lit(hex: string, shade = 0): string {
    const cacheKey = `${hex}${shade}`;
    let color = this.colors.get(cacheKey);
    if (color === undefined) {
      const rgb = hexToRgb(shade ? shadeHex(hex, shade) : hex);
      const tint = this.scene.night * 0.3;
      const [r, g, b] = rgb.map((v, i) => Math.round(v * this.scene.daylight * (1 - tint) + NIGHT_TINT[i] * tint));
      color = `rgb(${r}, ${g}, ${b})`;
      this.colors.set(cacheKey, color);
    }
    return color;
  }

  poly(points: Point[], fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  ellipse(x: number, y: number, rx: number, ry: number, fill: string): void {
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** The top and the two visible faces of a box. */
  box(b: Box, wall: string, top = wall): void {
    const a0 = this.at(b.u1, b.v1, b.z0);
    const b0 = this.at(b.u1, b.v0, b.z0);
    const c0 = this.at(b.u0, b.v1, b.z0);
    const a1 = this.at(b.u1, b.v1, b.z1);
    const b1 = this.at(b.u1, b.v0, b.z1);
    const c1 = this.at(b.u0, b.v1, b.z1);
    const d1 = this.at(b.u0, b.v0, b.z1);
    this.poly([c0, a0, a1, c1], this.lit(wall, -0.03));
    this.poly([a0, b0, b1, a1], this.lit(wall, -0.2));
    this.poly([a1, b1, d1, c1], this.lit(top, 0.08));
  }

  /**
   * A rectangle on a box face. On the left face s runs from the left corner (0) to the front
   * corner (1); on the right face from the front corner (0) to the right corner (1). `out` pushes
   * it off the wall, in tiles.
   */
  patch(b: Box, face: Face, s0: number, s1: number, z0: number, z1: number, out = 0): Point[] {
    if (face === 'left') {
      const u = (s: number) => b.u0 + (b.u1 - b.u0) * s;
      const v = b.v1 + out;
      return [this.at(u(s0), v, z0), this.at(u(s1), v, z0), this.at(u(s1), v, z1), this.at(u(s0), v, z1)];
    }
    const v = (s: number) => b.v1 + (b.v0 - b.v1) * s;
    const u = b.u1 + out;
    return [this.at(u, v(s0), z0), this.at(u, v(s1), z0), this.at(u, v(s1), z1), this.at(u, v(s0), z1)];
  }

  /** Paint a patch in a wall colour, shaded for its face. */
  facePatch(b: Box, face: Face, s0: number, s1: number, z0: number, z1: number, color: string, out = 0): void {
    this.poly(this.patch(b, face, s0, s1, z0, z1, out), this.lit(color, face === 'left' ? -0.03 : -0.2));
  }

  /**
   * A grid of windows across part of a face (s from `from` to `to`): lit ones glow (commits this
   * week), the rest reflect the sky. `color` paints them flat instead, for stand-ins.
   */
  windows(b: Box, face: Face, cols: number, rows: number, z0: number, z1: number, lit: boolean, opts: WindowOptions = {}): void {
    const { from = 0, to = 1, skip, color } = opts;
    const cw = (to - from) / cols;
    const ch = (z1 - z0) / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (skip?.(col, row)) continue;
        const s0 = from + col * cw + cw * 0.2;
        const s1 = from + (col + 1) * cw - cw * 0.2;
        const quad = this.patch(b, face, s0, s1, z0 + row * ch + ch * 0.2, z0 + (row + 1) * ch - ch * 0.16);
        if (color) this.poly(quad, this.lit(color, face === 'left' ? -0.03 : -0.2));
        else this.glass(quad, face, lit);
      }
    }
  }

  glass(quad: Point[], face: Face, lit: boolean): void {
    if (!lit) {
      this.poly(quad, this.lit(face === 'left' ? '#aac4d4' : '#86a2b6'));
      return;
    }
    this.poly(quad, '#ffd27a');
    if (this.scene.night > 0.05) {
      const { ctx } = this;
      ctx.save();
      ctx.globalAlpha = 0.4 * this.scene.night;
      ctx.strokeStyle = '#ffc56e';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.restore();
    }
  }

  /** A pyramid roof rising `rise` px over the box top. */
  hipRoof(b: Box, rise: number, color: string): void {
    const apex = this.at((b.u0 + b.u1) / 2, (b.v0 + b.v1) / 2, b.z1 + rise);
    const a = this.at(b.u1, b.v1, b.z1);
    const bb = this.at(b.u1, b.v0, b.z1);
    const c = this.at(b.u0, b.v1, b.z1);
    this.poly([c, a, apex], this.lit(color, 0.02));
    this.poly([a, bb, apex], this.lit(color, -0.18));
  }

  /** A pitched roof. With the ridge along u the gable end faces right; along v it faces left. */
  gableRoof(b: Box, rise: number, color: string, wall: string, ridge: 'u' | 'v'): void {
    const a = this.at(b.u1, b.v1, b.z1);
    const bb = this.at(b.u1, b.v0, b.z1);
    const c = this.at(b.u0, b.v1, b.z1);
    if (ridge === 'u') {
      const vm = (b.v0 + b.v1) / 2;
      const r0 = this.at(b.u0, vm, b.z1 + rise);
      const r1 = this.at(b.u1, vm, b.z1 + rise);
      this.poly([c, a, r1, r0], this.lit(color, 0.02));
      this.poly([a, bb, r1], this.lit(wall, -0.2));
    } else {
      const um = (b.u0 + b.u1) / 2;
      const r0 = this.at(um, b.v0, b.z1 + rise);
      const r1 = this.at(um, b.v1, b.z1 + rise);
      this.poly([bb, a, r1, r0], this.lit(color, -0.18));
      this.poly([c, a, r1], this.lit(wall, -0.03));
    }
  }

  /** A parapet: the roof inset a little and darker, so a flat roof reads as a roof. */
  parapet(b: Box, color: string, inset = 0.05): void {
    const z = b.z1;
    this.poly(
      [
        this.at(b.u1 - inset, b.v1 - inset, z),
        this.at(b.u1 - inset, b.v0 + inset, z),
        this.at(b.u0 + inset, b.v0 + inset, z),
        this.at(b.u0 + inset, b.v1 - inset, z),
      ],
      this.lit(color, -0.08),
    );
  }

  /** A short upright cylinder on the ground plane, centred at (u, v), from z0 to z1. */
  cylinder(u: number, v: number, radius: number, z0: number, z1: number, color: string): void {
    const [x, y0] = this.at(u, v, z0);
    const y1 = y0 - (z1 - z0);
    const [rx, ry] = this.groundRadii(radius);
    const { ctx } = this;
    const side = ctx.createLinearGradient(x - rx, 0, x + rx, 0);
    side.addColorStop(0, this.lit(color, 0.02));
    side.addColorStop(1, this.lit(color, -0.25));
    ctx.beginPath();
    ctx.ellipse(x, y0, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(x - rx, y1);
    ctx.ellipse(x, y1, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fillStyle = side;
    ctx.fill();
    this.ellipse(x, y1, rx, ry, this.lit(color, 0.1));
  }

  /** A dome sitting at height z. */
  dome(u: number, v: number, radius: number, z: number, color: string): void {
    const [x, y] = this.at(u, v, z);
    const [rx, ry] = this.groundRadii(radius);
    const { ctx } = this;
    const fill = ctx.createLinearGradient(x - rx, y - rx, x + rx, y);
    fill.addColorStop(0, this.lit(color, 0.18));
    fill.addColorStop(1, this.lit(color, -0.22));
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI);
    ctx.ellipse(x, y, rx, rx * 0.95, 0, Math.PI, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
  }

  /** The shadow a box of this footprint and height casts on the ground. */
  castShadow(u0: number, u1: number, v0: number, v1: number, height: number): void {
    const { dx, dy, alpha } = this.scene.shadow;
    if (alpha <= 0 || height <= 0) return;
    const base = [this.at(u0, v0), this.at(u1, v0), this.at(u1, v1), this.at(u0, v1)];
    const tip = base.map(([x, y]): Point => [x + dx * height, y + dy * height]);
    this.poly(convexHull([...base, ...tip]), `rgba(16, 28, 40, ${alpha})`);
  }

  /** The open-PR flag: a pole at (u, v, z) with a pennant waving in the bot's colour. */
  flag(u: number, v: number, z: number, pole: number, accent: string): void {
    const { ctx } = this;
    const [x, y] = this.at(u, v, z);
    const top = y - pole;
    ctx.strokeStyle = this.lit('#3b3f45');
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, top - 1);
    ctx.stroke();
    const wave = Math.sin(this.now / 260 + x * 0.05);
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.quadraticCurveTo(x + 7, top + 1 + wave * 1.6, x + 14, top + 4 + wave);
    ctx.quadraticCurveTo(x + 7, top + 8 + wave * 1.6, x, top + 9);
    ctx.closePath();
    ctx.fillStyle = this.lit(accent, 0.1);
    ctx.fill();
  }
}

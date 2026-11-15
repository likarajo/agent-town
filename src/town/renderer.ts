import { BUILDING_SCALE, designOf, PLACEHOLDER_DESIGN, type Design } from './buildings';
import { PLACEHOLDER_ACCENT } from './catalog';
import { mixHex } from './color';
import { tileToScreen } from './iso';
import {
  layoutTown,
  PLAZA_RADIUS,
  strollPosition,
  tileNoise,
  walkerPosition,
  type Decoration,
  type Direction,
  type TownLayout,
} from './layout';
import { Painter, type Point } from './paint';
import { hourOf, sceneAt } from './scene';
import type { ActivityCue, CameraState, TownBuilding, TownData } from './types';

interface Walker {
  q: number;
  r: number;
  accent: string;
  moving: boolean;
}

interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

const ISLAND_DEPTH = 26;
const LABEL_TOP = 24;
const LABEL_HEIGHT = 29;
const FONT = '"Segoe UI", system-ui, sans-serif';

const ARM: Record<Direction, [number, number]> = { 'q+': [1, 0], 'q-': [-1, 0], 'r+': [0, 1], 'r-': [0, -1] };

export class TownRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cues: Record<string, ActivityCue> = {};
  private hoverId: string | null = null;
  private dpr = 1;
  private layout: TownLayout;
  private fixedHour: number | null = null;
  private readonly labels = new Map<string, LabelBox>();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private town: TownData,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
    this.layout = layoutTown(town);
  }

  setTown(town: TownData): void {
    this.town = town;
    this.layout = layoutTown(town);
    this.cues = {};
    this.hoverId = null;
    this.labels.clear();
  }

  setCues(cues: Record<string, ActivityCue>): void {
    this.cues = cues;
  }

  setHover(id: string | null): void {
    this.hoverId = id;
  }

  /** Pin the time of day (hours, 0–24), or pass null to follow the clock. */
  setClock(hour: number | null): void {
    this.fixedHour = hour;
  }

  /** Grey stand-ins: a roster that hasn't loaded, or a bot whose data failed to load. */
  isPlaceholder(b: TownBuilding): boolean {
    return b.placeholderReason !== undefined || Boolean(this.cues[b.id]?.error);
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * this.dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** `now` drives the animation (milliseconds); pass a constant to hold everything still. */
  draw(camera: CameraState, now = performance.now()): void {
    const { ctx, town } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    const scene = sceneAt(this.fixedHour ?? hourOf(new Date()));
    const p = new Painter(ctx, scene, town.ground.tileW, town.ground.tileH, now);

    ctx.clearRect(0, 0, w, h);
    this.drawSky(p, w, h);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);
    this.drawIsland(p);
    this.drawRoads(p);
    this.drawLots(p);
    this.drawShadows(p);
    this.drawGlow(p);
    this.drawHover(p);
    this.drawObjects(p);
    this.drawLabels(p);
    ctx.restore();
  }

  /** The building under a screen point: labels first (they sit on top), then the frontmost building. */
  hitTest(screenX: number, screenY: number, camera: CameraState): TownBuilding | null {
    const x = (screenX - camera.x) / camera.scale;
    const y = (screenY - camera.y) / camera.scale;
    for (const b of this.town.buildings) {
      const box = this.labels.get(b.id);
      if (box && x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h) return b;
    }
    const { tileW, tileH } = this.town.ground;
    const frontFirst = [...this.town.buildings].sort((a, b) => b.q + b.r - (a.q + a.r));
    for (const b of frontFirst) {
      const d = this.design(b);
      const [cx, cy] = this.center(b.q, b.r);
      const reach = (d.extent[0] + d.extent[1]) * BUILDING_SCALE;
      const top = d.height * BUILDING_SCALE;
      if (Math.abs(x - cx) <= reach * (tileW / 2) + 2 && y <= cy + reach * (tileH / 2) + 2 && y >= cy - top - 4) {
        return b;
      }
    }
    return null;
  }

  /** World-space box around every building, its flag and its label. */
  buildingBounds(): { minX: number; maxX: number; minY: number; maxY: number } {
    const { cols, rows, tileW, tileH } = this.town.ground;
    if (!this.town.buildings.length) {
      const top = tileToScreen(0, 0, tileW, tileH);
      const bottom = tileToScreen(cols, rows, tileW, tileH);
      return {
        minX: tileToScreen(0, rows, tileW, tileH).x,
        maxX: tileToScreen(cols, 0, tileW, tileH).x,
        minY: top.y,
        maxY: bottom.y + ISLAND_DEPTH,
      };
    }
    const box = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const b of this.town.buildings) {
      const d = this.design(b);
      const [x, y] = this.center(b.q, b.r);
      const half = Math.max((d.extent[0] + d.extent[1]) * BUILDING_SCALE * (tileW / 2), 46);
      box.minX = Math.min(box.minX, x - half);
      box.maxX = Math.max(box.maxX, x + half);
      box.minY = Math.min(box.minY, y - (d.height + d.pole) * BUILDING_SCALE - 6);
      box.maxY = Math.max(box.maxY, y + LABEL_TOP + LABEL_HEIGHT + 6);
    }
    return box;
  }

  /** Where a building stands, in world space before the camera is applied. */
  anchorOf(b: TownBuilding): Point {
    return this.center(b.q, b.r);
  }

  private design(b: TownBuilding): Design {
    return this.isPlaceholder(b) ? PLACEHOLDER_DESIGN : designOf(b.buildingType);
  }

  /** Screen point at the middle of tile (q, r); fractional tiles are fine. */
  private center(q: number, r: number): Point {
    const { tileW, tileH } = this.town.ground;
    const p = tileToScreen(q + 0.5, r + 0.5, tileW, tileH);
    return [p.x, p.y];
  }

  /** Run `paint` with the origin moved to the middle of tile (q, r). */
  private atTile(q: number, r: number, paint: () => void): void {
    const [x, y] = this.center(q, r);
    this.ctx.save();
    this.ctx.translate(x, y);
    paint();
    this.ctx.restore();
  }

  /** The loaded plaza building at the hub, whose square every street leads into. */
  private plaza(): TownBuilding | undefined {
    const { hub } = this.layout;
    return this.town.buildings.find(
      (b) => b.buildingType === 'plaza' && b.q === hub.q && b.r === hub.r && !this.isPlaceholder(b),
    );
  }

  private drawSky(p: Painter, w: number, h: number): void {
    const { ctx } = this;
    const { scene, now } = p;
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, scene.skyTop);
    sky.addColorStop(1, scene.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    if (scene.night > 0.05) {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 80; i++) {
        ctx.globalAlpha = scene.night * 0.85 * (0.55 + 0.45 * Math.sin(now / 700 + i * 1.7));
        const size = tileNoise(i, 9, 3) < 0.15 ? 2 : 1.2;
        ctx.fillRect(tileNoise(i, 0, 7) * w, tileNoise(i, 1, 7) * h * 0.65, size, size);
      }
      ctx.globalAlpha = 1;
    }

    if (scene.sky.body !== 'none') {
      const sun = scene.sky.body === 'sun';
      const x = scene.sky.x * w;
      const y = scene.sky.y * h;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, Math.max(w, h) * (sun ? 0.35 : 0.18));
      glow.addColorStop(0, sun ? 'rgba(255, 238, 196, 0.6)' : 'rgba(205, 218, 255, 0.28)');
      glow.addColorStop(1, 'rgba(255, 238, 196, 0)');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      p.ellipse(x, y, sun ? 15 : 11, sun ? 15 : 11, sun ? '#fff3d2' : '#eef1fb');
    }

    const cloud = mixHex('#ffffff', scene.skyBottom, 0.25);
    ctx.globalAlpha = 0.75 - scene.night * 0.55;
    for (let i = 0; i < 4; i++) {
      const span = w + 260;
      const x = ((tileNoise(i, 2, 11) * span + now * (0.006 + 0.003 * i)) % span) - 130;
      const y = h * (0.08 + 0.09 * i + 0.05 * tileNoise(i, 3, 11));
      const s = 0.7 + tileNoise(i, 4, 11) * 0.6;
      for (const [ox, oy, r] of [
        [-22, 4, 14],
        [0, -4, 19],
        [22, 3, 15],
        [40, 7, 10],
      ]) {
        p.ellipse(x + ox * s, y + oy * s, r * s * 1.25, r * s * 0.8, cloud);
      }
    }
    ctx.globalAlpha = 1;
  }

  /** The town sits on a floating island: a lawn on a slab of earth. */
  private drawIsland(p: Painter): void {
    const { ctx } = this;
    const { cols, rows, tileW, tileH } = this.town.ground;
    const corner = (q: number, r: number): Point => {
      const t = tileToScreen(q, r, tileW, tileH);
      return [t.x, t.y];
    };
    const down = ([x, y]: Point, d: number): Point => [x, y + d];
    const top = corner(0, 0);
    const right = corner(cols, 0);
    const bottom = corner(cols, rows);
    const left = corner(0, rows);

    const rx = (right[0] - left[0]) / 2;
    const ry = (bottom[1] - top[1]) / 2;
    ctx.save();
    ctx.translate((left[0] + right[0]) / 2, (top[1] + bottom[1]) / 2 + ISLAND_DEPTH + 26);
    ctx.scale(1, ry / rx);
    const shade = ctx.createRadialGradient(0, 0, rx * 0.3, 0, 0, rx);
    shade.addColorStop(0, 'rgba(8, 18, 28, 0.28)');
    shade.addColorStop(1, 'rgba(8, 18, 28, 0)');
    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.arc(0, 0, rx, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    p.poly([left, bottom, down(bottom, ISLAND_DEPTH), down(left, ISLAND_DEPTH)], p.lit('#8c6b4b'));
    p.poly([bottom, right, down(right, ISLAND_DEPTH), down(bottom, ISLAND_DEPTH)], p.lit('#6f5339'));
    p.poly([left, bottom, down(bottom, 5), down(left, 5)], p.lit('#4f8a4c'));
    p.poly([bottom, right, down(right, 5), down(bottom, 5)], p.lit('#41763f'));
    p.poly([top, right, bottom, left], p.lit('#7fb069'));

    const [mx, my] = p.groundRadii(0.42);
    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const n = tileNoise(q, r, 21);
        if (n > 0.4) continue;
        const [x, y] = this.center(q + (tileNoise(q, r, 22) - 0.5) * 0.3, r + (tileNoise(q, r, 23) - 0.5) * 0.3);
        p.ellipse(x, y, mx, my, p.lit('#7fb069', n < 0.2 ? 0.05 : -0.05));
      }
    }
  }

  /** Kerbs, then asphalt, then dashed centre lines, so crossings merge cleanly. */
  private drawRoads(p: Painter): void {
    const { ctx } = this;
    const arm = (link: Direction, hw: number): Point[] => {
      const [du, dv] = ARM[link];
      return du !== 0
        ? [p.at(0, -hw), p.at(du * 0.5, -hw), p.at(du * 0.5, hw), p.at(0, hw)]
        : [p.at(-hw, 0), p.at(-hw, dv * 0.5), p.at(hw, dv * 0.5), p.at(hw, 0)];
    };
    for (const [hw, color] of [
      [0.27, '#d8d0c0'],
      [0.19, '#6f757b'],
    ] as const) {
      const fill = p.lit(color);
      for (const road of this.layout.roads) {
        this.atTile(road.q, road.r, () => {
          p.poly([p.at(hw, -hw), p.at(hw, hw), p.at(-hw, hw), p.at(-hw, -hw)], fill);
          for (const link of road.links) p.poly(arm(link, hw), fill);
        });
      }
    }
    ctx.strokeStyle = p.lit('#efe9da');
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 4]);
    for (const road of this.layout.roads) {
      this.atTile(road.q, road.r, () => {
        for (const link of road.links) {
          const [du, dv] = ARM[link];
          const [x, y] = p.at(du * 0.5, dv * 0.5);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
      });
    }
    ctx.setLineDash([]);
  }

  /** The plaza's paved square, and a concrete lot under every other building. */
  private drawLots(p: Painter): void {
    const { ctx } = this;
    const plaza = this.plaza();
    if (plaza) {
      const paving = mixHex('#e8dfcc', plaza.accent, 0.18);
      this.atTile(plaza.q, plaza.r, () => {
        const [rx, ry] = p.groundRadii(PLAZA_RADIUS);
        p.ellipse(0, 0, rx, ry, p.lit(paving));
        ctx.strokeStyle = p.lit(paving, -0.1);
        ctx.lineWidth = 1;
        for (const r of [1, 0.65]) {
          const [ex, ey] = p.groundRadii(r);
          ctx.beginPath();
          ctx.ellipse(0, 0, ex, ey, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.strokeStyle = p.lit(paving, -0.2);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
    const k = 0.5;
    for (const b of this.town.buildings) {
      if (b === plaza) continue;
      this.atTile(b.q, b.r, () =>
        p.poly([p.at(k, -k), p.at(k, k), p.at(-k, k), p.at(-k, -k)], p.lit(this.isPlaceholder(b) ? '#b5b8ba' : '#ddd6c8')),
      );
    }
  }

  private drawShadows(p: Painter): void {
    const { dx, dy, alpha } = p.scene.shadow;
    if (alpha <= 0) return;
    const plaza = this.plaza();
    for (const b of this.town.buildings) {
      if (b === plaza) continue;
      const d = this.design(b);
      const [eu, ev] = d.extent.map((e) => e * BUILDING_SCALE);
      this.atTile(b.q, b.r, () => p.castShadow(-eu, eu, -ev, ev, d.height * BUILDING_SCALE * 0.85));
    }
    for (const d of this.layout.decorations) {
      if (d.kind !== 'tree' && d.kind !== 'pine') continue;
      const [x, y] = this.center(d.q, d.r);
      p.ellipse(x + dx * 12, y + dy * 12, 7, 3.5, `rgba(16, 28, 40, ${alpha * 0.8})`);
    }
  }

  /** After dark: pools of lamplight, and warm light spilling from busy buildings. */
  private drawGlow(p: Painter): void {
    const { night } = p.scene;
    if (night < 0.05) return;
    const pool = (x: number, y: number, radius: number, color: string, strength: number) => {
      const g = this.ctx.createRadialGradient(x, y, 0, x, y, radius);
      g.addColorStop(0, `rgba(${color}, ${strength * night})`);
      g.addColorStop(1, `rgba(${color}, 0)`);
      this.ctx.fillStyle = g;
      this.ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    };
    for (const d of this.layout.decorations) {
      if (d.kind !== 'lamp') continue;
      const [x, y] = this.center(d.q, d.r);
      pool(x, y, 30, '255, 214, 150', 0.32);
    }
    for (const b of this.town.buildings) {
      if (this.isPlaceholder(b) || !this.cues[b.id]?.hasRecentCommits) continue;
      const [x, y] = this.center(b.q + 0.42, b.r + 0.42);
      pool(x, y, 38, '255, 200, 120', 0.24);
    }
  }

  private drawHover(p: Painter): void {
    const b = this.town.buildings.find((x) => x.id === this.hoverId);
    if (!b) return;
    const d = this.design(b);
    const [x, y] = this.center(b.q, b.r);
    const [rx, ry] = p.groundRadii(Math.max(d.extent[0], d.extent[1]) * BUILDING_SCALE + 0.2);
    const pulse = 0.7 + 0.3 * Math.sin(p.now / 260);
    const { ctx } = this;
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 246, 214, ${0.16 * pulse})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(255, 246, 214, ${0.85 * pulse})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  /** Buildings, trees and walkers, back to front. */
  private drawObjects(p: Painter): void {
    const items: Array<{ depth: number; draw: () => void }> = [];
    const square = Boolean(this.plaza());
    for (const b of this.town.buildings) items.push({ depth: b.q + b.r, draw: () => this.drawBuilding(p, b) });
    for (const d of this.layout.decorations) {
      if (d.kind === 'bench' && !square) continue;
      items.push({ depth: d.q + d.r, draw: () => this.drawDecoration(p, d) });
    }
    for (const w of this.walkers(p.now)) items.push({ depth: w.q + w.r, draw: () => this.drawWalker(p, w) });
    items.sort((a, b) => a.depth - b.depth);
    for (const item of items) item.draw();
  }

  private drawBuilding(p: Painter, b: TownBuilding): void {
    const placeholder = this.isPlaceholder(b);
    const d = this.design(b);
    const cue = this.cues[b.id];
    this.atTile(b.q, b.r, () => {
      this.ctx.scale(BUILDING_SCALE, BUILDING_SCALE);
      d.paint(p, b.accent, !placeholder && Boolean(cue?.hasRecentCommits));
      if (!placeholder && cue?.hasOpenPrs) p.flag(d.flag[0], d.flag[1], d.flag[2], d.pole, b.accent);
    });
  }

  private drawDecoration(p: Painter, d: Decoration): void {
    const { ctx } = this;
    this.atTile(d.q, d.r, () => {
      switch (d.kind) {
        case 'tree': {
          const green = ['#5f9e57', '#4e8f55', '#79aa58'][d.variant];
          const s = 0.85 + (d.variant % 2) * 0.25;
          ctx.fillStyle = p.lit('#7a5a3e');
          ctx.fillRect(-1.2, -9 * s, 2.4, 9 * s);
          p.ellipse(0, -14 * s, 8 * s, 7.5 * s, p.lit(green));
          p.ellipse(-2.5 * s, -16.5 * s, 4 * s, 3.4 * s, p.lit(green, 0.12));
          break;
        }
        case 'pine': {
          const green = '#3f7a52';
          ctx.fillStyle = p.lit('#6b4f37');
          ctx.fillRect(-1, -5, 2, 5);
          p.poly([[0, -27], [8.5, -5], [-8.5, -5]], p.lit(green));
          p.poly([[0, -27], [8.5, -5], [0, -5]], p.lit(green, -0.14));
          p.poly([[0, -33], [6.5, -15], [-6.5, -15]], p.lit(green, 0.04));
          p.poly([[0, -33], [6.5, -15], [0, -15]], p.lit(green, -0.1));
          break;
        }
        case 'bush': {
          const green = d.variant === 2 ? '#6aa25a' : '#558f4f';
          p.ellipse(-3, -3, 5, 4, p.lit(green));
          p.ellipse(3, -2.5, 4.5, 3.6, p.lit(green, -0.08));
          break;
        }
        case 'flowers': {
          const colors = ['#f2a7c3', '#ffe08a', '#ffffff'];
          for (let i = 0; i < 6; i++) {
            ctx.fillStyle = p.lit(colors[(i + d.variant) % 3]);
            ctx.fillRect(Math.cos(i * 2.1) * 5 - 1, Math.sin(i * 2.1) * 2.5 - 1, 2, 2);
          }
          break;
        }
        case 'lamp': {
          const on = p.scene.night > 0.2;
          ctx.fillStyle = p.lit('#3d4247');
          ctx.fillRect(-0.7, -17, 1.4, 17);
          if (on) p.ellipse(0, -18, 6, 6, `rgba(255, 227, 166, ${0.35 * p.scene.night})`);
          p.ellipse(0, -18, 2.4, 1.8, on ? '#ffe3a6' : p.lit('#cfd3d6'));
          break;
        }
        case 'bench': {
          const wood = '#8a6a4e';
          if (d.variant === 0) p.box({ u0: -0.12, u1: 0.12, v0: -0.04, v1: 0.04, z0: 2, z1: 4 }, wood);
          else p.box({ u0: -0.04, u1: 0.04, v0: -0.12, v1: 0.12, z0: 2, z1: 4 }, wood);
          break;
        }
      }
    });
  }

  /**
   * Bots with commits this week walk from their door to the plaza and back; the plaza's own bot
   * strolls round the fountain.
   */
  private walkers(now: number): Walker[] {
    const out: Walker[] = [];
    const { hub, hasPlaza } = this.layout;
    for (const b of this.town.buildings) {
      if (this.isPlaceholder(b) || !this.cues[b.id]?.hasRecentCommits) continue;
      const phase = tileNoise(b.q, b.r, 31);
      const atHub = b.q === hub.q && b.r === hub.r;
      if (atHub && !hasPlaza) continue;
      const spot = atHub ? strollPosition(hub, now, phase) : walkerPosition(this.layout.paths[b.id] ?? [], now, phase, hasPlaza);
      if (spot) out.push({ q: spot.q, r: spot.r, accent: b.accent, moving: spot.moving });
    }
    return out;
  }

  private drawWalker(p: Painter, w: Walker): void {
    const { ctx } = this;
    const [x, y] = this.center(w.q, w.r);
    const swing = w.moving ? Math.sin(p.now / 140) : 0;
    const bob = Math.abs(swing) * 1.1;
    p.ellipse(x, y, 3, 1.4, 'rgba(10, 20, 15, 0.25)');
    ctx.strokeStyle = p.lit('#3a3f46');
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x - 0.8, y - 4 - bob);
    ctx.lineTo(x - 0.8 + swing * 0.9, y);
    ctx.moveTo(x + 0.8, y - 4 - bob);
    ctx.lineTo(x + 0.8 - swing * 0.9, y);
    ctx.stroke();
    ctx.fillStyle = p.lit(w.accent);
    ctx.beginPath();
    ctx.roundRect(x - 2.2, y - 10.5 - bob, 4.4, 7, 1.6);
    ctx.fill();
    p.ellipse(x, y - 12.6 - bob, 2, 2, p.lit('#f0d2b4'));
  }

  /** Name tags on top of everything, so a tree or a taller building never hides them. */
  private drawLabels(p: Painter): void {
    const { ctx } = this;
    this.labels.clear();
    for (const b of this.town.buildings) {
      if (!b.name) continue;
      const [x, y] = this.center(b.q, b.r);
      ctx.font = `600 11px ${FONT}`;
      const nameWidth = ctx.measureText(b.name).width;
      ctx.font = `10px ${FONT}`;
      const subWidth = ctx.measureText(b.label).width;
      const w = Math.max(nameWidth + 10, subWidth) + 18;
      const left = x - w / 2;
      const top = y + LABEL_TOP;
      const hover = this.hoverId === b.id;

      ctx.beginPath();
      ctx.roundRect(left, top, w, LABEL_HEIGHT, 8);
      ctx.fillStyle = hover ? 'rgba(10, 18, 15, 0.88)' : 'rgba(12, 22, 18, 0.7)';
      ctx.fill();
      ctx.strokeStyle = hover ? 'rgba(255, 246, 214, 0.8)' : 'rgba(255, 255, 255, 0.14)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const start = x - (nameWidth + 10) / 2;
      p.ellipse(start + 3, top + 9.5, 3, 3, this.isPlaceholder(b) ? PLACEHOLDER_ACCENT : b.accent);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#ffffff';
      ctx.font = `600 11px ${FONT}`;
      ctx.fillText(b.name, start + 10, top + 13.5);
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(232, 238, 234, 0.8)';
      ctx.font = `10px ${FONT}`;
      ctx.fillText(b.label, x, top + 24.5);
      this.labels.set(b.id, { x: left, y: top, w, h: LABEL_HEIGHT });
    }
  }
}

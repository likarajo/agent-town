import { tileToScreen } from './iso';
import type { ActivityCue, CameraState, TownBuilding, TownData } from './types';

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function shade(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const t = (v: number) => Math.min(255, Math.max(0, Math.round(v + amount * 255)));
  return `rgb(${t(r)}, ${t(g)}, ${t(b)})`;
}

export class TownRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private cues: Record<string, ActivityCue> = {};
  private hoverId: string | null = null;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly town: TownData,
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D unavailable');
    this.ctx = ctx;
  }

  setCues(cues: Record<string, ActivityCue>): void {
    this.cues = cues;
  }

  setHover(id: string | null): void {
    this.hoverId = id;
  }

  resize(cssWidth: number, cssHeight: number): void {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.floor(cssWidth * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(cssHeight * this.dpr));
    this.canvas.style.width = `${cssWidth}px`;
    this.canvas.style.height = `${cssHeight}px`;
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  draw(camera: CameraState): void {
    const { ctx, town } = this;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;

    ctx.clearRect(0, 0, w, h);
    this.drawBackdrop(w, h);

    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(camera.scale, camera.scale);

    this.drawGround();

    const sorted = [...town.buildings].sort((a, b) => a.q + a.r - (b.q + b.r));
    for (const b of sorted) {
      this.drawBuilding(b);
    }

    ctx.restore();
  }

  /** Hit-test buildings in screen space; returns topmost match. */
  hitTest(screenX: number, screenY: number, camera: CameraState): TownBuilding | null {
    const { tileW, tileH } = this.town.ground;
    const localX = (screenX - camera.x) / camera.scale;
    const localY = (screenY - camera.y) / camera.scale;

    const sorted = [...this.town.buildings].sort((a, b) => b.q + b.r - (a.q + a.r));
    for (const b of sorted) {
      const p = tileToScreen(b.q, b.r, tileW, tileH);
      // Diamond footprint + building volume approx
      const dx = Math.abs(localX - p.x);
      const dy = localY - (p.y - 36);
      if (dx / (tileW * 0.55) + Math.abs(dy) / 70 < 1) {
        return b;
      }
    }
    return null;
  }

  private drawBackdrop(w: number, h: number): void {
    const { ctx } = this;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#87b5a4');
    g.addColorStop(0.45, '#5f8f7c');
    g.addColorStop(1, '#2f5a4a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Soft sun glow
    const sun = ctx.createRadialGradient(w * 0.78, h * 0.12, 10, w * 0.78, h * 0.12, w * 0.35);
    sun.addColorStop(0, 'rgba(255, 236, 180, 0.55)');
    sun.addColorStop(1, 'rgba(255, 236, 180, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGround(): void {
    const { ctx, town } = this;
    const { cols, rows, tileW, tileH } = town.ground;

    for (let r = 0; r < rows; r++) {
      for (let q = 0; q < cols; q++) {
        const { x, y } = tileToScreen(q, r, tileW, tileH);
        const checker = (q + r) % 2 === 0;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + tileW / 2, y + tileH / 2);
        ctx.lineTo(x, y + tileH);
        ctx.lineTo(x - tileW / 2, y + tileH / 2);
        ctx.closePath();
        ctx.fillStyle = checker ? '#3f6e58' : '#3a6752';
        ctx.fill();
        ctx.strokeStyle = 'rgba(20, 40, 30, 0.18)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }

    // Path ring around plaza
    ctx.strokeStyle = 'rgba(210, 190, 140, 0.35)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    for (let i = 0; i <= 24; i++) {
      const t = (i / 24) * Math.PI * 2;
      const aq = 4 + Math.cos(t) * 1.35;
      const ar = 4 + Math.sin(t) * 1.35;
      const p = tileToScreen(aq, ar, tileW, tileH);
      if (i === 0) ctx.moveTo(p.x, p.y + tileH / 2);
      else ctx.lineTo(p.x, p.y + tileH / 2);
    }
    ctx.stroke();
  }

  private drawBuilding(b: TownBuilding): void {
    const { ctx, town } = this;
    const { tileW, tileH } = town.ground;
    const { x, y } = tileToScreen(b.q, b.r, tileW, tileH);
    const cue = this.cues[b.id];
    const lit = Boolean(cue?.hasRecentCommits);
    const flag = Boolean(cue?.hasOpenPrs);
    const hover = this.hoverId === b.id;

    ctx.save();
    ctx.translate(x, y);

    if (hover) {
      ctx.shadowColor = 'rgba(255, 250, 220, 0.65)';
      ctx.shadowBlur = 18;
    }

    // Shadow
    ctx.fillStyle = 'rgba(10, 25, 18, 0.28)';
    ctx.beginPath();
    ctx.ellipse(0, tileH * 0.55, tileW * 0.42, tileH * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    switch (b.buildingType) {
      case 'plaza':
        this.drawPlaza(b, lit, flag);
        break;
      case 'townhall':
        this.drawTownHall(b, lit, flag);
        break;
      case 'workshop':
        this.drawWorkshop(b, lit, flag);
        break;
      case 'printshop':
        this.drawPrintShop(b, lit, flag);
        break;
      case 'lab':
        this.drawLab(b, lit, flag);
        break;
      case 'realty':
        this.drawRealty(b, lit, flag);
        break;
      case 'depot':
        this.drawDepot(b, lit, flag);
        break;
      case 'bank':
        this.drawBank(b, lit, flag);
        break;
      case 'consulate':
        this.drawConsulate(b, lit, flag);
        break;
      case 'gym':
        this.drawGym(b, lit, flag);
        break;
      default:
        this.drawBlock(b.accent, 40, 36, lit, flag);
    }

    this.drawLabel(b);
    ctx.restore();
  }

  private drawLabel(b: TownBuilding): void {
    const { ctx } = this;
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(15, 30, 24, 0.55)';
    ctx.fillStyle = '#f4efe4';
    ctx.strokeText(b.name, 0, 58);
    ctx.fillText(b.name, 0, 58);
    ctx.font = '10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(244, 239, 228, 0.85)';
    ctx.strokeText(b.label, 0, 70);
    ctx.fillText(b.label, 0, 70);
  }

  private drawBlock(
    accent: string,
    width: number,
    height: number,
    lit: boolean,
    flag: boolean,
  ): void {
    const { ctx } = this;
    const left = shade(accent, -0.18);
    const right = shade(accent, -0.05);
    const top = shade(accent, 0.12);
    const hw = width / 2;

    // Top
    ctx.beginPath();
    ctx.moveTo(0, -height);
    ctx.lineTo(hw, -height + 12);
    ctx.lineTo(0, -height + 24);
    ctx.lineTo(-hw, -height + 12);
    ctx.closePath();
    ctx.fillStyle = top;
    ctx.fill();

    // Left
    ctx.beginPath();
    ctx.moveTo(-hw, -height + 12);
    ctx.lineTo(0, -height + 24);
    ctx.lineTo(0, 24);
    ctx.lineTo(-hw, 12);
    ctx.closePath();
    ctx.fillStyle = left;
    ctx.fill();

    // Right
    ctx.beginPath();
    ctx.moveTo(hw, -height + 12);
    ctx.lineTo(0, -height + 24);
    ctx.lineTo(0, 24);
    ctx.lineTo(hw, 12);
    ctx.closePath();
    ctx.fillStyle = right;
    ctx.fill();

    // Windows
    const win = lit ? '#ffe7a0' : 'rgba(30, 50, 45, 0.55)';
    ctx.fillStyle = win;
    ctx.fillRect(-18, -8, 8, 10);
    ctx.fillRect(-6, -8, 8, 10);
    ctx.fillStyle = lit ? '#ffe7a0' : 'rgba(20, 35, 30, 0.45)';
    ctx.fillRect(4, -4, 8, 10);

    if (flag) this.drawFlag(18, -height - 4, accent);
  }

  private drawFlag(x: number, y: number, accent: string): void {
    const { ctx } = this;
    ctx.strokeStyle = '#2a2a2a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, y + 22);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + 14, y + 5);
    ctx.lineTo(x, y + 10);
    ctx.closePath();
    ctx.fill();
  }

  private drawRoofPeak(accent: string, height: number, width: number): void {
    const { ctx } = this;
    const hw = width / 2;
    ctx.beginPath();
    ctx.moveTo(0, -height - 18);
    ctx.lineTo(hw + 4, -height + 8);
    ctx.lineTo(0, -height + 18);
    ctx.lineTo(-hw - 4, -height + 8);
    ctx.closePath();
    ctx.fillStyle = shade(accent, -0.28);
    ctx.fill();
  }

  private drawPlaza(b: TownBuilding, lit: boolean, flag: boolean): void {
    const { ctx } = this;
    ctx.fillStyle = shade(b.accent, 0.05);
    ctx.beginPath();
    ctx.ellipse(0, 8, 34, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = shade(b.accent, -0.2);
    ctx.lineWidth = 3;
    ctx.stroke();

    // Fountain
    ctx.fillStyle = lit ? '#9fd6ff' : '#6fa0c4';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(0, -14, 3, 0, Math.PI * 2);
    ctx.fill();
    if (flag) this.drawFlag(28, -20, b.accent);
  }

  private drawTownHall(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 52, 48, lit, false);
    this.drawRoofPeak(b.accent, 48, 52);
    // Clock
    const { ctx } = this;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.arc(0, -28, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -28);
    ctx.lineTo(0, -33);
    ctx.moveTo(0, -28);
    ctx.lineTo(4, -26);
    ctx.stroke();
    if (flag) this.drawFlag(0, -78, b.accent);
  }

  private drawWorkshop(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 46, 34, lit, flag);
    const { ctx } = this;
    // Chimney smoke cue
    ctx.fillStyle = shade(b.accent, -0.3);
    ctx.fillRect(12, -52, 8, 18);
    if (lit) {
      ctx.fillStyle = 'rgba(220,220,220,0.5)';
      ctx.beginPath();
      ctx.ellipse(16, -58, 6, 3, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawPrintShop(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 44, 36, lit, flag);
    const { ctx } = this;
    ctx.fillStyle = '#f4efe4';
    ctx.fillRect(-10, 2, 20, 6);
    ctx.fillStyle = shade(b.accent, -0.35);
    ctx.font = '7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRESS', 0, 7);
  }

  private drawLab(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 42, 44, lit, flag);
    const { ctx } = this;
    ctx.strokeStyle = shade(b.accent, 0.25);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -50);
    ctx.quadraticCurveTo(0, -70, 8, -50);
    ctx.stroke();
    ctx.fillStyle = lit ? '#b8ffd8' : shade(b.accent, 0.2);
    ctx.beginPath();
    ctx.arc(0, -54, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  private drawRealty(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 44, 38, lit, flag);
    const { ctx } = this;
    ctx.fillStyle = '#f4efe4';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(10, 6);
    ctx.lineTo(-10, 6);
    ctx.closePath();
    ctx.fill();
  }

  private drawDepot(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 50, 30, lit, flag);
    const { ctx } = this;
    ctx.fillStyle = shade(b.accent, -0.25);
    ctx.fillRect(-22, -6, 16, 20);
    ctx.fillStyle = lit ? '#ffe7a0' : 'rgba(0,0,0,0.25)';
    ctx.fillRect(-18, 0, 8, 10);
  }

  private drawBank(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 48, 40, lit, flag);
    const { ctx } = this;
    ctx.fillStyle = shade(b.accent, 0.2);
    for (const ox of [-14, -2, 10]) {
      ctx.fillRect(ox, -18, 5, 28);
    }
    ctx.fillRect(-18, -22, 36, 5);
  }

  private drawConsulate(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 44, 42, lit, false);
    this.drawRoofPeak(b.accent, 42, 44);
    if (flag) this.drawFlag(-6, -72, b.accent);
    this.drawFlag(6, -72, shade(b.accent, 0.25));
  }

  private drawGym(b: TownBuilding, lit: boolean, flag: boolean): void {
    this.drawBlock(b.accent, 48, 32, lit, flag);
    const { ctx } = this;
    ctx.strokeStyle = '#f4efe4';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(-8, -6, 8, 0, Math.PI * 2);
    ctx.arc(8, -6, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
}

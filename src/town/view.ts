import type { ActivityCue, TownBuilding, TownData } from './types';
import { createView2D } from './view2d';

/** What the app needs from a town view, whether it is the 3D town or the flat 2D fallback. */
export interface TownView {
  readonly kind: '3d' | '2d';
  setTown(town: TownData): void;
  setCues(cues: Record<string, ActivityCue>): void;
  /** Pin the time of day (hours, 0–24), or pass null to follow the clock. */
  setClock(hour: number | null): void;
  /** Highlight a building, for example while its row in the roster panel is hovered. */
  setHover(id: string | null): void;
  resize(width: number, height: number): void;
  /** Frame the whole town, for example after a new roster loads. */
  recenter(): void;
  /** Draw a frame. `now` drives the ambient animation and is held at 0 for reduced motion. */
  render(now: number): void;
  /** The building under a point, in client coordinates. */
  pick(clientX: number, clientY: number): TownBuilding | null;
  /** Bring a building into view: the 3D camera glides to it, the 2D map centres on it. */
  focus(building: TownBuilding): void;
  /** True while every frame must be drawn: walking, flying, or the camera easing to a stop. */
  busy(): boolean;
}

export interface TownViewOptions {
  canvas: HTMLCanvasElement;
  /** The element around the canvas, which holds the overlays (labels, map controls, walk HUD). */
  stage: HTMLElement;
  town: TownData;
  /** Something changed and needs drawing. */
  onChange: () => void;
  onSelect: (building: TownBuilding | null) => void;
  onHover: (building: TownBuilding | null, clientX: number, clientY: number) => void;
  /** Whether the user prefers reduced motion: camera moves then jump instead of gliding. */
  reducedMotion: () => boolean;
}

/** The 3D town, unless the device can't draw it or `?view=2d` asks for the flat map. */
export function chooseView(search: string, webgl: boolean): '3d' | '2d' {
  return webgl && new URLSearchParams(search).get('view') !== '2d' ? '3d' : '2d';
}

function webglAvailable(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl');
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return Boolean(gl);
  } catch {
    return false;
  }
}

/**
 * Pick the view before anything draws on the canvas: a canvas can't hold both a 2D and a WebGL
 * context. The 3D code (three.js) is a separate chunk, fetched only when it will be used.
 */
export async function createTownView(options: TownViewOptions): Promise<TownView> {
  if (chooseView(window.location.search, webglAvailable()) === '3d') {
    try {
      const { createView3D } = await import('./three/renderer3d');
      return createView3D(options);
    } catch (err) {
      console.warn('The 3D town is unavailable; using the 2D map.', err);
      const fresh = options.canvas.cloneNode() as HTMLCanvasElement;
      options.canvas.replaceWith(fresh);
      options = { ...options, canvas: fresh };
    }
  }
  return createView2D(options);
}

import type { CameraState } from './types';

export const MIN_SCALE = 0.55;
export const MAX_SCALE = 2.4;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function createCamera(width: number, height: number): CameraState {
  return {
    x: width / 2,
    y: height * 0.42,
    scale: 1,
  };
}

/** Screen-space pan by dx/dy pixels. */
export function panCamera(camera: CameraState, dx: number, dy: number): void {
  camera.x += dx;
  camera.y += dy;
}

/** Zoom toward a screen point (sx, sy). */
export function zoomAt(camera: CameraState, sx: number, sy: number, factor: number): void {
  const next = clampScale(camera.scale * factor);
  const ratio = next / camera.scale;
  camera.x = sx - (sx - camera.x) * ratio;
  camera.y = sy - (sy - camera.y) * ratio;
  camera.scale = next;
}

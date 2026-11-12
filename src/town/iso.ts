/** Axial (q, r) → screen isometric coordinates (before camera). */

export function tileToScreen(
  q: number,
  r: number,
  tileW: number,
  tileH: number,
): { x: number; y: number } {
  return {
    x: (q - r) * (tileW / 2),
    y: (q + r) * (tileH / 2),
  };
}

export function screenToTile(
  x: number,
  y: number,
  tileW: number,
  tileH: number,
): { q: number; r: number } {
  const q = x / tileW + y / tileH;
  const r = y / tileH - x / tileW;
  return { q, r };
}

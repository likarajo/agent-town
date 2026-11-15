import * as THREE from 'three';

const surfaces = new Map<string, THREE.MeshStandardMaterial>();

/** A matte, flat-shaded surface, shared by everything painted this colour. Never disposed. */
export function matte(color: string): THREE.MeshStandardMaterial {
  let material = surfaces.get(color);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true });
    surfaces.set(color, material);
  }
  return material;
}

/** Window glass: reflects the daylight, and goes dark at night with everything else. */
export const GLASS = new THREE.MeshStandardMaterial({ color: '#a9c4d6', roughness: 0.2, metalness: 0.4, flatShading: true });

/** Windows of a bot with commits this week: they glow, by day and by night. */
export const LIT_WINDOW = new THREE.MeshBasicMaterial({ color: '#ffd27a', toneMapped: false });

/** A lamp bulb or anything else that is switched on. */
export function glow(color: string): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ color, toneMapped: false });
}

/** A soft round spot, for pools of lamplight and the sun and moon. */
export function radialTexture(inner: string, outer: string): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, inner);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

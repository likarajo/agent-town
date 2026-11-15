import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { shadeHex } from '../color';
import { tileNoise, type Decoration, type Direction, type TownLayout } from '../layout';
import type { TownData } from '../types';
import type { Post } from './collide';
import { islandSize, TILE, tileToWorld } from './coords';
import { glow, matte, radialTexture } from './materials';

/** Everything on the island that isn't a building: lawn, streets, trees and lamps. */
export interface World {
  group: THREE.Group;
  /** Tree trunks and lamp posts, which a walker can't pass through. */
  posts: Post[];
  /** Lamps switch on, and their pools of light appear, as it gets dark. */
  setNight(night: number): void;
  dispose(): void;
}

const GRASS = '#7fb069';
const ARM: Record<Direction, [number, number]> = { 'q+': [1, 0], 'q-': [-1, 0], 'r+': [0, 1], 'r-': [0, -1] };
/** Half-widths of a street, in metres: kerb and pavement, then the asphalt. */
const KERB = 0.27 * TILE;
const LANE = 0.19 * TILE;

/** A box geometry moved into place, ready to merge with others. */
function placed(width: number, height: number, depth: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(width, height, depth).translate(x, y, z);
}

function lawnTexture(cols: number, rows: number): THREE.CanvasTexture {
  const size = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, size, size);
  const tw = size / cols;
  const th = size / rows;
  for (let r = 0; r < rows; r++) {
    for (let q = 0; q < cols; q++) {
      const n = tileNoise(q, r, 21);
      if (n > 0.4) continue;
      const x = (q + 0.5 + (tileNoise(q, r, 22) - 0.5) * 0.3) * tw;
      const y = (r + 0.5 + (tileNoise(q, r, 23) - 0.5) * 0.3) * th;
      ctx.fillStyle = shadeHex(GRASS, n < 0.2 ? 0.05 : -0.05);
      ctx.beginPath();
      ctx.ellipse(x, y, tw * 0.42, th * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** A floating island: lawn on a slab of earth, over a rocky underside. */
function island(town: TownData, lawn: THREE.Material): THREE.Group {
  const { width, depth } = islandSize(town.ground);
  const group = new THREE.Group();
  const lip = matte('#4f8a4c');
  const top = new THREE.Mesh(new THREE.BoxGeometry(width, 0.8, depth), [lip, lip, lawn, lip, lip, lip]);
  top.position.set(width / 2, -0.4, depth / 2);
  top.receiveShadow = true;
  const earth = new THREE.Mesh(new THREE.BoxGeometry(width, 5, depth), matte('#8c6b4b'));
  earth.position.set(width / 2, -3.3, depth / 2);
  const rock = new THREE.Mesh(
    new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
      .rotateY(Math.PI / 4)
      .rotateX(Math.PI)
      .scale(width * 0.97, 22, depth * 0.97),
    matte('#6f5a48'),
  );
  rock.position.set(width / 2, -5.8 - 11, depth / 2);
  group.add(top, earth, rock);
  return group;
}

/** Kerbs, asphalt and dashed centre lines, merged into one mesh each. */
function streets(layout: TownLayout): THREE.Mesh[] {
  const kerbs: THREE.BufferGeometry[] = [];
  const asphalt: THREE.BufferGeometry[] = [];
  const dashes: THREE.BufferGeometry[] = [];
  const strip = (half: number, height: number, y: number, x: number, z: number, link: Direction) => {
    const [du, dv] = ARM[link];
    return du
      ? placed(TILE / 2, height, half * 2, x + (du * TILE) / 4, y, z)
      : placed(half * 2, height, TILE / 2, x, y, z + (dv * TILE) / 4);
  };
  for (const road of layout.roads) {
    const { x, z } = tileToWorld(road.q, road.r);
    kerbs.push(placed(KERB * 2, 0.12, KERB * 2, x, 0.06, z));
    asphalt.push(placed(LANE * 2, 0.1, LANE * 2, x, 0.09, z));
    for (const link of road.links) {
      kerbs.push(strip(KERB, 0.12, 0.06, x, z, link));
      asphalt.push(strip(LANE, 0.1, 0.09, x, z, link));
      const [du, dv] = ARM[link];
      for (const start of [0.5, 2.7]) {
        const mid = start + 0.6;
        dashes.push(du ? placed(1.2, 0.04, 0.18, x + du * mid, 0.15, z) : placed(0.18, 0.04, 1.2, x, 0.15, z + dv * mid));
      }
    }
  }
  const meshes: THREE.Mesh[] = [];
  for (const [parts, color] of [
    [kerbs, '#d8d0c0'],
    [asphalt, '#6f757b'],
    [dashes, '#efe9da'],
  ] as const) {
    if (!parts.length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts), matte(color));
    mesh.receiveShadow = true;
    meshes.push(mesh);
    for (const part of parts) part.dispose();
  }
  return meshes;
}

function instanced(geometry: THREE.BufferGeometry, material: THREE.Material, count: number): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const rotation = new THREE.Quaternion();
const scale = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function setInstance(mesh: THREE.InstancedMesh, i: number, x: number, y: number, z: number, sx: number, sy = sx, sz = sx, turn = 0): void {
  rotation.setFromAxisAngle(UP, turn);
  mesh.setMatrixAt(i, matrix.compose(position.set(x, y, z), rotation, scale.set(sx, sy, sz)));
}

/** Trees, pines, bushes and flowers: a handful of instanced meshes for the whole island. */
function greenery(decorations: Decoration[], posts: Post[]): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  const of = (kind: Decoration['kind']) => decorations.filter((d) => d.kind === kind);
  const color = new THREE.Color();

  const trees = of('tree');
  if (trees.length) {
    const trunks = instanced(new THREE.CylinderGeometry(0.22, 0.3, 1, 6), matte('#7a5a3e'), trees.length);
    const crowns = instanced(new THREE.IcosahedronGeometry(1, 0), matte('#ffffff'), trees.length);
    trees.forEach((d, i) => {
      const { x, z } = tileToWorld(d.q, d.r);
      const s = 0.85 + (d.variant % 2) * 0.25;
      setInstance(trunks, i, x, 1.2 * s, z, 1, 2.4 * s, 1);
      const r = 2.1 * s;
      setInstance(crowns, i, x, 2.4 * s + r * 0.75, z, r, r * 0.92, r, tileNoise(i, 1, 41) * Math.PI);
      crowns.setColorAt(i, color.set(['#5f9e57', '#4e8f55', '#79aa58'][d.variant]));
      posts.push({ x, z, r: 0.45 });
    });
    out.push(trunks, crowns);
  }

  const pines = of('pine');
  if (pines.length) {
    const trunks = instanced(new THREE.CylinderGeometry(0.18, 0.24, 1, 6), matte('#6b4f37'), pines.length);
    const lower = instanced(new THREE.ConeGeometry(1.9, 3.4, 7), matte('#3f7a52'), pines.length);
    const upper = instanced(new THREE.ConeGeometry(1.4, 2.8, 7), matte('#46845a'), pines.length);
    pines.forEach((d, i) => {
      const { x, z } = tileToWorld(d.q, d.r);
      const turn = tileNoise(i, 2, 41) * Math.PI;
      setInstance(trunks, i, x, 0.7, z, 1, 1.4, 1);
      setInstance(lower, i, x, 1.4 + 1.7, z, 1, 1, 1, turn);
      setInstance(upper, i, x, 3.6 + 1.4, z, 1, 1, 1, turn);
      posts.push({ x, z, r: 0.4 });
    });
    out.push(trunks, lower, upper);
  }

  const bushes = of('bush');
  if (bushes.length) {
    const mesh = instanced(new THREE.IcosahedronGeometry(1, 0), matte('#ffffff'), bushes.length * 2);
    bushes.forEach((d, i) => {
      const { x, z } = tileToWorld(d.q, d.r);
      const green = d.variant === 2 ? '#6aa25a' : '#558f4f';
      setInstance(mesh, i * 2, x - 0.4, 0.55, z, 0.95, 0.7, 0.95);
      setInstance(mesh, i * 2 + 1, x + 0.45, 0.45, z + 0.2, 0.75, 0.55, 0.75);
      mesh.setColorAt(i * 2, color.set(green));
      mesh.setColorAt(i * 2 + 1, color.set(shadeHex(green, -0.08)));
    });
    out.push(mesh);
  }

  const flowers = of('flowers');
  if (flowers.length) {
    const mesh = instanced(new THREE.BoxGeometry(0.28, 0.28, 0.28), matte('#ffffff'), flowers.length * 6);
    const colors = ['#f2a7c3', '#ffe08a', '#ffffff'];
    flowers.forEach((d, i) => {
      const { x, z } = tileToWorld(d.q, d.r);
      for (let k = 0; k < 6; k++) {
        setInstance(mesh, i * 6 + k, x + Math.cos(k * 2.1) * 0.9, 0.16, z + Math.sin(k * 2.1) * 0.9, 1);
        mesh.setColorAt(i * 6 + k, color.set(colors[(k + d.variant) % 3]));
      }
    });
    mesh.castShadow = false;
    out.push(mesh);
  }
  return out;
}

export function buildWorld(town: TownData, layout: TownLayout): World {
  const group = new THREE.Group();
  const posts: Post[] = [];
  const lawnMap = lawnTexture(town.ground.cols, town.ground.rows);
  const lawn = new THREE.MeshStandardMaterial({ map: lawnMap, roughness: 0.95, metalness: 0 });
  group.add(island(town, lawn), ...streets(layout), ...greenery(layout.decorations, posts));

  // Street lamps: posts, heads that light up after dark, and pools of light on the ground.
  const lamps = layout.decorations.filter((d) => d.kind === 'lamp');
  const lampOff = matte('#cfd3d6');
  const lampOn = glow('#ffe3a6');
  const poolMap = radialTexture('rgba(255, 214, 150, 1)', 'rgba(255, 214, 150, 0)');
  const poolMaterial = new THREE.MeshBasicMaterial({
    map: poolMap,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    opacity: 0,
    toneMapped: false,
  });
  let heads: THREE.InstancedMesh | null = null;
  let pools: THREE.InstancedMesh | null = null;
  if (lamps.length) {
    const lampPosts = instanced(new THREE.CylinderGeometry(0.07, 0.09, 1, 6), matte('#3d4247'), lamps.length);
    heads = instanced(new THREE.BoxGeometry(0.55, 0.3, 0.55), lampOff, lamps.length);
    pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), poolMaterial, lamps.length);
    pools.visible = false;
    lamps.forEach((d, i) => {
      const { x, z } = tileToWorld(d.q, d.r);
      setInstance(lampPosts, i, x, 2.2, z, 1, 4.4, 1);
      setInstance(heads!, i, x, 4.5, z, 1);
      setInstance(pools!, i, x, 0.22, z, 9);
      posts.push({ x, z, r: 0.15 });
    });
    group.add(lampPosts, heads, pools);
  }

  return {
    group,
    posts,
    setNight(night) {
      if (heads) heads.material = night > 0.2 ? lampOn : lampOff;
      if (pools) {
        pools.visible = night > 0.05;
        poolMaterial.opacity = 0.34 * night;
      }
    },
    dispose() {
      group.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
      lawnMap.dispose();
      lawn.dispose();
      poolMap.dispose();
      poolMaterial.dispose();
      lampOn.dispose();
    },
  };
}

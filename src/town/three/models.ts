import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { designOf, PLACEHOLDER_DESIGN, SHAPES, tinted, type Design } from '../buildings';
import { PLACEHOLDER_ACCENT } from '../catalog';
import { mixHex, shadeHex } from '../color';
import { PLAZA_RADIUS } from '../layout';
import type { Box } from '../paint';
import type { BuildingType } from '../types';
import { TILE, UNIT } from './coords';
import { GLASS, glow, LIT_WINDOW, matte } from './materials';

/**
 * Low-poly 3D versions of the 2D designs, built from the same boxes (SHAPES). A design's units
 * are tiles across (u along q, v along r) and pixels up; here they become metres. Unlike the 2D
 * map you can walk round these, so every side has windows.
 */
export interface Model {
  group: THREE.Group;
  /** Height of the roof in metres, for the name label. */
  height: number;
  /** Commits this week: the windows glow. */
  setLit(lit: boolean): void;
  /** Open pull requests: the flag flies. */
  setFlag(on: boolean): void;
  animate(now: number, night: number): void;
  dispose(): void;
}

type Face = '+u' | '-u' | '+v' | '-v';

const A = UNIT.across;
const U = UNIT.up;
const FACES: Face[] = ['+v', '+u', '-v', '-u'];

interface WindowOptions {
  from?: number;
  to?: number;
  skip?: (col: number, row: number) => boolean;
}

/** Collects one building's meshes and the panels that light up. */
class Kit {
  readonly group = new THREE.Group();
  /** Window panels; merged into one mesh that switches between glass and lit. */
  readonly glass: THREE.BufferGeometry[] = [];
  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];

  mesh(geometry: THREE.BufferGeometry, material: THREE.Material, shadow = true): THREE.Mesh {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.geometries.push(geometry);
    this.group.add(mesh);
    return mesh;
  }

  /** A material only this building uses, disposed with it. */
  own<T extends THREE.Material>(material: T): T {
    this.materials.push(material);
    return material;
  }

  box(b: Box, color: string): THREE.Mesh {
    const geometry = new THREE.BoxGeometry((b.u1 - b.u0) * A, (b.z1 - b.z0) * U, (b.v1 - b.v0) * A);
    geometry.translate(((b.u0 + b.u1) / 2) * A, ((b.z0 + b.z1) / 2) * U, ((b.v0 + b.v1) / 2) * A);
    return this.mesh(geometry, matte(color));
  }

  /**
   * A flat rectangle on one face of a box: s0..s1 across the face (left to right, seen from
   * outside), z0..z1 up in design pixels, `out` metres off the wall.
   */
  panel(b: Box, face: Face, s0: number, s1: number, z0: number, z1: number, out = 0.04): THREE.BufferGeometry {
    const across = face === '+v' || face === '-v' ? b.u1 - b.u0 : b.v1 - b.v0;
    const geometry = new THREE.PlaneGeometry((s1 - s0) * across * A, (z1 - z0) * U);
    const s = (s0 + s1) / 2;
    const y = ((z0 + z1) / 2) * U;
    if (face === '+v') geometry.translate((b.u0 + (b.u1 - b.u0) * s) * A, y, b.v1 * A + out);
    else if (face === '-v') geometry.rotateY(Math.PI).translate((b.u1 - (b.u1 - b.u0) * s) * A, y, b.v0 * A - out);
    else if (face === '+u') geometry.rotateY(Math.PI / 2).translate(b.u1 * A + out, y, (b.v1 - (b.v1 - b.v0) * s) * A);
    else geometry.rotateY(-Math.PI / 2).translate(b.u0 * A - out, y, (b.v0 + (b.v1 - b.v0) * s) * A);
    return geometry;
  }

  paint(b: Box, face: Face, s0: number, s1: number, z0: number, z1: number, color: string, out = 0.04): THREE.Mesh {
    return this.mesh(this.panel(b, face, s0, s1, z0, z1, out), matte(color), false);
  }

  windows(b: Box, face: Face, cols: number, rows: number, z0: number, z1: number, opts: WindowOptions = {}): void {
    const { from = 0, to = 1, skip } = opts;
    const cw = (to - from) / cols;
    const ch = (z1 - z0) / rows;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (skip?.(col, row)) continue;
        const s0 = from + col * cw + cw * 0.2;
        const s1 = from + (col + 1) * cw - cw * 0.2;
        this.glass.push(this.panel(b, face, s0, s1, z0 + row * ch + ch * 0.2, z0 + (row + 1) * ch - ch * 0.16));
      }
    }
  }

  /** The same grid on all four sides: `cols` across the long faces (±v), `sideCols` on ±u. */
  windowsAround(b: Box, cols: number, sideCols: number, rows: number, z0: number, z1: number): void {
    for (const face of FACES) this.windows(b, face, face[1] === 'v' ? cols : sideCols, rows, z0, z1);
  }

  /** A band of colour round all four sides, between two heights. */
  band(b: Box, z0: number, z1: number, color: string): void {
    const grow = 0.006;
    this.box({ u0: b.u0 - grow, u1: b.u1 + grow, v0: b.v0 - grow, v1: b.v1 + grow, z0, z1 }, color);
  }

  /** A slightly darker inset on a flat roof, so it reads as a roof with a parapet. */
  parapet(b: Box, color: string): void {
    const i = 0.05;
    this.box({ u0: b.u0 + i, u1: b.u1 - i, v0: b.v0 + i, v1: b.v1 - i, z0: b.z1, z1: b.z1 + 0.3 }, shadeHex(color, -0.1));
  }

  hipRoof(b: Box, rise: number, color: string): void {
    const geometry = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4, 1)
      .rotateY(Math.PI / 4)
      .scale((b.u1 - b.u0) * A, rise * U, (b.v1 - b.v0) * A)
      .translate(((b.u0 + b.u1) / 2) * A, b.z1 * U + (rise * U) / 2, ((b.v0 + b.v1) / 2) * A);
    this.mesh(geometry, matte(color));
  }

  /** A pitched roof; with the ridge along u the gable ends face ±u, along v they face ±v. */
  gableRoof(b: Box, rise: number, ridge: 'u' | 'v', roofColor: string, wallColor: string): void {
    const [x0, x1, z0, z1] = [b.u0 * A, b.u1 * A, b.v0 * A, b.v1 * A];
    const y0 = b.z1 * U;
    const y1 = y0 + rise * U;
    const xm = (x0 + x1) / 2;
    const zm = (z0 + z1) / 2;
    const inside = new THREE.Vector3(xm, y0 + 0.01, zm);
    if (ridge === 'u') {
      this.mesh(solid([[[x0, y0, z1], [x1, y0, z1], [x1, y1, zm], [x0, y1, zm]], [[x0, y0, z0], [x1, y0, z0], [x1, y1, zm], [x0, y1, zm]]], inside), matte(roofColor));
      this.mesh(solid([[[x1, y0, z0], [x1, y0, z1], [x1, y1, zm]], [[x0, y0, z0], [x0, y0, z1], [x0, y1, zm]]], inside), matte(wallColor));
    } else {
      this.mesh(solid([[[x1, y0, z0], [x1, y0, z1], [xm, y1, z1], [xm, y1, z0]], [[x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0]]], inside), matte(roofColor));
      this.mesh(solid([[[x0, y0, z1], [x1, y0, z1], [xm, y1, z1]], [[x0, y0, z0], [x1, y0, z0], [xm, y1, z0]]], inside), matte(wallColor));
    }
  }

  /** An upright cylinder at (u, v) in tiles, `radius` in tiles, from z0 to z1 in pixels. */
  cylinder(u: number, v: number, radius: number, z0: number, z1: number, color: string, segments = 12): THREE.Mesh {
    const geometry = new THREE.CylinderGeometry(radius * A, radius * A, (z1 - z0) * U, segments).translate(
      u * A,
      ((z0 + z1) / 2) * U,
      v * A,
    );
    return this.mesh(geometry, matte(color));
  }

  dome(u: number, v: number, radius: number, z: number, color: string): void {
    const geometry = new THREE.SphereGeometry(radius * A, 14, 7, 0, Math.PI * 2, 0, Math.PI / 2).translate(u * A, z * U, v * A);
    this.mesh(geometry, matte(color));
  }

  /** The concrete lot the building stands on. */
  lot(color: string): void {
    const geometry = new THREE.BoxGeometry(TILE * 0.98, 0.12, TILE * 0.98).translate(0, 0.06, 0);
    this.mesh(geometry, matte(color), false);
  }

  /** Merge the window panels into one mesh, glass until the bot has commits this week. */
  finish(): THREE.Mesh | null {
    if (!this.glass.length) return null;
    const merged = mergeGeometries(this.glass);
    for (const g of this.glass) g.dispose();
    return this.mesh(merged, GLASS, false);
  }

  dispose(): void {
    for (const g of this.geometries) g.dispose();
    for (const m of this.materials) m.dispose();
  }
}

/** Polygons (3 or 4 corners) as a closed mesh, each face turned to point away from `inside`. */
function solid(polygons: number[][][], inside: THREE.Vector3): THREE.BufferGeometry {
  const positions: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const centre = new THREE.Vector3();
  for (const poly of polygons) {
    for (let i = 1; i < poly.length - 1; i++) {
      a.fromArray(poly[0]);
      b.fromArray(poly[i]);
      c.fromArray(poly[i + 1]);
      normal.subVectors(b, a).cross(c.clone().sub(a));
      centre.copy(a).add(b).add(c).divideScalar(3).sub(inside);
      const [p, q] = normal.dot(centre) >= 0 ? [b, c] : [c, b];
      positions.push(...a.toArray(), ...p.toArray(), ...q.toArray());
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Shared parts every model has: lit windows, an optional flag, animation hooks. */
interface Parts {
  kit: Kit;
  windows: THREE.Mesh | null;
  height: number;
  flag?: [number, number, number, number];
  accent: string;
  onLit?: (lit: boolean) => void;
  onAnimate?: (now: number, night: number, lit: boolean) => void;
}

function assemble({ kit, windows, height, flag, accent, onLit, onAnimate }: Parts): Model {
  let lit = false;
  let cloth: THREE.Mesh | null = null;
  let rest: Float32Array | null = null;
  const pole = new THREE.Group();
  if (flag) {
    const [u, v, z, poleHeight] = flag;
    const top = (z + poleHeight) * U;
    kit.group.add(pole);
    pole.visible = false;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, poleHeight * U, 6), matte('#3b3f45'));
    stick.position.set(u * A, (z + poleHeight / 2) * U, v * A);
    const clothGeometry = new THREE.PlaneGeometry(1.9, 1.15, 8, 1).translate(0.95, 0, 0);
    rest = Float32Array.from(clothGeometry.attributes.position.array);
    cloth = new THREE.Mesh(
      clothGeometry,
      kit.own(new THREE.MeshStandardMaterial({ color: accent, side: THREE.DoubleSide, roughness: 0.8, flatShading: true })),
    );
    cloth.position.set(u * A + 0.05, top - 0.6, v * A);
    cloth.rotation.y = Math.PI / 4;
    cloth.castShadow = true;
    pole.add(stick, cloth);
  }
  return {
    group: kit.group,
    height,
    setLit(next) {
      lit = next;
      if (windows) windows.material = next ? LIT_WINDOW : GLASS;
      onLit?.(next);
    },
    setFlag(on) {
      pole.visible = on;
    },
    animate(now, night) {
      if (cloth && rest && pole.visible) {
        const position = cloth.geometry.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < position.count; i++) {
          const x = rest[i * 3];
          position.setZ(i, Math.sin(now / 260 + x * 1.8) * 0.16 * x);
        }
        position.needsUpdate = true;
      }
      onAnimate?.(now, night, lit);
    },
    dispose() {
      cloth?.geometry.dispose();
      (pole.children[0] as THREE.Mesh | undefined)?.geometry.dispose();
      kit.dispose();
    },
  };
}

const flagOf = (d: Design): [number, number, number, number] => [d.flag[0], d.flag[1], d.flag[2], d.pole];

function townhall(accent: string): Model {
  const { hall, clockTower } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#f2ece2', 0.14);
  const roof = shadeHex(accent, -0.2);
  kit.lot('#ddd6c8');
  kit.box(hall, wall);
  kit.windows(hall, '+v', 5, 2, 3, 24, { skip: (col, row) => row === 0 && col === 2 });
  kit.windows(hall, '-v', 5, 2, 3, 24);
  kit.windows(hall, '+u', 3, 2, 3, 24);
  kit.windows(hall, '-u', 3, 2, 3, 24);
  kit.paint(hall, '+v', 0.43, 0.57, 0, 10, '#4a4036');
  kit.hipRoof(hall, 9, roof);
  kit.box(clockTower, wall);
  for (const face of ['+v', '-v'] as Face[]) {
    const dial = kit.panel(clockTower, face, 0.2, 0.8, 40, 52, 0.05);
    kit.mesh(new THREE.CircleGeometry(0.9, 20).applyMatrix4(planeMatrix(dial)), matte('#fbf7ee'), false);
    dial.dispose();
  }
  for (const face of ['+u', '-u'] as Face[]) kit.paint(clockTower, face, 0.38, 0.62, 38, 52, shadeHex(wall, -0.35));
  kit.hipRoof(clockTower, 16, roof);
  return assemble({ kit, windows: kit.finish(), height: 74 * U, flag: flagOf(designOf('townhall')), accent });
}

/** The transform that puts a unit shape where a panel sits (its centre and facing). */
function planeMatrix(panel: THREE.BufferGeometry): THREE.Matrix4 {
  panel.computeBoundingBox();
  const centre = panel.boundingBox!.getCenter(new THREE.Vector3());
  const normal = new THREE.Vector3().fromBufferAttribute(panel.attributes.normal as THREE.BufferAttribute, 0);
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
  return new THREE.Matrix4().compose(centre.addScaledVector(normal, 0.01), rotation, new THREE.Vector3(1, 1, 1));
}

function workshop(accent: string): Model {
  const { shed, chimney } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#eadbcc', 0.28);
  const roof = shadeHex(accent, -0.12);
  kit.lot('#ddd6c8');
  kit.box(shed, wall);
  kit.paint(shed, '+v', 0.08, 0.46, 0, 14, '#77726b');
  for (let z = 3; z < 14; z += 3) kit.paint(shed, '+v', 0.08, 0.46, z, z + 0.7, '#5d5953', 0.05);
  kit.windows(shed, '+v', 2, 1, 6, 15, { from: 0.52, to: 0.96 });
  kit.windows(shed, '-v', 4, 1, 6, 15);
  kit.windows(shed, '+u', 3, 1, 8, 17);
  kit.windows(shed, '-u', 3, 1, 8, 17);
  kit.box(chimney, shadeHex(accent, -0.3));
  // Sawtooth roof: three teeth, each with north-light glazing facing +u.
  const rise = 9;
  const step = (shed.u1 - shed.u0) / 3;
  for (let i = 0; i < 3; i++) {
    const ua = shed.u0 + i * step;
    const ub = ua + step;
    const [xa, xb, z0, z1, y0, y1] = [ua * A, ub * A, shed.v0 * A, shed.v1 * A, shed.z1 * U, (shed.z1 + rise) * U];
    const inside = new THREE.Vector3((xa + xb * 2) / 3, y0 + 0.4, (z0 + z1) / 2);
    kit.mesh(solid([[[xa, y0, z0], [xb, y1, z0], [xb, y1, z1], [xa, y0, z1]]], inside), matte(shadeHex(roof, 0.04)));
    kit.mesh(solid([[[xa, y0, z0], [xb, y0, z0], [xb, y1, z0]], [[xa, y0, z1], [xb, y0, z1], [xb, y1, z1]]], inside), matte(wall));
    kit.glass.push(kit.panel({ u0: ua, u1: ub, v0: shed.v0, v1: shed.v1, z0: shed.z1, z1: shed.z1 + rise }, '+u', 0, 1, shed.z1, shed.z1 + rise, 0.02));
  }
  // Smoke from the chimney while the bot is busy.
  const puffs = [0, 1, 2].map(() => {
    const puff = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 0),
      kit.own(new THREE.MeshStandardMaterial({ color: '#ececec', transparent: true, depthWrite: false, flatShading: true })),
    );
    puff.visible = false;
    kit.group.add(puff);
    return puff;
  });
  const top = new THREE.Vector3(((chimney.u0 + chimney.u1) / 2) * A, chimney.z1 * U, ((chimney.v0 + chimney.v1) / 2) * A);
  return assemble({
    kit,
    windows: kit.finish(),
    height: 42 * U,
    flag: flagOf(designOf('workshop')),
    accent,
    onAnimate(now, _night, lit) {
      puffs.forEach((puff, k) => {
        puff.visible = lit;
        if (!lit) return;
        const t = (now / 2600 + k / 3) % 1;
        puff.position.set(top.x + t * 2.2, top.y + 0.8 + t * 7, top.z);
        puff.scale.setScalar(0.7 + t * 1.6);
        (puff.material as THREE.MeshStandardMaterial).opacity = 0.6 * (1 - t);
      });
    },
  });
}

function printshop(accent: string): Model {
  const { shop } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#f5efe5', 0.12);
  kit.lot('#ddd6c8');
  kit.box(shop, wall);
  kit.parapet(shop, wall);
  kit.windowsAround(shop, 3, 3, 2, 17, 36);
  kit.glass.push(kit.panel(shop, '+v', 0.1, 0.9, 2, 11));
  kit.paint(shop, '+u', 0.15, 0.35, 0, 10, '#4b423a');
  kit.glass.push(kit.panel(shop, '+u', 0.5, 0.85, 3, 10));
  kit.windows(shop, '-v', 3, 1, 3, 11);
  kit.windows(shop, '-u', 3, 1, 3, 11);
  // A striped awning over the shop window, sloping out from the wall.
  for (let k = 0; k < 6; k++) {
    const s0 = 0.06 + k * 0.147;
    const x0 = (shop.u0 + (shop.u1 - shop.u0) * s0) * A;
    const x1 = x0 + 0.147 * (shop.u1 - shop.u0) * A;
    const [zw, zo, yt, yb] = [shop.v1 * A, (shop.v1 + 0.12) * A, 14 * U, 10 * U];
    const stripe = solid([[[x0, yt, zw], [x1, yt, zw], [x1, yb, zo], [x0, yb, zo]]], new THREE.Vector3((x0 + x1) / 2, 0, zw - 1));
    kit.mesh(stripe, kit.own(new THREE.MeshStandardMaterial({ color: k % 2 ? '#fbf6ee' : accent, side: THREE.DoubleSide, flatShading: true })));
  }
  return assemble({ kit, windows: kit.finish(), height: 38 * U, flag: flagOf(designOf('printshop')), accent });
}

function lab(accent: string): Model {
  const { labBlock } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#f1f3f1', 0.1);
  kit.lot('#ddd6c8');
  kit.box(labBlock, wall);
  kit.parapet(labBlock, wall);
  kit.windowsAround(labBlock, 6, 6, 1, 4, 12);
  kit.windowsAround(labBlock, 6, 6, 1, 15, 23);
  kit.band(labBlock, 25, 28, accent);
  // An observatory dome; its slit glows when the bot has been busy.
  kit.cylinder(-0.1, -0.1, 0.17, 28, 32, '#dfe3e6', 16);
  kit.dome(-0.1, -0.1, 0.17, 32, '#e6eaee');
  const slitOff = matte('#55606a');
  const slitOn = kit.own(glow('#9effd6'));
  const r = 0.17 * A;
  const slit = kit.mesh(new THREE.BoxGeometry(0.35, r * 0.95, 0.35), slitOff, false);
  slit.position.set(-0.1 * A + r * 0.62, 32 * U + r * 0.42, -0.1 * A + r * 0.62);
  slit.rotation.y = Math.PI / 4;
  return assemble({
    kit,
    windows: kit.finish(),
    height: 40 * U,
    flag: flagOf(designOf('lab')),
    accent,
    onLit: (lit) => {
      slit.material = lit ? slitOn : slitOff;
    },
  });
}

function realty(accent: string): Model {
  const { lobby, glassTower, fin, plantRoom } = SHAPES;
  const kit = new Kit();
  const frame = tinted(accent, '#e9edf0', 0.12);
  kit.lot('#ddd6c8');
  kit.box(lobby, frame);
  for (const face of FACES) kit.glass.push(kit.panel(lobby, face, 0.15, 0.85, 1, 8));
  kit.box(glassTower, mixHex('#7fa4bb', accent, 0.18));
  kit.windowsAround(glassTower, 3, 3, 8, 12, 62);
  kit.box(fin, accent);
  kit.box(plantRoom, frame);
  const mast = kit.cylinder(-0.04, -0.04, 0.006, 69, 104, '#4a5058', 6);
  mast.castShadow = false;
  const lightOff = matte('#5a2a26');
  const lightOn = kit.own(glow('#ff6b5e'));
  const beacon = kit.mesh(new THREE.SphereGeometry(0.28, 8, 6), lightOff, false);
  beacon.position.set(-0.04 * A, 104 * U, -0.04 * A);
  return assemble({
    kit,
    windows: kit.finish(),
    height: 81 * U,
    flag: flagOf(designOf('realty')),
    accent,
    onAnimate(now, night) {
      beacon.material = night > 0.3 && Math.sin(now / 500) > 0 ? lightOn : lightOff;
    },
  });
}

function depot(accent: string): Model {
  const { warehouse } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#e4ddd0', 0.22);
  kit.lot('#ddd6c8');
  kit.box(warehouse, wall);
  for (const face of ['+u', '-u'] as Face[]) {
    for (let s = 0.08; s < 0.95; s += 0.08) kit.paint(warehouse, face, s, s + 0.012, 0, 20, shadeHex(wall, -0.14), 0.03);
    kit.windows(warehouse, face, 3, 1, 13, 18);
  }
  for (const [s0, s1] of [
    [0.12, 0.4],
    [0.56, 0.84],
  ]) {
    kit.paint(warehouse, '+v', s0, s1, 0, 13, '#77716a');
    kit.paint(warehouse, '+v', s0, s1, 0, 1.6, '#e0b13c', 0.05);
    kit.glass.push(kit.panel(warehouse, '+v', s0 + 0.09, s1 - 0.09, 14.5, 16.5));
  }
  kit.windows(warehouse, '-v', 4, 1, 13, 18);
  kit.gableRoof(warehouse, 7, 'u', shadeHex(accent, -0.18), wall);
  kit.box({ u0: 0.18, u1: 0.3, v0: 0.34, v1: 0.46, z0: 0, z1: 7 }, '#b98a52');
  kit.box({ u0: 0.31, u1: 0.41, v0: 0.36, v1: 0.46, z0: 0, z1: 5 }, '#a87c48');
  return assemble({ kit, windows: kit.finish(), height: 27 * U, flag: flagOf(designOf('depot')), accent });
}

function bank(accent: string): Model {
  const { bankHall } = SHAPES;
  const kit = new Kit();
  const stone = tinted(accent, '#efe7d8', 0.12);
  kit.lot('#ddd6c8');
  kit.box(bankHall, stone);
  // A portico: columns in front of a shaded recess, up a short flight of steps.
  kit.paint(bankHall, '+v', 0.08, 0.92, 4, 27, shadeHex(stone, -0.45));
  for (let k = 0; k < 5; k++) {
    const u = bankHall.u0 + (bankHall.u1 - bankHall.u0) * (0.135 + k * 0.19);
    kit.cylinder(u, bankHall.v1 + 0.02, 0.022, 4, 27, shadeHex(stone, 0.1), 10);
  }
  kit.box({ u0: bankHall.u0 + 0.02, u1: bankHall.u1 - 0.02, v0: bankHall.v1 - 0.02, v1: bankHall.v1 + 0.06, z0: 0, z1: 4 }, shadeHex(stone, 0.12));
  kit.windows(bankHall, '+u', 3, 2, 5, 27);
  kit.windows(bankHall, '-u', 3, 2, 5, 27);
  kit.windows(bankHall, '-v', 4, 2, 5, 27);
  kit.gableRoof(bankHall, 11, 'v', shadeHex(accent, -0.2), stone);
  const emblem = new THREE.CircleGeometry(0.75, 18).translate(0, (30 + 3.6) * U, bankHall.v1 * A + 0.03);
  kit.mesh(emblem, matte(shadeHex(accent, 0.1)), false);
  return assemble({ kit, windows: kit.finish(), height: 41 * U, flag: flagOf(designOf('bank')), accent });
}

function consulate(accent: string): Model {
  const { residence } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#f5f0e8', 0.1);
  kit.lot('#ddd6c8');
  kit.box(residence, wall);
  kit.windows(residence, '+v', 3, 3, 3, 36, { skip: (col, row) => col === 1 && row === 0 });
  for (const face of ['+u', '-v', '-u'] as Face[]) kit.windows(residence, face, 3, 3, 3, 36);
  kit.paint(residence, '+v', 0.42, 0.58, 0, 10, '#433a33');
  kit.box(
    {
      u0: residence.u0 + (residence.u1 - residence.u0) * 0.38,
      u1: residence.u0 + (residence.u1 - residence.u0) * 0.62,
      v0: residence.v1,
      v1: residence.v1 + 0.08,
      z0: 11,
      z1: 12,
    },
    accent,
  );
  const crest = new THREE.CircleGeometry(0.6, 16).translate(0, 16 * U, residence.v1 * A + 0.05);
  kit.mesh(crest, matte('#d9b44a'), false);
  kit.hipRoof(residence, 12, shadeHex(accent, -0.15));
  return assemble({ kit, windows: kit.finish(), height: 50 * U, flag: flagOf(designOf('consulate')), accent });
}

function gym(accent: string): Model {
  const { gymHall, billboard } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#eceff1', 0.1);
  kit.lot('#ddd6c8');
  kit.box(gymHall, wall);
  kit.parapet(gymHall, wall);
  kit.windows(gymHall, '+v', 6, 1, 1, 22);
  kit.windows(gymHall, '-v', 6, 1, 1, 22);
  for (const face of ['+u', '-u'] as Face[]) {
    kit.paint(gymHall, face, 0, 1, 17, 21, accent);
    kit.windows(gymHall, face, 3, 1, 4, 14);
  }
  kit.box(billboard, accent);
  // A dumbbell on the rooftop sign.
  const y = 29 * U;
  const z = billboard.v1 * A + 0.06;
  kit.mesh(new THREE.BoxGeometry(2.6, 0.32, 0.08).translate(0, y, z), matte('#ffffff'), false);
  for (const x of [-1.5, 1.5]) kit.mesh(new THREE.BoxGeometry(0.55, 1.5, 0.1).translate(x, y, z), matte('#ffffff'), false);
  return assemble({ kit, windows: kit.finish(), height: 34 * U, flag: flagOf(designOf('gym')), accent });
}

function generic(accent: string): Model {
  const { office } = SHAPES;
  const kit = new Kit();
  const wall = tinted(accent, '#efebe4', 0.18);
  kit.lot('#ddd6c8');
  kit.box(office, wall);
  kit.parapet(office, wall);
  kit.windowsAround(office, 3, 3, 4, 3, 36);
  kit.band(office, 37, 40, accent);
  kit.box({ u0: -0.12, u1: 0.06, v0: -0.12, v1: 0.06, z0: 40, z1: 45 }, '#cfd4d8');
  return assemble({ kit, windows: kit.finish(), height: 45 * U, flag: flagOf(designOf('generic')), accent });
}

/** The one stand-in: a plain grey block on a grey lot, with dark windows, no lights, no flag. */
function placeholder(): Model {
  const { office } = SHAPES;
  const kit = new Kit();
  kit.lot('#b5b8ba');
  kit.box(office, PLACEHOLDER_ACCENT);
  kit.windowsAround(office, 3, 3, 4, 3, 36);
  kit.mesh(mergeGeometries(kit.glass), matte(shadeHex(PLACEHOLDER_ACCENT, -0.3)), false);
  for (const g of kit.glass) g.dispose();
  return assemble({ kit, windows: null, height: PLACEHOLDER_DESIGN.height * U, accent: PLACEHOLDER_ACCENT });
}

/**
 * The plaza: a paved square with rings and benches (only for the plaza at the hub, where the
 * streets meet), and a fountain whose water shines when the bot has been busy.
 */
function plaza(accent: string, atHub: boolean): Model {
  const kit = new Kit();
  const paving = mixHex('#e8dfcc', accent, 0.18);
  if (atHub) {
    kit.mesh(new THREE.CylinderGeometry(PLAZA_RADIUS * TILE, PLAZA_RADIUS * TILE, 0.2, 48).translate(0, 0.1, 0), matte(paving), false);
    for (const radius of [1, 0.65]) {
      const ring = new THREE.RingGeometry(radius * TILE - 0.08, radius * TILE + 0.08, 48).rotateX(-Math.PI / 2).translate(0, 0.21, 0);
      kit.mesh(ring, matte(shadeHex(paving, -0.1)), false);
    }
    for (const [dq, dr, turn] of [
      [0.95, -0.95, Math.PI / 4],
      [-0.95, 0.95, Math.PI / 4],
      [-0.95, -0.95, -Math.PI / 4],
    ]) {
      const seat = kit.mesh(new THREE.BoxGeometry(2.2, 0.45, 0.7), matte('#8a6a4e'));
      seat.position.set(dq * TILE, 0.65, dr * TILE);
      seat.rotation.y = turn;
    }
  } else {
    kit.lot('#ddd6c8');
  }
  const stone = tinted(accent, '#e9e2d3', 0.18);
  kit.mesh(new THREE.CylinderGeometry(4.6, 4.8, 0.9, 24).translate(0, 0.45, 0), matte(stone));
  const waterOff = kit.own(new THREE.MeshStandardMaterial({ color: '#5f9fc6', roughness: 0.15, metalness: 0.2 }));
  const waterDay = kit.own(new THREE.MeshStandardMaterial({ color: '#79c0e8', roughness: 0.1, metalness: 0.2 }));
  const waterNight = kit.own(glow('#8fd8ff'));
  // The basin is a solid drum, so the water sits just above its rim, inside the edge.
  const water = kit.mesh(new THREE.CylinderGeometry(4.15, 4.15, 0.06, 24).translate(0, 0.93, 0), waterOff, false);
  kit.mesh(new THREE.CylinderGeometry(0.45, 0.55, 2.4, 10).translate(0, 2, 0), matte(stone));
  kit.mesh(new THREE.CylinderGeometry(1.6, 1.3, 0.35, 16).translate(0, 3.35, 0), matte(stone));

  // Droplets arcing from the bowl into the basin.
  const DROPS = 48;
  const dropGeometry = new THREE.BufferGeometry();
  dropGeometry.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(DROPS * 3), 3));
  const dropMaterial = kit.own(new THREE.PointsMaterial({ color: '#e4f3ff', size: 0.28, transparent: true, opacity: 0.9 }));
  const drops = new THREE.Points(dropGeometry, dropMaterial);
  kit.group.add(drops);

  let lit = false;
  return assemble({
    kit,
    windows: null,
    height: 6,
    flag: [0.3, -0.3, 0, 34],
    accent,
    onLit(next) {
      lit = next;
    },
    onAnimate(now, night) {
      water.material = lit ? (night > 0.05 ? waterNight : waterDay) : waterOff;
      const position = dropGeometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < DROPS; k++) {
        const angle = (k / DROPS) * Math.PI * 2 * 3.7;
        const t = (now / 900 + k / DROPS) % 1;
        const reach = 0.9 + 2.6 * t;
        position.setXYZ(k, Math.cos(angle) * reach, 3.6 + 2.4 * Math.sin(Math.PI * t) - 2.8 * t, Math.sin(angle) * reach);
      }
      position.needsUpdate = true;
    },
  });
}

const BUILDERS: Record<Exclude<BuildingType, 'plaza'>, (accent: string) => Model> = {
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

/** A building's model: its design, or the grey stand-in when its data didn't load. */
export function buildModel(type: BuildingType, accent: string, opts: { placeholder: boolean; atHub: boolean }): Model {
  if (opts.placeholder) return placeholder();
  if (type === 'plaza') return plaza(accent, opts.atHub);
  return (BUILDERS[type] ?? generic)(accent);
}

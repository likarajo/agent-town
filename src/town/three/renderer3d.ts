import * as THREE from 'three';
import { designOf, PLACEHOLDER_DESIGN } from '../buildings';
import { layoutTown, type TownLayout } from '../layout';
import { hourOf, sceneAt } from '../scene';
import type { ActivityCue, TownBuilding, TownData } from '../types';
import type { TownView, TownViewOptions } from '../view';
import { Aerial, TILTED } from './aerial';
import { freeSpot, type Obstacles, type Post, type Rect } from './collide';
import { footprintOf, islandSize, tileToWorld } from './coords';
import { Labels } from './labels';
import { buildModel, type Model } from './models';
import { Sky } from './sky';
import { EYE_HEIGHT, Walk, WALKER_RADIUS } from './walk';
import { Walkers } from './walkers';
import { buildWorld, type World } from './world';

interface Placed {
  model: Model;
  placeholder: boolean;
}

interface Pose {
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
}

interface CameraMove {
  from: Pose;
  to: Pose;
  start: number;
  duration: number;
  done: () => void;
}

/** The default aerial heading matches the 2D map: looking north-west. */
const DEFAULT_HEADING = Math.PI / 4;
const COARSE = window.matchMedia('(pointer: coarse)').matches;
const AERIAL_HINT = COARSE
  ? 'Pinch to zoom · Two fingers to turn and tilt · Tap a building'
  : 'Drag to pan · Scroll to zoom · Right-drag to turn and tilt · Click a building';
/** A press that moves less than this (px) and lifts quickly is a click, not a drag. */
const CLICK_SLOP = 6;
/** How close (m) a building must be to open it by looking at it while walking. */
const REACH = 8;
/** The plaza's fountain basin, which a walker goes round. */
const FOUNTAIN_RADIUS = 4.9;
const UP = new THREE.Vector3(0, 1, 0);
const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

class Town3D implements TownView {
  readonly kind = '3d' as const;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(45, 1, 0.3, 8000);
  private readonly fog = new THREE.Fog('#d3e9f3', 520, 2800);
  private readonly aerial: Aerial;
  private readonly walk: Walk;
  private readonly labels: Labels;
  private readonly buildings = new THREE.Group();
  private readonly models = new Map<string, Placed>();
  private readonly walkers = new Walkers();
  private readonly ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly hint: HTMLElement | null;
  private readonly walkButton: HTMLElement;
  private town: TownData;
  private layout: TownLayout;
  private sky!: Sky;
  private world!: World;
  private obstacles: Obstacles = { rects: [], posts: [], bounds: { minX: 0, maxX: 0, minZ: 0, maxZ: 0 } };
  private cues: Record<string, ActivityCue> = {};
  private fixedHour: number | null = null;
  private hoverId: string | null = null;
  private mode: 'aerial' | 'walk' = 'aerial';
  private move: CameraMove | null = null;
  private moving = false;
  private returnDistance = 140;
  private press: { x: number; y: number; id: number; time: number } | null = null;

  constructor(private readonly options: TownViewOptions) {
    const { canvas, stage } = options;
    this.town = options.town;
    this.layout = layoutTown(this.town);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene.fog = this.fog;

    this.aerial = new Aerial(this.camera, canvas, options.onChange, options.reducedMotion);
    this.aerial.bindButtons(stage.querySelector<HTMLElement>('#map-controls')!, () => this.toggleWalk());
    this.walkButton = stage.querySelector<HTMLElement>('#map-walk')!;
    this.walk = new Walk({
      camera: this.camera,
      canvas,
      stage,
      touch: COARSE,
      obstacles: () => this.obstacles,
      ahead: () => this.ahead(),
      under: (x, y) => this.pick(x, y),
      open: (building) => options.onSelect(building),
      leave: () => this.exitWalk(),
    });
    this.labels = new Labels(canvas, (id) => this.select(this.byId(id)));
    this.hint = stage.querySelector<HTMLElement>('#gesture-hint');
    if (this.hint) this.hint.textContent = AERIAL_HINT;

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.86, 1, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: '#fff6d6', transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.ring.visible = false;
    this.scene.add(this.buildings, this.walkers.group, this.labels.group, this.ring);

    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    this.build();
  }

  // --- Building the scene -------------------------------------------------------------------

  private build(): void {
    if (this.world) {
      this.scene.remove(this.world.group);
      this.world.dispose();
    }
    if (this.sky) {
      this.scene.remove(this.sky.dome, this.sky.clouds, this.sky.hemi, this.sky.sun, this.sky.sun.target);
      this.sky.dispose();
    }
    const { width, depth } = islandSize(this.town.ground);
    const center = new THREE.Vector3(width / 2, 0, depth / 2);
    this.sky = new Sky(center, Math.max(width, depth), COARSE ? 1024 : 2048);
    this.aerial.setBounds(center, Math.max(width, depth));
    this.world = buildWorld(this.town, this.layout);
    this.scene.add(this.sky.dome, this.sky.clouds, this.sky.hemi, this.sky.sun, this.sky.sun.target, this.world.group);

    for (const { model } of this.models.values()) {
      this.buildings.remove(model.group);
      model.dispose();
    }
    this.models.clear();
    for (const b of this.town.buildings) this.place(b);
    this.labels.set(this.town.buildings, (b) => this.footprint(b).height);
    this.updateObstacles();
    this.updateWalkers();
    this.setHover(null);
  }

  /** Bots with commits this week, out walking. */
  private updateWalkers(): void {
    const busy = (b: TownBuilding) => !this.isPlaceholder(b) && Boolean(this.cues[b.id]?.hasRecentCommits);
    this.walkers.set(this.town.buildings, busy, this.layout);
  }

  /** Grey stand-ins: a roster that hasn't loaded, or a bot whose data failed to load. */
  private isPlaceholder(b: TownBuilding): boolean {
    return b.placeholderReason !== undefined || Boolean(this.cues[b.id]?.error);
  }

  private footprint(b: TownBuilding) {
    return footprintOf(b, this.isPlaceholder(b) ? PLACEHOLDER_DESIGN : designOf(b.buildingType));
  }

  private byId(id: string | undefined): TownBuilding | null {
    return this.town.buildings.find((b) => b.id === id) ?? null;
  }

  /** Build (or rebuild) one building's model at its plot, showing its current activity. */
  private place(b: TownBuilding): void {
    const old = this.models.get(b.id);
    if (old) {
      this.buildings.remove(old.model.group);
      old.model.dispose();
    }
    const placeholder = this.isPlaceholder(b);
    const { hub } = this.layout;
    const model = buildModel(b.buildingType, b.accent, { placeholder, atHub: b.q === hub.q && b.r === hub.r });
    const { x, z } = tileToWorld(b.q, b.r);
    model.group.position.set(x, 0, z);
    model.group.userData.buildingId = b.id;
    const cue = this.cues[b.id];
    model.setLit(!placeholder && Boolean(cue?.hasRecentCommits));
    model.setFlag(!placeholder && Boolean(cue?.hasOpenPrs));
    this.buildings.add(model.group);
    this.models.set(b.id, { model, placeholder });
  }

  /** What a walker bumps into: building walls, the fountain, tree trunks, lamp posts, the edge. */
  private updateObstacles(): void {
    const { width, depth } = islandSize(this.town.ground);
    const rects: Rect[] = [];
    const posts: Post[] = [...this.world.posts];
    const { hub } = this.layout;
    for (const b of this.town.buildings) {
      if (b.buildingType === 'plaza' && b.q === hub.q && b.r === hub.r && !this.isPlaceholder(b)) {
        const { x, z } = tileToWorld(b.q, b.r);
        posts.push({ x, z, r: FOUNTAIN_RADIUS });
        continue;
      }
      const f = this.footprint(b);
      rects.push({ minX: f.minX - 0.1, maxX: f.maxX + 0.1, minZ: f.minZ - 0.1, maxZ: f.maxZ + 0.1 });
    }
    this.obstacles = { rects, posts, bounds: { minX: 0.5, maxX: width - 0.5, minZ: 0.5, maxZ: depth - 0.5 } };
  }

  // --- TownView -----------------------------------------------------------------------------

  setTown(town: TownData): void {
    this.town = town;
    this.layout = layoutTown(town);
    this.cues = {};
    this.build();
  }

  /** New activity: windows and flags update in place; only a building that turns grey (or back) is rebuilt. */
  setCues(cues: Record<string, ActivityCue>): void {
    this.cues = cues;
    let rebuilt = false;
    for (const b of this.town.buildings) {
      const placed = this.models.get(b.id);
      if (!placed || placed.placeholder !== this.isPlaceholder(b)) {
        this.place(b);
        rebuilt = true;
        continue;
      }
      const cue = cues[b.id];
      placed.model.setLit(!placed.placeholder && Boolean(cue?.hasRecentCommits));
      placed.model.setFlag(!placed.placeholder && Boolean(cue?.hasOpenPrs));
    }
    if (rebuilt) {
      this.labels.set(this.town.buildings, (b) => this.footprint(b).height);
      this.updateObstacles();
    }
    this.updateWalkers();
  }

  setClock(hour: number | null): void {
    this.fixedHour = hour;
  }

  setHover(id: string | null): void {
    this.hoverId = id;
    this.labels.setHover(id);
    const b = this.byId(id ?? undefined);
    this.ring.visible = Boolean(b) && this.mode === 'aerial';
    if (!b) return;
    const f = this.footprint(b);
    const radius = Math.hypot(f.maxX - f.minX, f.maxZ - f.minZ) / 2 + 1.5;
    this.ring.position.set((f.minX + f.maxX) / 2, 0.3, (f.minZ + f.maxZ) / 2);
    this.ring.scale.setScalar(radius);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.labels.resize(width, height);
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }

  /** Frame every building from the default aerial angle. While walking, stay where you are. */
  recenter(): void {
    if (this.mode === 'walk') return;
    const points = this.town.buildings.map((b) => tileToWorld(b.q, b.r));
    const { width, depth } = islandSize(this.town.ground);
    const xs = points.length ? points.map((p) => p.x) : [0, width];
    const zs = points.length ? points.map((p) => p.z) : [0, depth];
    const target = new THREE.Vector3((Math.min(...xs) + Math.max(...xs)) / 2, 0, (Math.min(...zs) + Math.max(...zs)) / 2);
    const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)) + 40;
    const fit = span / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2))) / Math.min(1, this.camera.aspect);
    const offset = new THREE.Vector3().setFromSphericalCoords(fit * 0.95, TILTED, DEFAULT_HEADING);
    this.aerial.flyTo(target, target.clone().add(offset), 0);
  }

  render(now: number): void {
    const hour = this.fixedHour ?? hourOf(new Date());
    const scene = sceneAt(hour);
    if (this.move) this.stepMove();
    else if (this.mode === 'walk') this.walk.update();
    else this.moving = this.aerial.update();
    this.sky.update(scene, hour, now, this.camera, this.fog);
    this.world.setNight(scene.night);
    for (const { model } of this.models.values()) model.animate(now, scene.night);
    this.walkers.update(now, this.layout);
    if (this.ring.visible) this.ring.material.opacity = 0.55 + 0.35 * Math.sin(now / 260);
    this.labels.update(this.camera, this.mode === 'walk');
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
  }

  pick(clientX: number, clientY: number): TownBuilding | null {
    const rect = this.options.canvas.getBoundingClientRect();
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.firstBuildingHit();
  }

  /** From the air: glide to the building, above its sheet. On foot: turn to face it. */
  focus(building: TownBuilding): void {
    const { x, z } = tileToWorld(building.q, building.r);
    if (this.mode === 'walk') {
      const { x: px, z: pz } = this.walk.position;
      const yaw = Math.atan2(-(x - px), -(z - pz));
      this.camera.quaternion.setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ'));
    } else if (!this.move) {
      this.aerial.glideTo(new THREE.Vector3(x, 0, z), 110, 0.55);
    }
    this.options.onChange();
  }

  busy(): boolean {
    return this.mode === 'walk' || this.move !== null || this.moving || this.aerial.flying;
  }

  // --- Walking ------------------------------------------------------------------------------

  private toggleWalk(): void {
    if (this.mode === 'aerial') this.enterWalk();
    else this.exitWalk();
  }

  /** Drop from the air to street level where the map was looking, facing the same way. */
  private enterWalk(): void {
    if (this.mode !== 'aerial' || this.move) return;
    const target = this.aerial.controls.target;
    const heading = target.clone().sub(this.camera.position).setY(0);
    if (heading.lengthSq() < 1e-6) heading.copy(UP).applyQuaternion(this.camera.quaternion).setY(0);
    heading.normalize();
    const yaw = Math.atan2(-heading.x, -heading.z);
    const spot = freeSpot(target.x, target.z, WALKER_RADIUS + 0.4, this.obstacles);
    this.returnDistance = THREE.MathUtils.clamp(this.camera.position.distanceTo(target), 60, 260);
    this.mode = 'walk';
    this.aerial.setEnabled(false);
    this.hover(null, 0, 0);
    this.options.canvas.style.cursor = '';
    this.setWalkButton(true);
    if (this.hint) this.hint.hidden = true;
    const eye: Pose = {
      position: new THREE.Vector3(spot.x, EYE_HEIGHT, spot.z),
      quaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0, 'YXZ')),
    };
    this.moveCamera(eye, () => this.walk.start(spot.x, spot.z, yaw), 1100);
  }

  /** Fly back up, looking down at wherever the walk ended. */
  private exitWalk(): void {
    if (this.mode !== 'walk' || this.move) return;
    const { x, z } = this.walk.position;
    const yaw = this.walk.yaw;
    this.walk.stop();
    const target = new THREE.Vector3(x, 0, z);
    const position = target.clone().add(new THREE.Vector3().setFromSphericalCoords(this.returnDistance, TILTED, yaw));
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(position, target, UP));
    this.moveCamera({ position, quaternion }, () => {
      this.mode = 'aerial';
      this.aerial.setEnabled(true);
      this.aerial.flyTo(target, position, 0);
      this.setWalkButton(false);
      if (this.hint) this.hint.hidden = false;
    }, 1100);
  }

  private moveCamera(to: Pose, done: () => void, duration: number): void {
    if (this.options.reducedMotion()) {
      this.camera.position.copy(to.position);
      this.camera.quaternion.copy(to.quaternion);
      done();
    } else {
      const from = { position: this.camera.position.clone(), quaternion: this.camera.quaternion.clone() };
      this.move = { from, to, start: performance.now(), duration, done };
    }
    this.options.onChange();
  }

  private stepMove(): void {
    const m = this.move!;
    const t = Math.min(1, (performance.now() - m.start) / m.duration);
    const e = ease(t);
    this.camera.position.lerpVectors(m.from.position, m.to.position, e);
    this.camera.quaternion.slerpQuaternions(m.from.quaternion, m.to.quaternion, e);
    if (t >= 1) {
      this.move = null;
      m.done();
    }
  }

  private setWalkButton(walking: boolean): void {
    this.walkButton.textContent = walking ? 'Aerial' : 'Walk';
    this.walkButton.title = walking ? 'Back to the aerial view' : 'Walk around the town';
    this.walkButton.setAttribute('aria-pressed', String(walking));
  }

  /** The building straight ahead of a walker, within reach. */
  private ahead(): TownBuilding | null {
    this.raycaster.setFromCamera(this.ndc.set(0, 0), this.camera);
    this.raycaster.far = REACH;
    const hit = this.firstBuildingHit();
    this.raycaster.far = Infinity;
    return hit;
  }

  private firstBuildingHit(): TownBuilding | null {
    for (const hit of this.raycaster.intersectObjects(this.buildings.children, true)) {
      let object: THREE.Object3D | null = hit.object;
      while (object && object.userData.buildingId === undefined) object = object.parent;
      if (object) return this.byId(object.userData.buildingId as string);
    }
    return null;
  }

  // --- Pointer input from the air -----------------------------------------------------------

  private get aloft(): boolean {
    return this.mode === 'aerial' && !this.move;
  }

  private select(building: TownBuilding | null): void {
    if (building) this.focus(building);
    this.options.onSelect(building);
  }

  private hover(building: TownBuilding | null, clientX: number, clientY: number): void {
    this.options.onHover(building, clientX, clientY);
    const id = building?.id ?? null;
    if (id === this.hoverId) return;
    this.setHover(id);
    this.options.canvas.style.cursor = building ? 'pointer' : 'grab';
    this.options.onChange();
  }

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.aloft || e.button !== 0) return;
    this.press = { x: e.clientX, y: e.clientY, id: e.pointerId, time: performance.now() };
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const press = this.press;
    this.press = null;
    if (!this.aloft || !press || press.id !== e.pointerId) return;
    const still = Math.hypot(e.clientX - press.x, e.clientY - press.y) < CLICK_SLOP;
    if (still && performance.now() - press.time < 600) this.select(this.pick(e.clientX, e.clientY));
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    if (!this.aloft || e.pointerType === 'touch') return;
    if (e.buttons) {
      if (this.hoverId) this.hover(null, e.clientX, e.clientY);
      return;
    }
    this.hover(this.pick(e.clientX, e.clientY), e.clientX, e.clientY);
  };

  private readonly onPointerLeave = (e: PointerEvent) => {
    if (this.aloft) this.hover(null, e.clientX, e.clientY);
  };
}

export function createView3D(options: TownViewOptions): TownView {
  return new Town3D(options);
}

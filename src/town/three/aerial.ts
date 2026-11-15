import * as THREE from 'three';
import { MapControls } from 'three/addons/controls/MapControls.js';

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Tilt (from straight down) of the 3D view, and the near-zero tilt of the flat 2D view. */
export const TILTED = (52 * Math.PI) / 180;
const FLAT = 0.001;
const MAX_TILT = (80 * Math.PI) / 180;

interface Flight {
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  start: number;
  duration: number;
}

interface MapButtons {
  root: HTMLElement;
  compass: HTMLElement;
  needle: HTMLElement;
  tilt: HTMLElement;
  zoom: HTMLElement;
}

/**
 * The bird's-eye view, like a map app: drag to pan, scroll or pinch to zoom toward the pointer,
 * right-drag, Ctrl-drag or two fingers to rotate and tilt. The arrow keys pan and +/- zoom once
 * the map has focus. Camera moves glide unless the user prefers reduced motion.
 */
export class Aerial {
  readonly controls: MapControls;
  private flight: Flight | null = null;
  private buttons: MapButtons | null = null;

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
    onChange: () => void,
    private readonly reducedMotion: () => boolean,
  ) {
    const controls = (this.controls = new MapControls(camera, dom));
    controls.enableDamping = true;
    controls.dampingFactor = 0.09;
    controls.zoomToCursor = true;
    controls.maxPolarAngle = MAX_TILT;
    controls.keyPanSpeed = 18;
    controls.addEventListener('change', onChange);
    // Keys only while the map has focus, so typing in Settings never moves it.
    dom.tabIndex = 0;
    controls.listenToKeyEvents(dom);
    dom.addEventListener('pointerdown', () => dom.focus({ preventScroll: true }));
    dom.addEventListener('keydown', this.onKey);
  }

  /** Keep the view over the island: the target stays near it and the camera within reach. */
  setBounds(center: THREE.Vector3, span: number): void {
    this.controls.cursor.copy(center);
    this.controls.maxTargetRadius = span * 0.62;
    this.controls.minDistance = 18;
    this.controls.maxDistance = Math.max(320, span * 2.6);
  }

  /** Wire the map buttons: compass (face north), 2D/3D tilt, zoom, and Walk. */
  bindButtons(root: HTMLElement, onWalk: () => void): void {
    const get = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
    this.buttons = {
      root,
      compass: get('map-compass'),
      needle: root.querySelector('.needle')!,
      tilt: get('map-tilt'),
      zoom: root.querySelector('.map-zoom')!,
    };
    root.hidden = false;
    this.buttons.compass.addEventListener('click', () => this.faceNorth());
    this.buttons.tilt.addEventListener('click', () => this.toggleTilt());
    get('map-zoom-in').addEventListener('click', () => this.zoomBy(0.7));
    get('map-zoom-out').addEventListener('click', () => this.zoomBy(1 / 0.7));
    get('map-walk').addEventListener('click', onWalk);
  }

  get flying(): boolean {
    return this.flight !== null;
  }

  /** Move the camera to `position`, looking at `target`. */
  flyTo(target: THREE.Vector3, position: THREE.Vector3, duration = 750): void {
    if (this.reducedMotion() || duration <= 0) {
      this.flight = null;
      this.controls.target.copy(target);
      this.camera.position.copy(position);
      this.camera.lookAt(target);
      this.controls.update();
      return;
    }
    this.flight = {
      fromTarget: this.controls.target.clone(),
      toTarget: target.clone(),
      fromPosition: this.camera.position.clone(),
      toPosition: position.clone(),
      start: performance.now(),
      duration,
    };
  }

  /** Orbit to a new tilt and heading around the current target, keeping the distance. */
  private orbitTo(tilt: number, heading: number, duration = 650): void {
    const distance = this.camera.position.distanceTo(this.controls.target);
    const offset = new THREE.Vector3().setFromSphericalCoords(distance, tilt, heading);
    this.flyTo(this.controls.target.clone(), this.controls.target.clone().add(offset), duration);
  }

  faceNorth(): void {
    this.orbitTo(this.controls.getPolarAngle(), 0);
  }

  /** Straight down (2D), or back to the tilted 3D view. */
  toggleTilt(): void {
    this.orbitTo(this.controls.getPolarAngle() > 0.15 ? FLAT : TILTED, this.controls.getAzimuthalAngle());
  }

  zoomBy(factor: number): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const { minDistance, maxDistance } = this.controls;
    offset.setLength(THREE.MathUtils.clamp(offset.length() * factor, minDistance, maxDistance));
    this.flyTo(this.controls.target.clone(), this.controls.target.clone().add(offset), 320);
  }

  /**
   * Glide to a point on the ground, keeping the current angle and coming no closer than needed.
   * The point ends up at `screenY` on the screen's vertical centre line (-1 bottom, 1 top), so it
   * can sit above a sheet that covers the lower part of the view.
   */
  glideTo(point: THREE.Vector3, maxDistance: number, screenY = 0): void {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const distance = Math.min(offset.length(), maxDistance);
    offset.setLength(distance);
    // Ground distance and height of the camera from its target, and how far beyond the target a
    // point must lie to appear `screenY` up the screen.
    const height = offset.y;
    const ground = Math.hypot(offset.x, offset.z);
    const below = Math.atan2(height, ground);
    const raise = Math.atan(screenY * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    const beyond = height / Math.tan(Math.max(0.05, below - raise)) - ground;
    // "Up the screen" on the ground: the camera's up vector, flattened.
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    const target = point.clone().addScaledVector(up, -beyond);
    this.flyTo(target, target.clone().add(offset));
  }

  /** Advance a glide or the controls' easing, and turn the compass. True while still moving. */
  update(): boolean {
    let moving: boolean;
    if (this.flight) {
      const f = this.flight;
      const t = Math.min(1, (performance.now() - f.start) / f.duration);
      const e = ease(t);
      this.controls.target.lerpVectors(f.fromTarget, f.toTarget, e);
      this.camera.position.lerpVectors(f.fromPosition, f.toPosition, e);
      this.camera.lookAt(this.controls.target);
      if (t >= 1) {
        this.flight = null;
        this.controls.update();
      }
      moving = true;
    } else {
      moving = this.controls.enabled ? this.controls.update() : false;
    }
    if (this.buttons) {
      this.buttons.needle.style.transform = `rotate(${this.controls.getAzimuthalAngle()}rad)`;
      const flat = this.controls.getPolarAngle() < 0.15;
      this.buttons.tilt.textContent = flat ? '3D' : '2D';
      const label = flat ? 'Tilt the view (3D)' : 'Look straight down (2D)';
      this.buttons.tilt.title = label;
      this.buttons.tilt.setAttribute('aria-label', label);
    }
    return moving;
  }

  /** The camera's place and target, to come back to after walking. */
  snapshot(): { target: THREE.Vector3; position: THREE.Vector3 } {
    return { target: this.controls.target.clone(), position: this.camera.position.clone() };
  }

  setEnabled(on: boolean): void {
    this.controls.enabled = on;
    if (!on) this.flight = null;
    if (this.buttons) {
      const { compass, tilt, zoom } = this.buttons;
      for (const element of [compass, tilt, zoom]) element.hidden = !on;
    }
  }

  private readonly onKey = (e: KeyboardEvent) => {
    if (!this.controls.enabled) return;
    if (e.key === '+' || e.key === '=') this.zoomBy(0.8);
    else if (e.key === '-' || e.key === '_') this.zoomBy(1 / 0.8);
  };

  dispose(): void {
    this.controls.dispose();
    this.dom.removeEventListener('keydown', this.onKey);
  }
}

import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import type { TownBuilding } from '../types';
import { JUMP_SPEED, moveCircle, stepVertical, type Obstacles } from './collide';

export const EYE_HEIGHT = 1.7;
/** The walker's size, for collisions. */
export const WALKER_RADIUS = 0.35;
const WALK_SPEED = 4.5;
const RUN_SPEED = 8.5;
/** Radians of turn per pixel dragged, for touch and for mice without pointer lock. */
const LOOK_SPEED = 0.0045;
const MAX_PITCH = 1.45;
/** A press that travels less than this (px) and lifts quickly is a tap. */
const TAP_SLOP = 8;
const UP = new THREE.Vector3(0, 1, 0);

const MOVE_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);

export interface WalkOptions {
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  stage: HTMLElement;
  /** A phone or tablet: on-screen joystick and jump button instead of the keyboard. */
  touch: boolean;
  obstacles(): Obstacles;
  /** The building straight ahead, within reach. */
  ahead(): TownBuilding | null;
  /** The building under a point on the screen. */
  under(clientX: number, clientY: number): TownBuilding | null;
  open(building: TownBuilding): void;
  /** The walker asked to go back to the aerial view (Esc once the mouse is free). */
  leave(): void;
}

/** True when a key press belongs to a text field or the Settings dialog, not to walking. */
function typing(e: KeyboardEvent): boolean {
  return e.target instanceof Element && Boolean(e.target.closest('input, textarea, select, [contenteditable="true"], dialog'));
}

/**
 * First-person walking, like Minecraft: WASD or the arrow keys to move, the mouse to look (click
 * the town to capture it), Space to jump, Shift to run, E to open the building in front of you,
 * Esc to let go of the mouse. On touch screens: a joystick, drag to look, tap to open.
 */
export class Walk {
  active = false;
  private readonly lock: PointerLockControls;
  private readonly keys = new Set<string>();
  private readonly euler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly forward = new THREE.Vector3();
  private readonly right = new THREE.Vector3();
  private x = 0;
  private z = 0;
  private feet = 0;
  private vy = 0;
  private grounded = true;
  private jumpQueued = false;
  private last = 0;
  private lockFailed = false;
  /** Tracked here: three's lock and unlock events fire before its own `isLocked` changes. */
  private locked = false;
  private unlockedAt = 0;
  private target: TownBuilding | null = null;
  private stick = { id: -1, x: 0, y: 0 };
  private drag: { id: number; x: number; y: number; travel: number; start: number } | null = null;
  private readonly hud: HTMLElement;
  private readonly prompt: HTMLElement;
  private readonly help: HTMLElement;
  private readonly touchControls: HTMLElement;
  private readonly stickEl: HTMLElement;
  private readonly knob: HTMLElement;

  constructor(private readonly opts: WalkOptions) {
    const get = (id: string) => opts.stage.querySelector<HTMLElement>(`#${id}`)!;
    this.hud = get('walk-hud');
    this.prompt = get('walk-prompt');
    this.help = get('walk-help');
    this.touchControls = get('walk-touch');
    this.stickEl = get('walk-stick');
    this.knob = this.stickEl.querySelector<HTMLElement>('.knob')!;

    this.lock = new PointerLockControls(opts.camera, opts.canvas);
    this.lock.pointerSpeed = 0.9;
    this.lock.minPolarAngle = Math.PI / 2 - MAX_PITCH;
    this.lock.maxPolarAngle = Math.PI / 2 + MAX_PITCH;
    this.lock.addEventListener('lock', () => {
      this.locked = true;
      this.showHelp();
    });
    this.lock.addEventListener('unlock', () => {
      this.locked = false;
      this.unlockedAt = performance.now();
      this.keys.clear();
      this.showHelp();
    });
    opts.canvas.ownerDocument.addEventListener('pointerlockerror', () => {
      this.lockFailed = true;
      this.showHelp();
    });

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', () => this.keys.clear());
    opts.canvas.addEventListener('pointerdown', this.onPointerDown);
    opts.canvas.addEventListener('pointermove', this.onPointerMove);
    opts.canvas.addEventListener('pointerup', this.onPointerUp);
    opts.canvas.addEventListener('pointercancel', this.onPointerUp);
    this.stickEl.addEventListener('pointerdown', this.onStick);
    this.stickEl.addEventListener('pointermove', this.onStick);
    this.stickEl.addEventListener('pointerup', this.onStickEnd);
    this.stickEl.addEventListener('pointercancel', this.onStickEnd);
    get('walk-jump').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.jumpQueued = true;
    });
  }

  get position(): { x: number; z: number } {
    return { x: this.x, z: this.z };
  }

  /** Which way the walker faces, as a camera yaw (0 looks north, along -z). */
  get yaw(): number {
    return this.euler.setFromQuaternion(this.opts.camera.quaternion, 'YXZ').y;
  }

  /** Start walking at (x, z), facing `yaw`. */
  start(x: number, z: number, yaw: number): void {
    Object.assign(this, { active: true, x, z, feet: 0, vy: 0, grounded: true, jumpQueued: false, target: null });
    this.last = performance.now();
    this.opts.camera.quaternion.setFromEuler(this.euler.set(0, yaw, 0, 'YXZ'));
    this.opts.camera.position.set(x, EYE_HEIGHT, z);
    this.hud.hidden = false;
    this.touchControls.hidden = !this.opts.touch;
    this.prompt.hidden = true;
    this.showHelp();
  }

  stop(): void {
    this.active = false;
    this.keys.clear();
    this.stick = { id: -1, x: 0, y: 0 };
    this.knob.style.transform = '';
    this.drag = null;
    if (this.locked) this.lock.unlock();
    this.hud.hidden = true;
    this.touchControls.hidden = true;
  }

  /** One frame of walking: move, collide, jump and fall, and see what's ahead. */
  update(): void {
    if (!this.active) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const held = (...codes: string[]) => codes.some((code) => this.keys.has(code));
    let ahead = (held('KeyW', 'ArrowUp') ? 1 : 0) - (held('KeyS', 'ArrowDown') ? 1 : 0) - this.stick.y;
    let side = (held('KeyD', 'ArrowRight') ? 1 : 0) - (held('KeyA', 'ArrowLeft') ? 1 : 0) + this.stick.x;
    const amount = Math.hypot(ahead, side);
    if (amount > 1) {
      ahead /= amount;
      side /= amount;
    }
    const speed = held('ShiftLeft', 'ShiftRight') ? RUN_SPEED : WALK_SPEED;
    this.opts.camera.getWorldDirection(this.forward).setY(0).normalize();
    this.right.crossVectors(this.forward, UP);
    const dx = (this.forward.x * ahead + this.right.x * side) * speed * dt;
    const dz = (this.forward.z * ahead + this.right.z * side) * speed * dt;
    ({ x: this.x, z: this.z } = moveCircle(this.x, this.z, dx, dz, WALKER_RADIUS, this.opts.obstacles()));

    if (this.jumpQueued && this.grounded) this.vy = JUMP_SPEED;
    this.jumpQueued = false;
    ({ y: this.feet, vy: this.vy, grounded: this.grounded } = stepVertical(this.feet, this.vy, dt));
    this.opts.camera.position.set(this.x, this.feet + EYE_HEIGHT, this.z);

    const target = this.opts.ahead();
    if (target?.id !== this.target?.id) {
      this.target = target;
      this.prompt.hidden = !target;
      if (target) {
        const what = target.name ? `${target.name}'s ${target.label}` : 'this grey building';
        this.prompt.textContent = `${this.opts.touch ? 'Tap' : 'E'} · ${target.name ? `Open ${what}` : `Why is ${what} grey?`}`;
      }
    }
  }

  private showHelp(): void {
    if (this.opts.touch) {
      this.help.textContent = 'Left thumb to move · Drag to look · Tap a building to open it';
    } else if (this.locked) {
      this.help.textContent = 'WASD to move · Space to jump · Shift to run · E to open · Esc to free the mouse';
    } else if (this.lockFailed) {
      this.help.textContent = 'Drag to look · WASD to move · Space to jump · Click a building to open it · Esc for the aerial view';
    } else {
      this.help.textContent = 'Click the town to look around · WASD to move · Esc for the aerial view';
    }
  }

  /** Open a building's sheet, freeing the mouse so the sheet can be read and clicked. */
  private openTarget(building: TownBuilding): void {
    if (this.locked) this.lock.unlock();
    this.opts.open(building);
  }

  private turn(dx: number, dy: number): void {
    this.euler.setFromQuaternion(this.opts.camera.quaternion, 'YXZ');
    this.euler.y -= dx * LOOK_SPEED;
    this.euler.x = THREE.MathUtils.clamp(this.euler.x - dy * LOOK_SPEED, -MAX_PITCH, MAX_PITCH);
    this.opts.camera.quaternion.setFromEuler(this.euler);
  }

  private readonly onKeyDown = (e: KeyboardEvent) => {
    if (!this.active || typing(e)) return;
    if (e.code === 'Escape') {
      // With the mouse captured the browser takes the first Esc to free it; the next one leaves.
      // Some browsers also pass that first press on, just after the unlock; ignore it.
      if (!this.locked && performance.now() - this.unlockedAt > 400) this.opts.leave();
      return;
    }
    if (e.code === 'KeyE') {
      if (this.target) this.openTarget(this.target);
      return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this.jumpQueued = true;
      return;
    }
    if (MOVE_KEYS.has(e.code)) {
      e.preventDefault();
      this.keys.add(e.code);
    }
  };

  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private readonly onPointerDown = (e: PointerEvent) => {
    if (!this.active) return;
    if (this.locked) {
      if (e.button === 0 && this.target) this.openTarget(this.target);
      return;
    }
    this.drag = { id: e.pointerId, x: e.clientX, y: e.clientY, travel: 0, start: performance.now() };
  };

  private readonly onPointerMove = (e: PointerEvent) => {
    const drag = this.drag;
    if (!this.active || !drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    drag.travel += Math.abs(dx) + Math.abs(dy);
    drag.x = e.clientX;
    drag.y = e.clientY;
    this.turn(dx, dy);
  };

  private readonly onPointerUp = (e: PointerEvent) => {
    const drag = this.drag;
    if (!this.active || !drag || drag.id !== e.pointerId) return;
    this.drag = null;
    if (drag.travel > TAP_SLOP || performance.now() - drag.start > 600) return;
    // A tap or click: open what's under it, or capture the mouse to look around.
    const building = this.opts.under(e.clientX, e.clientY);
    if (building) this.openTarget(building);
    else if (e.pointerType === 'mouse' && !this.lockFailed) this.lock.lock();
  };

  private readonly onStick = (e: PointerEvent) => {
    if (e.type === 'pointerdown') {
      this.stickEl.setPointerCapture(e.pointerId);
      this.stick.id = e.pointerId;
    }
    if (e.pointerId !== this.stick.id) return;
    const box = this.stickEl.getBoundingClientRect();
    const reach = box.width / 2;
    let x = (e.clientX - (box.left + reach)) / reach;
    let y = (e.clientY - (box.top + reach)) / reach;
    const length = Math.hypot(x, y);
    if (length > 1) {
      x /= length;
      y /= length;
    }
    this.stick.x = x;
    this.stick.y = y;
    this.knob.style.transform = `translate(${x * reach * 0.6}px, ${y * reach * 0.6}px)`;
  };

  private readonly onStickEnd = (e: PointerEvent) => {
    if (e.pointerId !== this.stick.id) return;
    this.stick = { id: -1, x: 0, y: 0 };
    this.knob.style.transform = '';
  };
}

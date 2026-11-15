import * as THREE from 'three';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import type { TownBuilding } from '../types';
import { tileToWorld } from './coords';

interface Tag {
  object: CSS2DObject;
  element: HTMLButtonElement;
}

/** Past this distance (metres) name tags fade out while walking, so the street doesn't fill with them. */
const WALK_FADE_START = 45;
const WALK_FADE_END = 85;

/**
 * Name tags over the buildings. They are DOM buttons, so they stay sharp at any zoom, can be
 * clicked (or reached with Tab), and read like the 2D map's tags.
 */
export class Labels {
  readonly group = new THREE.Group();
  private readonly renderer = new CSS2DRenderer();
  private readonly tags = new Map<string, Tag>();
  private readonly spot = new THREE.Vector3();

  constructor(
    canvas: HTMLCanvasElement,
    private readonly onPick: (id: string) => void,
  ) {
    const layer = this.renderer.domElement;
    layer.className = 'label-layer';
    canvas.after(layer);
  }

  /** One tag per named building, above its roof. Stand-ins have no name and get no tag. */
  set(buildings: TownBuilding[], heightOf: (b: TownBuilding) => number): void {
    this.clear();
    for (const b of buildings) {
      if (!b.name) continue;
      const element = document.createElement('button');
      element.type = 'button';
      element.className = 'town-label';
      element.setAttribute('aria-label', `Open ${b.name}'s ${b.label}`);
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = b.accent;
      const name = document.createElement('strong');
      name.textContent = b.name;
      const sub = document.createElement('small');
      sub.textContent = b.label;
      element.append(dot, name, sub);
      element.addEventListener('click', (event) => {
        event.stopPropagation();
        this.onPick(b.id);
      });
      const object = new CSS2DObject(element);
      const { x, z } = tileToWorld(b.q, b.r);
      object.position.set(x, heightOf(b) + 2.5, z);
      object.center.set(0.5, 1);
      this.group.add(object);
      this.tags.set(b.id, { object, element });
    }
  }

  setHover(id: string | null): void {
    for (const [tagId, tag] of this.tags) tag.element.classList.toggle('hover', tagId === id);
  }

  /** Hide every tag (while flying between views) or show them again. */
  setVisible(visible: boolean): void {
    this.renderer.domElement.style.visibility = visible ? '' : 'hidden';
  }

  /** While walking, tags fade with distance; from the air they are always shown. */
  update(camera: THREE.Camera, walking: boolean): void {
    for (const { object, element } of this.tags.values()) {
      if (!walking) {
        element.style.opacity = '';
        continue;
      }
      const distance = this.spot.copy(object.position).setY(camera.position.y).distanceTo(camera.position);
      const fade = 1 - (distance - WALK_FADE_START) / (WALK_FADE_END - WALK_FADE_START);
      element.style.opacity = String(Math.min(1, Math.max(0, fade)));
    }
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.renderer.render(scene, camera);
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
  }

  private clear(): void {
    for (const { object, element } of this.tags.values()) {
      this.group.remove(object);
      element.remove();
    }
    this.tags.clear();
  }

  dispose(): void {
    this.clear();
    this.renderer.domElement.remove();
  }
}

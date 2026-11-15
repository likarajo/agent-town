import * as THREE from 'three';
import { strollPosition, tileNoise, walkerPosition, type TownLayout } from '../layout';
import type { TownBuilding } from '../types';
import { tileToWorld } from './coords';
import { matte } from './materials';

interface Person {
  group: THREE.Group;
  legs: [THREE.Mesh, THREE.Mesh];
  building: TownBuilding;
  phase: number;
  atHub: boolean;
}

const HIP = 0.75;

/**
 * Bots with commits this week walk between their door and the plaza as little low-poly people in
 * their colour, on the same routes as the 2D map. The plaza's own bot strolls round the fountain.
 */
export class Walkers {
  readonly group = new THREE.Group();
  private people: Person[] = [];
  private readonly body = new THREE.CapsuleGeometry(0.22, 0.5, 3, 8);
  private readonly head = new THREE.SphereGeometry(0.19, 10, 8);
  /** Pivots at the hip, so it swings. */
  private readonly leg = new THREE.BoxGeometry(0.12, HIP, 0.14).translate(0, -HIP / 2, 0);

  set(buildings: TownBuilding[], busy: (b: TownBuilding) => boolean, layout: TownLayout): void {
    for (const person of this.people) this.group.remove(person.group);
    this.people = [];
    const { hub, hasPlaza } = layout;
    for (const b of buildings) {
      if (!busy(b)) continue;
      const atHub = b.q === hub.q && b.r === hub.r;
      if (atHub ? !hasPlaza : (layout.paths[b.id]?.length ?? 0) < 2) continue;
      const group = new THREE.Group();
      const body = new THREE.Mesh(this.body, matte(b.accent));
      body.position.y = HIP + 0.47;
      const head = new THREE.Mesh(this.head, matte('#f0d2b4'));
      head.position.y = HIP + 0.47 + 0.47 + 0.16;
      const leg = (x: number) => {
        const mesh = new THREE.Mesh(this.leg, matte('#3a3f46'));
        mesh.position.set(x, HIP, 0);
        return mesh;
      };
      const legs: [THREE.Mesh, THREE.Mesh] = [leg(-0.1), leg(0.1)];
      for (const part of [body, head, ...legs]) part.castShadow = true;
      group.add(body, head, ...legs);
      this.group.add(group);
      this.people.push({ group, legs, building: b, phase: tileNoise(b.q, b.r, 31), atHub });
    }
  }

  update(now: number, layout: TownLayout): void {
    for (const { group, legs, building, phase, atHub } of this.people) {
      const spot = atHub
        ? strollPosition(layout.hub, now, phase)
        : walkerPosition(layout.paths[building.id] ?? [], now, phase, layout.hasPlaza);
      if (!spot) continue;
      const { x, z } = tileToWorld(spot.q, spot.r);
      group.position.set(x, 0, z);
      group.rotation.y = Math.atan2(spot.dq, spot.dr);
      const swing = spot.moving ? Math.sin(now / 140) * 0.6 : 0;
      legs[0].rotation.x = swing;
      legs[1].rotation.x = -swing;
    }
  }

  dispose(): void {
    this.body.dispose();
    this.head.dispose();
    this.leg.dispose();
  }
}

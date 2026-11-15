import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mixHex } from '../color';
import { tileNoise } from '../layout';
import { moonAngles, sunAngles, type Scene, type SkyAngles } from '../scene';
import { radialTexture } from './materials';

const DOME_RADIUS = 2800;

/** Unit vector toward a point in the sky; north is -z and east is +x. */
export function skyDirection({ elevation, azimuth }: SkyAngles, out = new THREE.Vector3()): THREE.Vector3 {
  const flat = Math.cos(elevation);
  return out.set(Math.sin(azimuth) * flat, Math.sin(elevation), -Math.cos(azimuth) * flat);
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/**
 * The sky and the light it casts: a gradient dome around the camera, stars, the sun or moon,
 * drifting clouds, a hemisphere fill light and one shadow-casting directional light.
 */
export class Sky {
  /** Follows the camera, so the dome, stars, sun and moon always surround it. */
  readonly dome = new THREE.Group();
  readonly hemi = new THREE.HemisphereLight('#ffffff', '#5a6b45', 1);
  readonly sun = new THREE.DirectionalLight('#fff6e8', 2.5);
  readonly clouds = new THREE.Group();
  private readonly gradient: THREE.ShaderMaterial;
  private readonly stars: THREE.Points;
  private readonly sunDisc: THREE.Sprite;
  private readonly moonDisc: THREE.Sprite;
  private readonly cloudMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 1,
    flatShading: true,
    transparent: true,
    opacity: 0.92,
  });
  private readonly textures: THREE.Texture[] = [];
  private readonly direction = new THREE.Vector3();

  constructor(
    private readonly center: THREE.Vector3,
    private readonly span: number,
    shadowSize: number,
  ) {
    this.gradient = new THREE.ShaderMaterial({
      uniforms: { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform vec3 top;
        uniform vec3 bottom;
        varying vec3 vDir;
        void main() {
          // Above the horizon: up into the sky colour. Below it, a soft haze under the island.
          vec3 color = vDir.y >= 0.0
            ? mix(bottom, top, clamp(vDir.y * 1.8, 0.0, 1.0))
            : mix(bottom, mix(bottom, top, 0.4), clamp(-vDir.y * 2.2, 0.0, 1.0));
          gl_FragColor = vec4(color, 1.0);
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const domeMesh = new THREE.Mesh(new THREE.SphereGeometry(DOME_RADIUS, 32, 16), this.gradient);
    domeMesh.renderOrder = -2;

    const starPositions: number[] = [];
    for (let i = 0; i < 420; i++) {
      const azimuth = tileNoise(i, 0, 51) * Math.PI * 2;
      const elevation = 0.08 + tileNoise(i, 1, 51) * 1.4;
      const dir = skyDirection({ azimuth, elevation });
      starPositions.push(dir.x * DOME_RADIUS * 0.96, dir.y * DOME_RADIUS * 0.96, dir.z * DOME_RADIUS * 0.96);
    }
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3));
    this.stars = new THREE.Points(
      starGeometry,
      new THREE.PointsMaterial({ color: '#ffffff', size: 2, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }),
    );
    this.stars.renderOrder = -1;

    const disc = (inner: string, outer: string, size: number) => {
      const texture = radialTexture(inner, outer);
      this.textures.push(texture);
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false, toneMapped: false }),
      );
      sprite.scale.setScalar(size);
      sprite.renderOrder = -1;
      return sprite;
    };
    this.sunDisc = disc('rgba(255, 246, 214, 1)', 'rgba(255, 226, 160, 0)', 520);
    this.moonDisc = disc('rgba(238, 241, 251, 1)', 'rgba(205, 218, 255, 0)', 260);
    this.dome.add(domeMesh, this.stars, this.sunDisc, this.moonDisc);

    // Low-poly clouds drifting slowly round the horizon, out of the way of the town.
    for (let i = 0; i < 9; i++) {
      const puffs = [
        [-1.6, 0, 0, 1.4],
        [0, 0.5, 0.2, 1.9],
        [1.7, 0.1, -0.1, 1.5],
        [0.6, -0.2, 1.1, 1.2],
      ].map(([x, y, z, r]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z));
      const cloud = new THREE.Mesh(mergeGeometries(puffs), this.cloudMaterial);
      for (const puff of puffs) puff.dispose();
      const size = 12 + tileNoise(i, 4, 52) * 10;
      cloud.scale.set(size, size * 0.6, size);
      cloud.userData = { seed: tileNoise(i, 2, 52), lane: tileNoise(i, 3, 52), speed: 0.6 + tileNoise(i, 5, 52) * 0.8 };
      this.clouds.add(cloud);
    }

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.setScalar(shadowSize);
    const reach = span * 0.72;
    Object.assign(this.sun.shadow.camera, { left: -reach, right: reach, top: reach, bottom: -reach, near: 1, far: 1600 });
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.sun.target.position.copy(center);
  }

  /** Light, colour and positions for this moment; `now` (ms) moves the clouds and twinkles stars. */
  update(scene: Scene, hour: number, now: number, camera: THREE.Camera, fog: THREE.Fog): void {
    this.dome.position.copy(camera.position);
    (this.gradient.uniforms.top.value as THREE.Color).set(scene.skyTop);
    (this.gradient.uniforms.bottom.value as THREE.Color).set(scene.skyBottom);
    fog.color.set(scene.skyBottom);

    const day = smooth(0.45, 1, scene.daylight);
    this.hemi.color.set(mixHex('#2e3c6a', mixHex(scene.skyTop, '#ffffff', 0.55), day));
    this.hemi.groundColor.set(mixHex('#141c18', '#5a6b45', day));
    this.hemi.intensity = 0.8 + 1.1 * day;

    const sun = sunAngles(hour);
    const moon = moonAngles(hour);
    const sunUp = sun.elevation > 0;
    skyDirection(sunUp ? sun : moon, this.direction);
    this.sun.position.copy(this.center).addScaledVector(this.direction, 600);
    if (sunUp) {
      const height = smooth(0, 0.5, sun.elevation);
      this.sun.color.set(mixHex('#ffad6a', '#fff6e8', height));
      this.sun.intensity = 2.8 * smooth(0, 0.12, sun.elevation);
      this.sun.shadow.intensity = smooth(0, 0.1, sun.elevation);
    } else {
      this.sun.color.set('#9fb2ff');
      this.sun.intensity = 0.55 * scene.night * smooth(0, 0.1, moon.elevation);
      this.sun.shadow.intensity = 0.35 * scene.night;
    }

    this.sunDisc.visible = sunUp;
    this.sunDisc.position.copy(skyDirection(sun)).multiplyScalar(DOME_RADIUS * 0.9);
    this.moonDisc.visible = !sunUp && moon.elevation > 0 && scene.night > 0.3;
    this.moonDisc.position.copy(skyDirection(moon)).multiplyScalar(DOME_RADIUS * 0.9);

    const stars = this.stars.material as THREE.PointsMaterial;
    stars.opacity = scene.night * (0.8 + 0.2 * Math.sin(now / 900));
    this.stars.visible = scene.night > 0.05;

    this.cloudMaterial.opacity = 0.92 - scene.night * 0.5;
    for (const cloud of this.clouds.children) {
      const { seed, lane, speed } = cloud.userData as { seed: number; lane: number; speed: number };
      const angle = seed * Math.PI * 2 + (now / 1000) * speed * 0.004;
      const radius = this.span * (1.7 + lane * 1.5);
      cloud.position.set(
        this.center.x + Math.cos(angle) * radius,
        150 + lane * 130,
        this.center.z + Math.sin(angle) * radius,
      );
    }
  }

  dispose(): void {
    this.dome.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) o.geometry.dispose();
    });
    for (const cloud of this.clouds.children) (cloud as THREE.Mesh).geometry.dispose();
    for (const texture of this.textures) texture.dispose();
    this.gradient.dispose();
    this.cloudMaterial.dispose();
    this.sun.dispose();
  }
}

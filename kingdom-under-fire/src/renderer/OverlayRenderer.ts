import * as THREE from 'three';
import type { World } from '../core/World';

const MAX_RINGS = 2048;
const MAX_MARKERS = 12;
const MAX_PREVIEW = 1024;
const MARKER_SECONDS = 0.9;
const MOVE = new THREE.Color(0x9be36a);
const OWN = new THREE.Color(0x9be36a);
const ENEMY = new THREE.Color(0xff5a4a);

/** Interpolated render position of an entity (same formula as the unit renderer). */
export function renderPosition(world: World, id: number, alpha: number, out: { x: number; z: number }): void {
  const c = world.c;
  out.x = c.prevX[id] + (c.x[id] - c.prevX[id]) * alpha;
  out.z = c.prevZ[id] + (c.z[id] - c.prevZ[id]) * alpha;
}

interface Marker {
  x: number;
  z: number;
  age: number;
  color: THREE.Color;
}

/**
 * Ground decals: selection rings (one InstancedMesh, one draw call for any selection size) and order
 * markers (expanding, fading rings where an order was given).
 */
export class OverlayRenderer {
  readonly group = new THREE.Group();
  private readonly rings: THREE.InstancedMesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly markers: Marker[] = [];
  private readonly previewMesh: THREE.InstancedMesh;
  private readonly tint = new THREE.Color();
  private readonly pos = { x: 0, z: 0 };
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    const geometry = new THREE.RingGeometry(0.55, 0.7, 20).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.rings = new THREE.InstancedMesh(geometry, material, MAX_RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 2;
    this.rings.count = 0;
    this.group.add(this.rings);

    const markerMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.markerMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1.05, 32).rotateX(-Math.PI / 2), markerMaterial, MAX_MARKERS);
    this.markerMesh.frustumCulled = false;
    this.markerMesh.renderOrder = 3;
    this.markerMesh.count = 0;
    this.group.add(this.markerMesh);

    const previewMaterial = new THREE.MeshBasicMaterial({ color: 0xc8f59a, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.previewMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2), previewMaterial, MAX_PREVIEW);
    this.previewMesh.frustumCulled = false;
    this.previewMesh.renderOrder = 3;
    this.previewMesh.count = 0;
    this.group.add(this.previewMesh);
  }

  /** Ghost slots of the formation being drawn with a right-drag (null hides them). */
  preview(points: ArrayLike<number> | null): void {
    const n = points ? Math.min(MAX_PREVIEW, points.length / 2) : 0;
    for (let i = 0; i < n; i++) {
      const x = points![i * 2];
      const z = points![i * 2 + 1];
      this.matrix.makeTranslation(x, this.heightAt(x, z) + 0.07, z);
      this.previewMesh.setMatrixAt(i, this.matrix);
    }
    this.previewMesh.count = n;
    this.previewMesh.instanceMatrix.needsUpdate = true;
  }

  marker(x: number, z: number, attack: boolean): void {
    if (this.markers.length >= MAX_MARKERS) this.markers.shift();
    this.markers.push({ x, z, age: 0, color: attack ? ENEMY : MOVE });
  }

  private updateMarkers(dt: number): void {
    let n = 0;
    for (const m of this.markers) {
      m.age += dt;
      const t = m.age / MARKER_SECONDS;
      if (t >= 1) continue;
      const scale = 0.6 + t * 1.6;
      this.matrix.makeScale(scale, 1, scale).setPosition(m.x, this.heightAt(m.x, m.z) + 0.08, m.z);
      this.markerMesh.setMatrixAt(n, this.matrix);
      this.markerMesh.setColorAt(n, this.tint.copy(m.color).multiplyScalar(1.4 * (1 - t)));
      n++;
    }
    while (this.markers.length && this.markers[0].age >= MARKER_SECONDS) this.markers.shift();
    this.markerMesh.count = n;
    this.markerMesh.instanceMatrix.needsUpdate = true;
    if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
  }

  update(world: World, alpha: number, dt: number, selected: readonly number[], ownTeam: number): void {
    this.updateMarkers(dt);
    let n = 0;
    for (const id of selected) {
      if (n >= MAX_RINGS || !world.entities.isAlive(id)) continue;
      renderPosition(world, id, alpha, this.pos);
      const r = world.c.radius[id] / 0.42;
      this.matrix.makeScale(r, 1, r).setPosition(this.pos.x, this.heightAt(this.pos.x, this.pos.z) + 0.06, this.pos.z);
      this.rings.setMatrixAt(n, this.matrix);
      this.rings.setColorAt(n, world.c.team[id] === ownTeam ? OWN : ENEMY);
      n++;
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}

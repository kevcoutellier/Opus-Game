import * as THREE from 'three';
import type { World } from '../core/World';

const MAX_RINGS = 2048;
const OWN = new THREE.Color(0x9be36a);
const ENEMY = new THREE.Color(0xff5a4a);

/** Interpolated render position of an entity (same formula as the unit renderer). */
export function renderPosition(world: World, id: number, alpha: number, out: { x: number; z: number }): void {
  const c = world.c;
  out.x = c.prevX[id] + (c.x[id] - c.prevX[id]) * alpha;
  out.z = c.prevZ[id] + (c.z[id] - c.prevZ[id]) * alpha;
}

/** Ground decals: selection rings (one InstancedMesh, one draw call for any selection size). */
export class OverlayRenderer {
  readonly group = new THREE.Group();
  private readonly rings: THREE.InstancedMesh;
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
  }

  update(world: World, alpha: number, selected: readonly number[], ownTeam: number): void {
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

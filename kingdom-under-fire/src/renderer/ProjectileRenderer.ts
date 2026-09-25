import * as THREE from 'three';
import type { World } from '../core/World';
import { merge, paint } from './GeometryUtils';

/** Arrows that missed stay planted in the ground this long (a ring buffer of the latest ones). */
const STUCK_ARROWS = 800;
const STUCK_SECONDS = 30;
/** Arrows are drawn a little thicker than real ones: at battle distance a 1 cm shaft is invisible. */
const LENGTH = 1.0;

function arrowGeometry(): THREE.BufferGeometry {
  // Along +z, the tip at z = LENGTH / 2.
  const shaft = paint(new THREE.BoxGeometry(0.06, 0.06, LENGTH), 0x8a6a42);
  const head = paint(new THREE.ConeGeometry(0.075, 0.2, 4).rotateX(Math.PI / 2).translate(0, 0, LENGTH / 2 + 0.09), 0x9aa0a6);
  const fletchV = paint(new THREE.BoxGeometry(0.008, 0.14, 0.24).translate(0, 0, -LENGTH / 2 + 0.14), 0xe8e2d0);
  const fletchH = paint(new THREE.BoxGeometry(0.14, 0.008, 0.24).translate(0, 0, -LENGTH / 2 + 0.14), 0xe8e2d0);
  return merge([shaft, head, fletchV, fletchH]);
}

/**
 * Missiles in flight, interpolated between simulation ticks along their parabola and pointing along it,
 * plus the arrows planted in the ground by the shots that missed: one InstancedMesh, one draw call.
 */
export class ProjectileRenderer {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly stuck = new Float32Array(STUCK_ARROWS * 16);
  private readonly stuckAt = new Float32Array(STUCK_ARROWS).fill(-Infinity);
  private stuckNext = 0;
  private time = 0;
  private readonly pos = { x: 0, y: 0, z: 0 };
  private readonly dir = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly matrix = new THREE.Matrix4();
  private readonly scale = new THREE.Vector3(1, 1, 1);
  private readonly at = new THREE.Vector3();
  private static readonly FORWARD = new THREE.Vector3(0, 0, 1);

  constructor(world: World) {
    const capacity = world.projectiles.capacity + STUCK_ARROWS;
    this.mesh = new THREE.InstancedMesh(arrowGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), capacity);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.count = 0;
    this.group.add(this.mesh);

    world.events.on('projectileLanded', ({ index, hit }) => {
      if (hit) return;
      // Planted along its last direction, the head buried.
      const pool = world.projectiles;
      this.direction(world, index, 1);
      pool.positionAt(index, pool.duration[index], this.pos);
      const y = this.pos.y - (world.projectiles.ey[index] - world.terrain.heightAt(this.pos.x, this.pos.z));
      this.at.set(this.pos.x, y, this.pos.z).addScaledVector(this.dir, 0.3 - LENGTH / 2);
      this.matrix.compose(this.at, this.quat.setFromUnitVectors(ProjectileRenderer.FORWARD, this.dir), this.scale);
      this.matrix.toArray(this.stuck, this.stuckNext * 16);
      this.stuckAt[this.stuckNext] = this.time;
      this.stuckNext = (this.stuckNext + 1) % STUCK_ARROWS;
    });
  }

  /** Unit direction of flight of missile `i` at fraction `u` of its flight, into `this.dir`. */
  private direction(world: World, i: number, u: number): void {
    const p = world.projectiles;
    this.dir
      .set(p.ex[i] - p.sx[i], p.ey[i] - p.sy[i] + 4 * p.arc[i] * (1 - 2 * u), p.ez[i] - p.sz[i])
      .normalize();
  }

  update(world: World, alpha: number, dt: number): void {
    this.time += dt;
    const pool = world.projectiles;
    const array = this.mesh.instanceMatrix.array as Float32Array;
    let n = 0;
    for (let i = 0; i < pool.end; i++) {
      if (!pool.active[i]) continue;
      const t = pool.prevT[i] + (pool.t[i] - pool.prevT[i]) * alpha;
      pool.positionAt(i, t, this.pos);
      this.direction(world, i, Math.min(1, t / pool.duration[i]));
      this.at.set(this.pos.x, this.pos.y, this.pos.z);
      this.matrix.compose(this.at, this.quat.setFromUnitVectors(ProjectileRenderer.FORWARD, this.dir), this.scale);
      this.matrix.toArray(array, n * 16);
      n++;
    }
    for (let k = 0; k < STUCK_ARROWS; k++) {
      if (this.time - this.stuckAt[k] > STUCK_SECONDS) continue;
      array.set(this.stuck.subarray(k * 16, k * 16 + 16), n * 16);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

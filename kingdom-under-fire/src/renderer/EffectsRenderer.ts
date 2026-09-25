import * as THREE from 'three';
import type { World } from '../core/World';

const MAX_PARTICLES = 3000;
const GRAVITY = -9;

/**
 * Pooled particles in a single InstancedMesh (one draw call): blood and sparks on hits, dust on deaths.
 * Particles are spawned from simulation events and simulated on the CPU with plain typed arrays; nothing
 * is allocated or added to the scene while fighting.
 */
export class EffectsRenderer {
  readonly group = new THREE.Group();
  private readonly mesh: THREE.InstancedMesh;
  private readonly px = new Float32Array(MAX_PARTICLES);
  private readonly py = new Float32Array(MAX_PARTICLES);
  private readonly pz = new Float32Array(MAX_PARTICLES);
  private readonly vx = new Float32Array(MAX_PARTICLES);
  private readonly vy = new Float32Array(MAX_PARTICLES);
  private readonly vz = new Float32Array(MAX_PARTICLES);
  private readonly life = new Float32Array(MAX_PARTICLES);
  private readonly maxLife = new Float32Array(MAX_PARTICLES);
  private readonly size = new Float32Array(MAX_PARTICLES);
  private readonly color = new Float32Array(MAX_PARTICLES * 3);
  private readonly drag = new Float32Array(MAX_PARTICLES);
  private cursor = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly tint = new THREE.Color();
  private readonly seedColor = new THREE.Color();
  private rand = 12345;

  constructor(
    world: World,
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    const material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false });
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 0), material, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.group.add(this.mesh);

    world.events.on('unitHit', ({ attack, critical, killed }) => {
      const t = attack.target;
      const x = world.c.x[t];
      const z = world.c.z[t];
      const dx = x - attack.x;
      const dz = z - attack.z;
      const len = Math.hypot(dx, dz) || 1;
      const y = this.heightAt(x, z) + 1.2;
      const blood = 7 + (critical ? 6 : 0) + (killed ? 6 : 0);
      for (let i = 0; i < blood; i++) {
        this.spawn(x, y, z, (dx / len) * 2.2 + this.r(-1.5, 1.5), this.r(1, 3.5), (dz / len) * 2.2 + this.r(-1.5, 1.5), this.r(0.35, 0.7), this.r(0.05, 0.1), 0x7a0f0c, 0.6);
      }
      // Steel on steel.
      for (let i = 0; i < (critical ? 6 : 3); i++) {
        this.spawn(x - (dx / len) * 0.4, y + 0.1, z - (dz / len) * 0.4, this.r(-3, 3), this.r(1.5, 4), this.r(-3, 3), this.r(0.12, 0.25), this.r(0.03, 0.05), 0xffd27a, 1);
      }
    });
    world.events.on('unitDied', ({ x, z }) => {
      const y = this.heightAt(x, z) + 0.2;
      for (let i = 0; i < 12; i++) {
        const a = this.r(0, Math.PI * 2);
        this.spawn(x, y, z, Math.cos(a) * this.r(0.8, 2), this.r(0.3, 1.2), Math.sin(a) * this.r(0.8, 2), this.r(0.8, 1.5), this.r(0.2, 0.35), 0x8a7a60, 3);
      }
    });
  }

  private r(min: number, max: number): number {
    // Visual-only randomness: must not consume the simulation RNG.
    this.rand = (this.rand * 1664525 + 1013904223) >>> 0;
    return min + (max - min) * (this.rand / 4294967296);
  }

  private spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, hex: number, drag: number): void {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX_PARTICLES;
    this.px[i] = x;
    this.py[i] = y;
    this.pz[i] = z;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.vz[i] = vz;
    this.life[i] = this.maxLife[i] = life;
    this.size[i] = size;
    this.drag[i] = drag;
    this.seedColor.setHex(hex);
    this.color[i * 3] = this.seedColor.r;
    this.color[i * 3 + 1] = this.seedColor.g;
    this.color[i * 3 + 2] = this.seedColor.b;
  }

  update(dt: number): void {
    let n = 0;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const damping = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= damping;
      this.vz[i] *= damping;
      this.vy[i] = this.vy[i] * damping + GRAVITY * dt * (this.drag[i] > 2 ? 0.05 : 1);
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      const ground = this.heightAt(this.px[i], this.pz[i]) + 0.03;
      if (this.py[i] < ground) {
        this.py[i] = ground;
        this.vx[i] *= 0.3;
        this.vz[i] *= 0.3;
        this.vy[i] = 0;
      }
      const t = this.life[i] / this.maxLife[i];
      const s = this.size[i] * (this.drag[i] > 2 ? 2 - t : 0.6 + t * 0.4);
      this.matrix.makeScale(s, s, s).setPosition(this.px[i], this.py[i], this.pz[i]);
      this.mesh.setMatrixAt(n, this.matrix);
      this.tint.setRGB(this.color[i * 3], this.color[i * 3 + 1], this.color[i * 3 + 2]).multiplyScalar(this.drag[i] > 2 ? 0.4 + t * 0.6 : 1);
      this.mesh.setColorAt(n, this.tint);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  get active(): number {
    return this.mesh.count;
  }
}

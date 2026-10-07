import * as THREE from 'three';
import type { World } from '../core/World';
import { ability } from '../data/abilities';

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
  /** Flames owed to the burning cells (fractions carried over between frames). */
  private flameBudget = 0;

  constructor(
    private readonly world: World,
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
      // Steel on steel (not for arrows).
      if (attack.missile) return;
      for (let i = 0; i < (critical ? 6 : 3); i++) {
        this.spawn(x - (dx / len) * 0.4, y + 0.1, z - (dz / len) * 0.4, this.r(-3, 3), this.r(1.5, 4), this.r(-3, 3), this.r(0.12, 0.25), this.r(0.03, 0.05), 0xffd27a, 1);
      }
    });
    world.events.on('unitDied', ({ x, z }) => this.dust(x, z, 12, 1));
    // Spells: light gathering around the caster, then a ring of light where the ability strikes.
    world.events.on('abilityStarted', ({ hero, ability: id }) => {
      const x = world.c.x[hero];
      const z = world.c.z[hero];
      const y = this.heightAt(x, z);
      const color = ability(id).color;
      for (let i = 0; i < 18; i++) {
        const a = this.r(0, Math.PI * 2);
        this.spawn(x + Math.cos(a) * 1.2, y + this.r(0.2, 1.8), z + Math.sin(a) * 1.2, -Math.cos(a) * 1.2, this.r(0.8, 2), -Math.sin(a) * 1.2, this.r(0.4, 0.8), this.r(0.06, 0.12), color, 1.5);
      }
    });
    world.events.on('abilityCast', ({ ability: id, x, z, color }) => {
      const def = ability(id);
      let radius = 2;
      for (const e of def.effects) if ('radius' in e && e.kind !== 'missile') radius = Math.max(radius, e.radius);
      this.ring(x, z, radius, color);
    });
    world.events.on('projectileLanded', ({ index, x, z }) => {
      const source = world.projectiles.ability[index];
      if (source) this.ring(x, z, world.projectiles.splash[index], ability(source).color);
    });
    world.events.on('heroLevelUp', ({ id }) => {
      const x = world.c.x[id];
      const z = world.c.z[id];
      const y = this.heightAt(x, z);
      for (let i = 0; i < 40; i++) {
        const a = this.r(0, Math.PI * 2);
        this.spawn(x + Math.cos(a) * 0.8, y + this.r(0, 0.5), z + Math.sin(a) * 0.8, Math.cos(a) * 0.3, this.r(2, 4.5), Math.sin(a) * 0.3, this.r(0.9, 1.5), this.r(0.07, 0.13), 0xffd66b, 0.5);
      }
    });
    world.events.on('heroDodged', ({ id }) => this.dust(world.c.x[id], world.c.z[id], 10, 0.8));
    // A trap blows up: a burst of fire and dust.
    world.events.on('trapSprung', ({ x, z, radius }) => {
      this.ring(x, z, radius, 0xff8a3a);
      this.dust(x, z, 30, 2.2);
      const y = this.heightAt(x, z) + 0.4;
      for (let i = 0; i < 26; i++) {
        this.spawn(x, y, z, this.r(-5, 5), this.r(3, 8), this.r(-5, 5), this.r(0.4, 0.9), this.r(0.08, 0.16), i % 2 ? 0xff7a20 : 0xffd060, 1.2);
      }
    });
    // The hero's great moves: a shockwave for the Smash, a gust for the whirls, sparks for a counter.
    world.events.on('heroMove', ({ hero, move, x, z }) => {
      if (move === 'smash') {
        this.ring(x, z, 5, 0xffb050);
        this.dust(x, z, 30, 2);
      } else if (move === 'special' || move === 'strong5' || move === 'repel') {
        this.ring(x, z, 2.6, 0xffe0a0);
      } else if (move === 'counter') {
        const y = this.heightAt(x, z) + 1.3;
        const fx = Math.sin(world.c.rot[hero]);
        const fz = Math.cos(world.c.rot[hero]);
        for (let i = 0; i < 14; i++) {
          this.spawn(x + fx * 0.8, y, z + fz * 0.8, fx * 3 + this.r(-2.5, 2.5), this.r(1.5, 4), fz * 3 + this.r(-2.5, 2.5), this.r(0.15, 0.3), this.r(0.04, 0.07), 0xfff0c0, 1);
        }
      }
    });
    // An officer's assist: a ring where it strikes (or around him for a heal), light rising from it.
    world.events.on('assistCast', ({ officer, x, z, color, radius }) => {
      this.ring(x, z, Math.min(radius, 8), color);
      const ox = world.c.x[officer];
      const oz = world.c.z[officer];
      const y = this.heightAt(ox, oz);
      for (let i = 0; i < 24; i++) {
        const a = this.r(0, Math.PI * 2);
        this.spawn(ox + Math.cos(a) * 0.7, y + this.r(0.2, 1.6), oz + Math.sin(a) * 0.7, Math.cos(a) * 0.4, this.r(1.5, 3.2), Math.sin(a) * 0.4, this.r(0.6, 1.1), this.r(0.06, 0.11), color, 0.6);
      }
    });
    // A charge hits in a cloud of dust and splinters.
    world.events.on('chargeImpact', ({ x, z, braced }) => {
      this.dust(x, z, 26, 1.8);
      if (!braced) return;
      const y = this.heightAt(x, z) + 1.4;
      for (let i = 0; i < 10; i++) {
        this.spawn(x, y, z, this.r(-3, 3), this.r(1, 4), this.r(-3, 3), this.r(0.5, 0.9), this.r(0.05, 0.09), 0x9b7b4f, 0.8);
      }
    });
  }

  /** A ring of light racing outwards over `radius` metres, with sparks rising from it. */
  private ring(x: number, z: number, radius: number, color: number): void {
    const y = this.heightAt(x, z) + 0.3;
    const count = Math.min(90, 24 + Math.round(radius * 10));
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.r(-0.05, 0.05);
      // Drag 4: the particle travels v / 4 before stopping, i.e. about `radius`.
      const v = radius * this.r(3.6, 4.4);
      this.spawn(x, y, z, Math.cos(a) * v, this.r(0.2, 1), Math.sin(a) * v, this.r(0.35, 0.5), this.r(0.1, 0.18), color, 4);
    }
    for (let i = 0; i < count / 2; i++) {
      const a = this.r(0, Math.PI * 2);
      const d = this.r(0, radius);
      this.spawn(x + Math.cos(a) * d, y, z + Math.sin(a) * d, 0, this.r(2, 5), 0, this.r(0.5, 1), this.r(0.06, 0.12), color, 1);
    }
  }

  private dust(x: number, z: number, count: number, spread: number): void {
    const y = this.heightAt(x, z) + 0.2;
    for (let i = 0; i < count; i++) {
      const a = this.r(0, Math.PI * 2);
      const v = this.r(0.8, 2) * spread;
      this.spawn(x, y, z, Math.cos(a) * v, this.r(0.3, 1.2), Math.sin(a) * v, this.r(0.8, 1.5), this.r(0.2, 0.35), 0x8a7a60, 3);
    }
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

  /** Flames and smoke rising from the burning cells of the forest. */
  private flames(dt: number): void {
    const fire = this.world.fire;
    if (!fire.active.size || dt <= 0) return;
    this.flameBudget = Math.min(260, this.flameBudget + fire.active.size * 14 * dt);
    const chance = Math.min(1, this.flameBudget / fire.active.size);
    for (const cell of fire.active) {
      if (this.flameBudget < 1) break;
      if (this.r(0, 1) > chance) continue;
      this.flameBudget--;
      const x = fire.centreX(cell) + this.r(-1.8, 1.8);
      const z = fire.centreZ(cell) + this.r(-1.8, 1.8);
      const y = this.heightAt(x, z) + this.r(0.2, 2.5);
      const smoke = this.r(0, 1) < 0.3;
      if (smoke) this.spawn(x, y + 2, z, this.r(-0.3, 0.3), this.r(1.5, 2.5), this.r(-0.3, 0.3), this.r(1.5, 2.6), this.r(0.35, 0.6), 0x3a3430, 2.5);
      else this.spawn(x, y, z, this.r(-0.4, 0.4), this.r(1.8, 3.4), this.r(-0.4, 0.4), this.r(0.45, 0.9), this.r(0.3, 0.55), this.r(0, 1) < 0.5 ? 0xff7a1a : 0xffc04a, 2.5);
    }
  }

  update(dt: number): void {
    this.flames(dt);
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

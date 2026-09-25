import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, UnitState } from '../entities/Components';
import { DAMAGE_TYPES, PROJECTILE_TYPES } from '../units/UnitStats';
import type { Attack, DamageSystem } from './DamageSystem';

/** Height (m above the ground) where a missile leaves the bow and where it strikes a body. */
const LAUNCH_HEIGHT = 1.45;
const TORSO_HEIGHT = 1.1;
/** A missile landing this close to a body's edge hits it. */
const HIT_TOLERANCE = 0.3;

/**
 * Missiles in flight, structure-of-arrays with a free list: no allocation during a battle. A missile flies a
 * parabola from (sx, sy, sz) to the point it was aimed at (ex, ey, ez) in `duration` seconds, `arc` metres
 * above the chord at mid-flight. Pure data, read by the renderer.
 */
export class ProjectilePool {
  readonly active: Uint8Array;
  readonly type: Uint8Array;
  readonly team: Uint8Array;
  readonly attacker: Int32Array;
  readonly target: Int32Array;
  readonly damage: Float32Array;
  readonly damageType: Uint8Array;
  readonly critChance: Float32Array;
  readonly sx: Float32Array;
  readonly sy: Float32Array;
  readonly sz: Float32Array;
  readonly ex: Float32Array;
  readonly ey: Float32Array;
  readonly ez: Float32Array;
  readonly arc: Float32Array;
  readonly duration: Float32Array;
  /** Seconds in flight now and at the previous tick (render interpolation). */
  readonly t: Float32Array;
  readonly prevT: Float32Array;
  /** Slots in [0, end) may be active. */
  end = 0;
  count = 0;
  private readonly free: Int32Array;
  private freeCount = 0;

  constructor(readonly capacity = 2048) {
    const f32 = () => new Float32Array(capacity);
    this.active = new Uint8Array(capacity);
    this.type = new Uint8Array(capacity);
    this.team = new Uint8Array(capacity);
    this.attacker = new Int32Array(capacity);
    this.target = new Int32Array(capacity);
    this.damage = f32();
    this.damageType = new Uint8Array(capacity);
    this.critChance = f32();
    this.sx = f32();
    this.sy = f32();
    this.sz = f32();
    this.ex = f32();
    this.ey = f32();
    this.ez = f32();
    this.arc = f32();
    this.duration = f32();
    this.t = f32();
    this.prevT = f32();
    this.free = new Int32Array(capacity);
  }

  /** A free slot, or -1 when the pool is full (the shot is simply not fired). */
  acquire(): number {
    let i: number;
    if (this.freeCount > 0) i = this.free[--this.freeCount];
    else if (this.end < this.capacity) i = this.end++;
    else return -1;
    this.active[i] = 1;
    this.count++;
    return i;
  }

  release(i: number): void {
    this.active[i] = 0;
    this.free[this.freeCount++] = i;
    this.count--;
  }

  /** Position at `time` seconds of flight. */
  positionAt(i: number, time: number, out: { x: number; y: number; z: number }): void {
    const u = Math.min(1, time / this.duration[i]);
    out.x = this.sx[i] + (this.ex[i] - this.sx[i]) * u;
    out.y = this.sy[i] + (this.ey[i] - this.sy[i]) * u + 4 * this.arc[i] * u * (1 - u);
    out.z = this.sz[i] + (this.ez[i] - this.sz[i]) * u;
  }
}

/**
 * Looses a missile of `shooter` at `target`: it aims where the target will be when the missile lands (one
 * step of lead), with a scatter that grows with the distance and shrinks with the shooter's accuracy.
 * Whether it hits is decided on landing, so dense blocks catch the arrows aimed at their neighbours.
 */
export function launchProjectile(world: World, shooter: number, target: number, damage: number): boolean {
  const { c, projectiles: pool, terrain, rng } = world;
  const ranged = UNIT_DEFS[c.unitType[shooter]].ranged;
  if (!ranged) return false;
  const i = pool.acquire();
  if (i < 0) return false;
  const sx = c.x[shooter];
  const sz = c.z[shooter];
  let tx = c.x[target];
  let tz = c.z[target];
  const flight = Math.hypot(tx - sx, tz - sz) / ranged.speed;
  tx += c.vx[target] * flight;
  tz += c.vz[target] * flight;
  const distance = Math.hypot(tx - sx, tz - sz);
  const spread = (1 - ranged.accuracy) * (0.5 + distance * 0.06);
  tx += rng.gaussian() * spread;
  tz += rng.gaussian() * spread;
  pool.type[i] = PROJECTILE_TYPES.indexOf(ranged.projectile);
  pool.team[i] = c.team[shooter];
  pool.attacker[i] = shooter;
  pool.target[i] = target;
  pool.damage[i] = damage;
  pool.damageType[i] = DAMAGE_TYPES.indexOf(ranged.damageType);
  pool.critChance[i] = c.critChance[shooter];
  pool.sx[i] = sx;
  pool.sy[i] = terrain.heightAt(sx, sz) + LAUNCH_HEIGHT;
  pool.sz[i] = sz;
  pool.ex[i] = tx;
  pool.ey[i] = terrain.heightAt(tx, tz) + TORSO_HEIGHT;
  pool.ez[i] = tz;
  pool.arc[i] = 0.4 + distance * 0.13;
  pool.duration[i] = Math.max(0.2, Math.hypot(tx - sx, tz - sz) / ranged.speed);
  pool.t[i] = pool.prevT[i] = 0;
  world.events.emit('projectileLaunched', { x: sx, z: sz, type: pool.type[i] });
  return true;
}

/**
 * Moves the missiles and resolves them where they come down: the nearest enemy body under the landing point
 * is struck (the aimed target first), otherwise the missile is lost in the grass. No friendly fire. Hits of
 * a tick are applied together, like melee blows.
 */
export class ProjectileSystem implements System {
  readonly name = 'projectiles';
  private readonly neighbours = new Int32Array(64);
  private readonly hits: Attack[] = [];

  constructor(private readonly damage: DamageSystem) {}

  update(world: World, dt: number): void {
    const { c, entities, projectiles: pool, spatial } = world;
    for (let i = 0; i < pool.end; i++) {
      if (!pool.active[i]) continue;
      pool.prevT[i] = pool.t[i];
      pool.t[i] += dt;
      if (pool.t[i] < pool.duration[i]) continue;
      const x = pool.ex[i];
      const z = pool.ez[i];
      const team = pool.team[i];
      let struck = -1;
      let best = Infinity;
      const n = spatial.query(x, z, 1.5, c.x, c.z, this.neighbours);
      for (let k = 0; k < n; k++) {
        const e = this.neighbours[k];
        if (!(entities.mask[e] & Comp.Unit) || c.team[e] === team || c.state[e] === UnitState.Dying) continue;
        const gap = Math.hypot(c.x[e] - x, c.z[e] - z) - c.radius[e];
        if (gap > HIT_TOLERANCE) continue;
        const score = gap - (e === pool.target[i] ? 1 : 0);
        if (score < best) {
          best = score;
          struck = e;
        }
      }
      if (struck >= 0) {
        // Knockback and sparks come from the direction of flight.
        const dx = x - pool.sx[i];
        const dz = z - pool.sz[i];
        const len = Math.hypot(dx, dz) || 1;
        const attacker = pool.attacker[i];
        this.hits.push({
          attacker: entities.isAlive(attacker) ? attacker : -1,
          target: struck,
          damage: pool.damage[i],
          damageType: DAMAGE_TYPES[pool.damageType[i]],
          timestamp: world.time.elapsed,
          x: x - (dx / len) * 2,
          z: z - (dz / len) * 2,
          ability: null,
          missile: true,
          criticalChance: pool.critChance[i],
        });
      }
      world.events.emit('projectileLanded', { index: i, x, z, hit: struck >= 0 });
      pool.release(i);
    }
    for (const hit of this.hits) if (c.state[hit.target] !== UnitState.Dying) this.damage.apply(world, hit);
    this.hits.length = 0;
  }
}

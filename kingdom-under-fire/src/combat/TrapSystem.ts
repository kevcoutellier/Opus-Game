import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';
import type { DamageType } from '../units/UnitStats';
import type { Attack, DamageSystem } from './DamageSystem';

/** A trap springs when an enemy comes this close to it (m). */
const TRIGGER = 1.6;

/** A trap laid by sappers: hidden from the enemy, it blows up under the first one to walk over it. */
export interface Trap {
  readonly id: number;
  readonly team: number;
  readonly x: number;
  readonly z: number;
  /** Radius of the blast (m). */
  readonly radius: number;
  readonly damage: number;
  readonly damageType: DamageType;
  /** Seconds the victims stay stunned. */
  readonly stun: number;
  /** Ability that laid it. */
  readonly source: string;
}

/** Traps of the sappers: the blast hurts, stuns, throws back, and sets the woods around it on fire. */
export class TrapSystem implements System {
  readonly name = 'traps';
  private readonly neighbours = new Int32Array(64);
  private readonly hits: Attack[] = [];

  constructor(private readonly damage: DamageSystem) {}

  update(world: World): void {
    const { traps } = world;
    if (!traps.length) return;
    for (let i = traps.length - 1; i >= 0; i--) {
      const trap = traps[i];
      if (!this.triggered(world, trap)) continue;
      traps.splice(i, 1);
      this.spring(world, trap);
    }
    for (const hit of this.hits) if (world.c.state[hit.target] !== UnitState.Dying) this.damage.apply(world, hit);
    this.hits.length = 0;
  }

  private triggered(world: World, trap: Trap): boolean {
    const { c, entities, spatial } = world;
    const n = spatial.query(trap.x, trap.z, TRIGGER + 1, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const u = this.neighbours[k];
      if (!(entities.mask[u] & Comp.Unit) || c.team[u] === trap.team || c.state[u] === UnitState.Dying || c.flying[u]) continue;
      if (Math.hypot(c.x[u] - trap.x, c.z[u] - trap.z) - c.radius[u] <= TRIGGER) return true;
    }
    return false;
  }

  private spring(world: World, trap: Trap): void {
    const { c, entities, spatial } = world;
    const n = spatial.query(trap.x, trap.z, trap.radius + 1.5, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const u = this.neighbours[k];
      if (!(entities.mask[u] & Comp.Unit) || c.team[u] === trap.team || c.state[u] === UnitState.Dying || c.flying[u]) continue;
      const dx = c.x[u] - trap.x;
      const dz = c.z[u] - trap.z;
      const d = Math.hypot(dx, dz);
      if (d - c.radius[u] > trap.radius) continue;
      this.hits.push({
        attacker: -1,
        target: u,
        damage: trap.damage,
        damageType: trap.damageType,
        timestamp: world.time.elapsed,
        x: trap.x,
        z: trap.z,
        ability: trap.source,
        missile: false,
        criticalChance: 0,
      });
      const push = 6 * (90 / Math.max(90, c.mass[u]));
      c.vx[u] += (dx / (d || 1)) * push;
      c.vz[u] += (dz / (d || 1)) * push;
      c.stun[u] = Math.max(c.stun[u], trap.stun);
    }
    world.fire.ignite(trap.x, trap.z, trap.radius);
    world.events.emit('trapSprung', { id: trap.id, team: trap.team, x: trap.x, z: trap.z, radius: trap.radius });
  }
}

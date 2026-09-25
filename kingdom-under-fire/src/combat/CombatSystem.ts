import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, MoraleState, NO_ENTITY, Order, SwingKind, UnitState, type SwingKindId } from '../entities/Components';
import type { FormationManager } from '../formations/FormationManager';
import { IMPACT_FRACTION } from '../units/Unit';
import { DAMAGE_TYPES } from '../units/UnitStats';
import { DamageSystem, type Attack } from './DamageSystem';
import { launchProjectile } from './Projectiles';

/** Targets are re-evaluated every RESCAN_TICKS ticks per unit (staggered by id). */
const RESCAN_TICKS = 9;
/** A target already surrounded by this many attackers is less attractive (fights spread along the line). */
const CROWD_PENALTY = 0.9;
/** Idle/defending units chase enemies at most this far from their slot. */
const LEASH = 14;
/** Distance (m) at which cavalry on the offensive picks a target to charge. */
const CHARGE_SIGHT = 32;
/** Damage of a sweeping blow on the extra enemies it catches, relative to the main one. */
const CLEAVE_DAMAGE = 0.7;

/**
 * Melee and missile resolution: target acquisition through the spatial grid (nearest enemy, penalised when
 * already surrounded), engagement states, swing cycle (wind-up → impact → recovery) and damage at the
 * impact. Archers shoot the nearest enemy in range and draw their dagger when one reaches them; their
 * arrows are resolved on landing by the projectile system. Morale slows the swings of shaken troops and
 * keeps routing ones out of the fight.
 */
export class CombatSystem implements System {
  readonly name = 'combat';
  readonly damage = new DamageSystem();
  private readonly neighbours = new Int32Array(128);
  private attackers: Uint8Array = new Uint8Array(0);
  /** Blows landing this tick, applied together at the end: no side strikes first by iteration order. */
  private readonly impacts: Attack[] = [];
  /** Unit of the current `nearest` search (avoids a closure per call). */
  private seeker = NO_ENTITY;
  private world: World | null = null;
  private readonly enemyOfSeeker = (e: number) => this.isEnemy(this.world!, this.seeker, e);

  constructor(private readonly formations: FormationManager) {}

  update(world: World, dt: number): void {
    const { entities, c, time } = world;
    this.world = world;
    if (this.attackers.length !== entities.capacity) this.attackers = new Uint8Array(entities.capacity);
    const attackers = this.attackers;
    attackers.fill(0);
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      const t = c.target[id];
      if (t >= 0 && (entities.mask[id] & Comp.Unit) && c.state[id] !== UnitState.Dying && attackers[t] < 255) attackers[t]++;
    }

    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & (Comp.Combat | Comp.Unit)) !== (Comp.Combat | Comp.Unit)) continue;
      c.lastHit[id] += dt;
      if (c.state[id] === UnitState.Dying) continue;
      c.attackTimer[id] -= dt;
      const morale = c.moraleState[id];

      if (morale === MoraleState.Routing || morale === MoraleState.Recovering) {
        this.dropTarget(world, id);
        if (morale === MoraleState.Routing) c.state[id] = UnitState.Routing;
        this.advanceSwing(world, id, dt);
        continue;
      }

      if (c.stun[id] > 0) {
        // Frozen or stunned: the swing is lost and nothing else happens.
        c.swing[id] = -1;
        continue;
      }
      if (c.order[id] === Order.Direct) {
        // Steered by the player: no automatic target, only the blows he orders (freeStrike).
        this.dropTarget(world, id);
        if (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking) c.state[id] = UnitState.Idle;
        this.advanceSwing(world, id, dt);
        continue;
      }

      // Validate the current target.
      let target = c.target[id];
      if (target >= 0 && (!this.isEnemy(world, id, target))) target = NO_ENTITY;

      const order = c.order[id];
      const formation = this.formations.get(c.formation[id]);
      const marching = order === Order.Move && formation?.moving;
      if (marching) {
        target = NO_ENTITY;
      } else if (target < 0 || (time.tick + id) % RESCAN_TICKS === 0) {
        target = this.acquire(world, id, target, order, morale === MoraleState.Panicked);
      }
      if (target !== c.target[id]) {
        if (c.target[id] >= 0 && attackers[c.target[id]] > 0) attackers[c.target[id]]--;
        if (target >= 0 && attackers[target] < 255) attackers[target]++;
        c.target[id] = target;
      }

      if (target >= 0) {
        const dist = Math.hypot(c.x[target] - c.x[id], c.z[target] - c.z[id]);
        const contact = c.radius[id] + c.radius[target];
        const range = c.range[id];
        if (dist - contact <= c.reach[id] + 0.05) {
          c.state[id] = UnitState.Attacking;
          c.engageDist[id] = contact + c.reach[id] * 0.85;
          if (c.swing[id] < 0 && c.attackTimer[id] <= 0) this.startSwing(world, id, c.attackWindup[id], c.attackPeriod[id], SwingKind.Blow);
        } else if (range > 0 && dist <= range) {
          // In range: stand and shoot.
          c.state[id] = UnitState.Attacking;
          c.engageDist[id] = range * 0.95;
          if (c.swing[id] < 0 && c.attackTimer[id] <= 0) this.startSwing(world, id, c.rangedWindup[id], c.rangedPeriod[id], SwingKind.Shot);
        } else if (order === Order.Hold) {
          // Holding troops strike what comes to them, they do not chase.
          c.target[id] = NO_ENTITY;
          if (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking) c.state[id] = UnitState.Idle;
        } else {
          c.state[id] = UnitState.Engaging;
          c.engageDist[id] = range > 0 ? range * 0.9 : contact + c.reach[id] * 0.85;
        }
      } else if (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking) {
        c.state[id] = UnitState.Idle;
      }
      this.advanceSwing(world, id, dt);
    }
    for (const attack of this.impacts) {
      if (world.c.state[attack.target] !== UnitState.Dying) this.damage.apply(world, attack);
    }
    this.impacts.length = 0;
  }

  private isEnemy(world: World, id: number, other: number): boolean {
    const { c, entities } = world;
    return entities.has(other, Comp.Unit) && c.state[other] !== UnitState.Dying && c.team[other] !== c.team[id];
  }

  private dropTarget(world: World, id: number): void {
    const { c } = world;
    if (c.target[id] >= 0 && this.attackers[c.target[id]] > 0) this.attackers[c.target[id]]--;
    c.target[id] = NO_ENTITY;
  }

  /** Starts a swing; shaken troops strike slower, hasted ones (Blood Rage) faster. */
  private startSwing(world: World, id: number, windup: number, period: number, kind: SwingKindId): void {
    const { c } = world;
    const haste = c.hasteMul[id];
    c.swing[id] = 0;
    c.swingDuration[id] = windup / IMPACT_FRACTION / haste;
    c.swingKind[id] = kind;
    c.swingPower[id] = 1;
    const morale = c.moraleState[id];
    const slow = morale === MoraleState.Shaken ? 1.12 : morale === MoraleState.Panicked ? 1.35 : 1;
    c.attackTimer[id] = (period * slow) / haste;
  }

  /**
   * A blow ordered by the player to a hero under direct control: it hits every enemy in an arc in front.
   * A heavy blow is slower and hits almost twice as hard. False when the hero is not ready.
   */
  freeStrike(world: World, id: number, heavy: boolean): boolean {
    const { c } = world;
    if (c.swing[id] >= 0 || c.attackTimer[id] > 0 || c.stun[id] > 0 || c.state[id] === UnitState.Dying) return false;
    this.startSwing(world, id, c.attackWindup[id] * (heavy ? 1.5 : 1), c.attackPeriod[id] * (heavy ? 1.6 : 0.8), SwingKind.Arc);
    c.swingPower[id] = heavy ? 1.9 : 1;
    return true;
  }

  private acquire(world: World, id: number, current: number, order: number, panicked: boolean): number {
    const { c } = world;
    if (c.range[id] > 0 && !panicked) return this.acquireShot(world, id, current, order);
    const target = this.acquireMelee(world, id, current, order, panicked);
    if (target >= 0 || panicked || c.chargePower[id] <= 0 || c.chargeCooldown[id] > 0) return target;
    // Cavalry with fresh horses on the offensive looks further for something to charge.
    if (order !== Order.Attack && order !== Order.AttackMove) return target;
    if (order === Order.Attack && current >= 0 && this.isEnemy(world, id, current)) return current;
    this.seeker = id;
    return world.spatial.nearest(c.x[id], c.z[id], CHARGE_SIGHT, c.x, c.z, this.enemyOfSeeker);
  }

  /**
   * Archers: an enemy about to reach them (dagger), else the current target while it stays in range (or
   * whatever the distance when it was ordered), else the nearest enemy in range.
   */
  private acquireShot(world: World, id: number, current: number, order: number): number {
    const { c, spatial } = world;
    const close = this.acquireMelee(world, id, current, Order.Hold, false);
    if (close >= 0) return close;
    if (current >= 0 && this.isEnemy(world, id, current)) {
      if (order === Order.Attack || Math.hypot(c.x[current] - c.x[id], c.z[current] - c.z[id]) <= c.range[id]) return current;
    }
    this.seeker = id;
    return spatial.nearest(c.x[id], c.z[id], c.range[id], c.x, c.z, this.enemyOfSeeker);
  }

  /** Nearest reachable enemy, penalised when crowded; keeps the current one unless another is clearly better. */
  private acquireMelee(world: World, id: number, current: number, order: number, panicked: boolean): number {
    const { c, spatial } = world;
    const x = c.x[id];
    const z = c.z[id];
    let radius = order === Order.Hold ? c.radius[id] * 2 + c.reach[id] + 0.8 : c.aggroRange[id];
    if (order === Order.Attack) radius *= 1.6;
    if (panicked) radius *= 0.5;
    const n = spatial.query(x, z, radius, c.x, c.z, this.neighbours);
    const leashed = order === Order.Defend || order === Order.AttackMove;
    let best = NO_ENTITY;
    let bestScore = Infinity;
    for (let k = 0; k < n; k++) {
      const e = this.neighbours[k];
      if (!this.isEnemy(world, id, e)) continue;
      if (leashed && Math.hypot(c.x[e] - c.slotX[id], c.z[e] - c.slotZ[id]) > LEASH) continue;
      const d = Math.hypot(c.x[e] - x, c.z[e] - z);
      // Fleeing enemies are easy prey but not worth breaking ranks for.
      const routing = c.moraleState[e] === MoraleState.Routing ? 1.5 : 0;
      const crowd = e === current ? 0 : this.attackers[e] * CROWD_PENALTY;
      const score = d + crowd + routing - (e === current ? 0.8 : 0);
      if (score < bestScore) {
        bestScore = score;
        best = e;
      }
    }
    return best;
  }

  /**
   * Swing timeline: at the end of the wind-up the blow lands if the enemy is still in reach (queued), or the
   * arrow is loosed if it is still in range.
   */
  private advanceSwing(world: World, id: number, dt: number): void {
    const { c } = world;
    const swing = c.swing[id];
    if (swing < 0) return;
    const next = swing + dt;
    const windup = c.swingDuration[id] * IMPACT_FRACTION;
    const kind = c.swingKind[id];
    if (swing < windup && next >= windup && kind === SwingKind.Arc) {
      this.arcStrike(world, id, c.attack[id] * c.damageMul[id] * c.swingPower[id]);
    } else if (swing < windup && next >= windup && kind !== SwingKind.Cast) {
      const t = c.target[id];
      if (t >= 0 && this.isEnemy(world, id, t)) {
        const dist = Math.hypot(c.x[t] - c.x[id], c.z[t] - c.z[id]);
        const shaken = c.moraleState[id] === MoraleState.Shaken ? 0.9 : 1;
        if (kind === SwingKind.Shot) {
          if (dist <= c.range[id] * 1.15) launchProjectile(world, id, t, c.rangedAttack[id] * c.damageMul[id] * shaken);
        } else if (dist - c.radius[id] - c.radius[t] <= c.reach[id] + 0.6) {
          const damage = c.attack[id] * c.damageMul[id] * shaken;
          this.strike(world, id, t, damage);
          if (c.cleave[id] > 0) this.cleave(world, id, t, damage * CLEAVE_DAMAGE);
        }
      }
    }
    c.swing[id] = next >= c.swingDuration[id] ? -1 : next;
  }

  private strike(world: World, id: number, target: number, damage: number): void {
    const { c } = world;
    this.impacts.push({
      attacker: id,
      target,
      damage,
      damageType: DAMAGE_TYPES[c.damageType[id]],
      timestamp: world.time.elapsed,
      x: c.x[id],
      z: c.z[id],
      ability: null,
      missile: false,
      criticalChance: c.critChance[id],
    });
  }

  /** Free blow of a hero: every enemy within reach in a ±65° arc in front, the nearest first. */
  private arcStrike(world: World, id: number, damage: number): void {
    const { c, spatial } = world;
    const n = spatial.query(c.x[id], c.z[id], c.radius[id] + c.reach[id] + 1.6, c.x, c.z, this.neighbours);
    const fx = Math.sin(c.rot[id]);
    const fz = Math.cos(c.rot[id]);
    const max = 3 + c.cleave[id];
    let hits = 0;
    for (let k = 0; k < n && hits < max; k++) {
      const e = this.neighbours[k];
      if (!this.isEnemy(world, id, e)) continue;
      const dx = c.x[e] - c.x[id];
      const dz = c.z[e] - c.z[id];
      const dist = Math.hypot(dx, dz);
      if (dist - c.radius[id] - c.radius[e] > c.reach[id] + 0.5 || (dx * fx + dz * fz) / (dist || 1) < 0.42) continue;
      this.strike(world, id, e, damage);
      hits++;
    }
  }

  /** A sweeping blow also hits up to `cleave` other enemies within reach in front of the attacker. */
  private cleave(world: World, id: number, target: number, damage: number): void {
    const { c, spatial } = world;
    const n = spatial.query(c.x[id], c.z[id], c.radius[id] + c.reach[id] + 1.5, c.x, c.z, this.neighbours);
    const fx = Math.sin(c.rot[id]);
    const fz = Math.cos(c.rot[id]);
    let hits = 0;
    for (let k = 0; k < n && hits < c.cleave[id]; k++) {
      const e = this.neighbours[k];
      if (e === target || !this.isEnemy(world, id, e)) continue;
      const dx = c.x[e] - c.x[id];
      const dz = c.z[e] - c.z[id];
      const dist = Math.hypot(dx, dz);
      if (dist - c.radius[id] - c.radius[e] > c.reach[id] + 0.3 || (dx * fx + dz * fz) / (dist || 1) < 0.2) continue;
      this.strike(world, id, e, damage);
      hits++;
    }
  }
}

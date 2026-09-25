import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, MoraleState, NO_ENTITY, Order, UnitState } from '../entities/Components';
import { DAMAGE_TYPES } from '../units/UnitStats';
import { Flank, flankOf, type Attack, type DamageSystem } from './DamageSystem';

export const ChargeState = {
  Ready: 0,
  /** Riders gather and lower their lances. */
  Prepare: 1,
  /** From a trot to a gallop. */
  Accelerate: 2,
  /** Full gallop straight at the target. */
  Charge: 3,
  /** The instant of the shock (resolved in one tick). */
  Impact: 4,
  /** Momentum spent, the riders fight or pull out. */
  Disengage: 5,
  /** Horses blown: no charge until the cooldown is over. */
  Recover: 6,
} as const;
export type ChargeStateId = (typeof ChargeState)[keyof typeof ChargeState];
export const CHARGE_STATE_NAMES = ['READY', 'PREPARE', 'ACCELERATE', 'CHARGE', 'IMPACT', 'DISENGAGE', 'RECOVER'] as const;

const PREPARE_SECONDS = 0.5;
const ACCELERATE_SECONDS = 1.3;
const CHARGE_MAX_SECONDS = 6;
const DISENGAGE_SECONDS = 1.5;
/** A charge needs room: the target must be between these distances (m) when it starts. */
export const CHARGE_MIN_DISTANCE = 9;
export const CHARGE_MAX_DISTANCE = 40;
/** The shock also tramples enemies this far (m) in front of the horse. */
const TRAMPLE_REACH = 1.4;
const TRAMPLE_DAMAGE = 0.6;
/** Braced spears absorb most of the shock. */
const BRACED_DAMAGE = 0.35;
const FEAR_RADIUS = 6;
const KNOCKDOWN_SECONDS = 0.6;

/**
 * Cavalry charges. A rider engaging an enemy far enough away gathers (PREPARE), gallops (ACCELERATE,
 * CHARGE: the speed boost is read by the movement system) and hits (IMPACT): heavy damage scaled by its
 * speed, trampling of the enemies in front, knockback and a morale shock that spreads around, worse in
 * the flank or the back. Spearmen standing and facing the charge brace: they take a fraction of the
 * shock, strike back hard and stop the horse dead. Then the riders DISENGAGE and RECOVER (cooldown).
 */
export class ChargeSystem implements System {
  readonly name = 'charge';
  private readonly neighbours = new Int32Array(64);
  private readonly shocks: Attack[] = [];

  constructor(private readonly damage: DamageSystem) {}

  update(world: World, dt: number): void {
    const { entities, c } = world;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if (!(entities.mask[id] & Comp.Unit) || c.chargePower[id] <= 0) continue;
      c.chargeCooldown[id] = Math.max(0, c.chargeCooldown[id] - dt);
      c.chargeTime[id] += dt;
      const state = c.chargeState[id];
      const morale = c.moraleState[id];
      const broken = morale === MoraleState.Routing || morale === MoraleState.Recovering || morale === MoraleState.Panicked;
      if (c.state[id] === UnitState.Dying || broken || c.stun[id] > 0 || c.order[id] === Order.Direct) {
        if (state !== ChargeState.Ready && state !== ChargeState.Recover) this.recover(world, id, 0.5);
        c.speedBoost[id] = 1;
        continue;
      }
      const t = c.target[id];
      const valid = t >= 0 && entities.has(t, Comp.Unit) && c.state[t] !== UnitState.Dying && c.team[t] !== c.team[id];
      const dist = valid ? Math.hypot(c.x[t] - c.x[id], c.z[t] - c.z[id]) : Infinity;
      const gallop = UNIT_DEFS[c.unitType[id]].charge?.speed ?? 1;

      switch (state) {
        case ChargeState.Ready:
          c.speedBoost[id] = 1;
          if (
            valid &&
            c.chargeCooldown[id] <= 0 &&
            c.state[id] === UnitState.Engaging &&
            c.order[id] !== Order.Hold &&
            dist >= CHARGE_MIN_DISTANCE &&
            dist <= CHARGE_MAX_DISTANCE
          ) {
            this.enter(world, id, ChargeState.Prepare);
          }
          break;
        case ChargeState.Prepare:
          c.speedBoost[id] = 0.8;
          if (!valid) this.recover(world, id, 0.3);
          else if (c.chargeTime[id] >= PREPARE_SECONDS) this.enter(world, id, ChargeState.Accelerate);
          break;
        case ChargeState.Accelerate:
        case ChargeState.Charge: {
          if (state === ChargeState.Accelerate) {
            c.speedBoost[id] = 1 + (gallop - 1) * Math.min(1, c.chargeTime[id] / ACCELERATE_SECONDS);
            if (c.chargeTime[id] >= ACCELERATE_SECONDS) this.enter(world, id, ChargeState.Charge);
          } else {
            c.speedBoost[id] = gallop;
          }
          if (!valid || c.chargeTime[id] > CHARGE_MAX_SECONDS) {
            this.recover(world, id, 0.5);
            break;
          }
          // Ride into the target, do not rein in before it.
          c.engageDist[id] = 0;
          if (dist - c.radius[id] - c.radius[t] <= c.reach[id] + 0.4) this.impact(world, id, t, gallop);
          break;
        }
        case ChargeState.Impact:
          c.speedBoost[id] = 1;
          this.enter(world, id, ChargeState.Disengage);
          break;
        case ChargeState.Disengage:
          c.speedBoost[id] = 1;
          if (c.chargeTime[id] >= DISENGAGE_SECONDS) this.recover(world, id, 1);
          break;
        case ChargeState.Recover:
          c.speedBoost[id] = 1;
          if (c.chargeCooldown[id] <= 0) this.enter(world, id, ChargeState.Ready);
          break;
      }
    }
    for (const shock of this.shocks) if (c.state[shock.target] !== UnitState.Dying) this.damage.apply(world, shock);
    this.shocks.length = 0;
  }

  private enter(world: World, id: number, state: ChargeStateId): void {
    world.c.chargeState[id] = state;
    world.c.chargeTime[id] = 0;
    if (state === ChargeState.Accelerate) world.events.emit('chargeStarted', { id });
  }

  /** Back to RECOVER with `share` of the full cooldown (an aborted charge tires the horses less). */
  private recover(world: World, id: number, share: number): void {
    const cooldown = UNIT_DEFS[world.c.unitType[id]].charge?.cooldown ?? 0;
    world.c.chargeCooldown[id] = cooldown * share;
    world.c.speedBoost[id] = 1;
    this.enter(world, id, ChargeState.Recover);
  }

  private impact(world: World, id: number, target: number, gallop: number): void {
    const { c, spatial } = world;
    const speed = Math.hypot(c.vx[id], c.vz[id]);
    const momentum = Math.min(1, Math.max(0.3, speed / (c.maxSpeed[id] * gallop)));
    const power = c.chargePower[id] * momentum;
    const fx = Math.sin(c.rot[id]);
    const fz = Math.cos(c.rot[id]);
    let bracer = NO_ENTITY;
    let counter = 0;

    const n = spatial.query(c.x[id], c.z[id], c.radius[id] + c.reach[id] + TRAMPLE_REACH + 1, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const e = this.neighbours[k];
      if (!(world.entities.mask[e] & Comp.Unit) || c.team[e] === c.team[id] || c.state[e] === UnitState.Dying) continue;
      const dx = c.x[e] - c.x[id];
      const dz = c.z[e] - c.z[id];
      const dist = Math.hypot(dx, dz) || 1;
      const ahead = (dx * fx + dz * fz) / dist;
      const isTarget = e === target;
      if (!isTarget && (ahead < 0.35 || dist - c.radius[id] - c.radius[e] > c.reach[id] + TRAMPLE_REACH)) continue;

      const flank = flankOf(c.rot[e], c.x[e], c.z[e], c.x[id], c.z[id]);
      const eMorale = c.moraleState[e];
      const bracing =
        c.brace[e] > 0 &&
        flank === Flank.Front &&
        eMorale !== MoraleState.Routing &&
        eMorale !== MoraleState.Panicked &&
        Math.hypot(c.vx[e], c.vz[e]) < 1.5;
      if (bracing) {
        if (bracer === NO_ENTITY) bracer = e;
        counter += c.attack[e] * c.brace[e];
      }
      this.shocks.push({
        attacker: id,
        target: e,
        damage: power * (isTarget ? 1 : TRAMPLE_DAMAGE) * (bracing ? BRACED_DAMAGE : 1),
        damageType: DAMAGE_TYPES[c.damageType[id]],
        timestamp: world.time.elapsed,
        x: c.x[id],
        z: c.z[id],
        ability: 'charge',
        missile: false,
        criticalChance: c.critChance[id],
      });
      // Thrown back along the charge; braced spears hold their ground.
      const push = bracing ? 0.4 : Math.min(4, (3 * c.mass[id]) / c.mass[e]) * momentum;
      c.vx[e] += fx * push;
      c.vz[e] += fz * push;
      if (!bracing) {
        this.shake(world, e, 16 * momentum * (flank === Flank.Front ? 1 : flank === Flank.Side ? 1.5 : 2));
        // Knocked down by the horse (light soldiers only: an ogre does not fall).
        if (c.mass[e] < c.mass[id] * 0.5) c.stun[e] = Math.max(c.stun[e], KNOCKDOWN_SECONDS * momentum);
      }
    }

    const braced = bracer !== NO_ENTITY;
    // Terror spreads around the point of impact.
    if (!braced) {
      const m = spatial.query(c.x[id], c.z[id], FEAR_RADIUS, c.x, c.z, this.neighbours);
      for (let k = 0; k < m; k++) {
        const e = this.neighbours[k];
        if ((world.entities.mask[e] & Comp.Unit) && c.team[e] !== c.team[id] && c.state[e] !== UnitState.Dying) this.shake(world, e, 5 * momentum);
      }
    }
    if (braced) {
      // Impaled on the spears: the horse stops dead and the rider takes the blow.
      c.vx[id] = 0;
      c.vz[id] = 0;
      this.shocks.push({
        attacker: bracer,
        target: id,
        damage: counter,
        damageType: 'PIERCING',
        timestamp: world.time.elapsed,
        x: c.x[bracer],
        z: c.z[bracer],
        ability: 'brace',
        missile: false,
        criticalChance: 0,
      });
    }
    c.speedBoost[id] = 1;
    this.enter(world, id, ChargeState.Impact);
    world.events.emit('chargeImpact', { id, x: c.x[id], z: c.z[id], braced });
  }

  private shake(world: World, id: number, amount: number): void {
    const { c } = world;
    c.morale[id] = Math.max(0, c.morale[id] - amount * (1 - c.discipline[id] * 0.6));
  }
}

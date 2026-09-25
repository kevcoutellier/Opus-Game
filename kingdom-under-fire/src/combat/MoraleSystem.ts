import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, MoraleState, UnitState } from '../entities/Components';
import type { FormationManager } from '../formations/FormationManager';

/** Each unit re-evaluates its surroundings every STAGGER ticks (≈ 0.27 s at 30 Hz). */
const STAGGER = 8;
const SENSE_RADIUS = 9;
const DEATH_RADIUS = 10;
const FLEE_DISTANCE = 26;
const RECOVERY_SECONDS = 4;

/** Thresholds with hysteresis: a unit does not flicker between two states. */
export const MORALE = {
  shakenBelow: 55,
  normalAbove: 62,
  panickedBelow: 30,
  shakenAbove: 38,
  routBelow: 14,
  rallyAbove: 40,
} as const;

/**
 * Morale of every soldier (0-100) and its state machine NORMAL → SHAKEN → PANICKED → ROUTING →
 * RECOVERING. Factors: local odds (enemies vs allies around), wounds (DamageSystem), deaths of nearby
 * comrades, kills, the losses of the formation and panic spreading from routing neighbours; discipline
 * absorbs part of every loss. Routing soldiers flee away from the enemy; once safe they rally and return
 * to their formation.
 */
export class MoraleSystem implements System {
  readonly name = 'morale';
  private readonly neighbours = new Int32Array(128);
  private fleeX = new Float32Array(0);
  private fleeZ = new Float32Array(0);
  private safeTime = new Float32Array(0);
  private readonly deaths: { x: number; z: number; team: number; killer: number }[] = [];

  constructor(
    world: World,
    private readonly formations: FormationManager,
  ) {
    world.events.on('unitDied', (e) => this.deaths.push({ x: e.x, z: e.z, team: e.team, killer: e.killer }));
  }

  update(world: World, dt: number): void {
    const { entities, c, spatial, time } = world;
    if (this.fleeX.length !== entities.capacity) {
      this.fleeX = new Float32Array(entities.capacity);
      this.fleeZ = new Float32Array(entities.capacity);
      this.safeTime = new Float32Array(entities.capacity);
    }

    // Shock of the deaths of this tick on nearby comrades; a kill heartens the killer.
    for (const death of this.deaths) {
      const n = spatial.query(death.x, death.z, DEATH_RADIUS, c.x, c.z, this.neighbours);
      for (let k = 0; k < n; k++) {
        const id = this.neighbours[k];
        if (c.team[id] !== death.team || c.state[id] === UnitState.Dying) continue;
        this.change(world, id, -6);
      }
      if (death.killer >= 0 && entities.isAlive(death.killer)) this.change(world, death.killer, 3);
    }
    this.deaths.length = 0;

    const interval = dt * STAGGER;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & (Comp.Morale | Comp.Unit)) !== (Comp.Morale | Comp.Unit)) continue;
      if (c.state[id] === UnitState.Dying) continue;
      if ((time.tick + id) % STAGGER === 0) this.evaluate(world, id, interval);
      this.transition(world, id, dt);
      if (c.moraleState[id] === MoraleState.Routing) {
        // The flight point overrides the formation slot (this system runs after the formations).
        c.slotX[id] = this.fleeX[id];
        c.slotZ[id] = this.fleeZ[id];
      }
    }
  }

  /** Adds `delta` morale, scaled down by discipline when it is a loss. */
  private change(world: World, id: number, delta: number): void {
    const { c } = world;
    const scaled = delta < 0 ? delta * (1 - c.discipline[id] * 0.6) : delta;
    c.morale[id] = Math.min(100, Math.max(0, c.morale[id] + scaled));
  }

  private evaluate(world: World, id: number, interval: number): void {
    const { c, spatial } = world;
    const x = c.x[id];
    const z = c.z[id];
    const n = spatial.query(x, z, SENSE_RADIUS, c.x, c.z, this.neighbours);
    let allies = 0;
    let enemies = 0;
    let routingAllies = 0;
    let awayX = 0;
    let awayZ = 0;
    for (let k = 0; k < n; k++) {
      const j = this.neighbours[k];
      if (c.state[j] === UnitState.Dying) continue;
      const routing = c.moraleState[j] === MoraleState.Routing;
      if (c.team[j] === c.team[id]) {
        if (routing) routingAllies++;
        else allies++;
      } else if (!routing) {
        enemies++;
        const d = Math.hypot(x - c.x[j], z - c.z[j]) || 1;
        awayX += (x - c.x[j]) / d;
        awayZ += (z - c.z[j]) / d;
      }
    }

    let delta = 0;
    if (enemies === 0) {
      delta += c.moraleState[id] === MoraleState.Routing ? 7 : 3;
    } else {
      const odds = enemies / Math.max(1, allies);
      delta += odds > 1.3 ? -(odds - 1.3) * 6 : 0.4;
    }
    const formation = this.formations.get(c.formation[id]);
    if (formation && formation.losses > 0.35) delta -= (formation.losses - 0.35) * 12;
    delta -= routingAllies * 1.2;
    this.change(world, id, delta * interval);

    // Flight direction: away from the enemies around, else keep running the same way.
    this.safeTime[id] = enemies === 0 ? this.safeTime[id] + interval : 0;
    if (c.moraleState[id] === MoraleState.Routing && enemies > 0) {
      const len = Math.hypot(awayX, awayZ) || 1;
      const margin = 4;
      this.fleeX[id] = Math.min(world.size - margin, Math.max(margin, x + (awayX / len) * FLEE_DISTANCE));
      this.fleeZ[id] = Math.min(world.size - margin, Math.max(margin, z + (awayZ / len) * FLEE_DISTANCE));
    }
  }

  private transition(world: World, id: number, dt: number): void {
    const { c } = world;
    const m = c.morale[id];
    const state = c.moraleState[id];
    let next: number = state;
    switch (state) {
      case MoraleState.Normal:
        if (m < MORALE.shakenBelow) next = MoraleState.Shaken;
        break;
      case MoraleState.Shaken:
        if (m >= MORALE.normalAbove) next = MoraleState.Normal;
        else if (m < MORALE.panickedBelow) next = MoraleState.Panicked;
        break;
      case MoraleState.Panicked:
        if (m >= MORALE.shakenAbove) next = MoraleState.Shaken;
        else if (m < MORALE.routBelow) next = MoraleState.Routing;
        break;
      case MoraleState.Routing:
        if (m >= MORALE.rallyAbove && this.safeTime[id] > 1) next = MoraleState.Recovering;
        break;
      case MoraleState.Recovering:
        this.safeTime[id] += dt;
        if (m < MORALE.routBelow) next = MoraleState.Routing;
        else if (this.safeTime[id] > RECOVERY_SECONDS) next = m >= MORALE.normalAbove ? MoraleState.Normal : MoraleState.Shaken;
        break;
    }
    if (next === state) return;
    c.moraleState[id] = next;
    if (next === MoraleState.Routing) {
      c.state[id] = UnitState.Routing;
      // Until the next evaluation, run straight away from where the unit faces.
      this.fleeX[id] = c.x[id] - Math.sin(c.rot[id]) * FLEE_DISTANCE;
      this.fleeZ[id] = c.z[id] - Math.cos(c.rot[id]) * FLEE_DISTANCE;
      world.events.emit('unitRouted', { id });
    } else if (state === MoraleState.Routing) {
      c.state[id] = UnitState.Idle;
      this.safeTime[id] = 0;
      world.events.emit('unitRallied', { id });
    }
  }
}

import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import type { FormationType } from '../formations/FormationType';
import type { HeroSystem } from '../heroes/HeroSystem';
import { UnitManager } from '../units/UnitManager';
import { AIKnowledge } from './AIKnowledge';
import { chooseCast } from './HeroAI';
import type { StrategicAI } from './StrategicAI';
import { planTactics, type TacticalOptions, type TacticalPlan } from './TacticalAI';

export interface AIOptions extends TacticalOptions {
  team: number;
  formation?: FormationType;
  /** Seconds between two decisions. */
  thinkInterval?: number;
}

/** Re-issue an order only when its goal moved this far (avoids re-planning noise). */
const REORDER_DISTANCE = 6;
/** With a base: enemies known this close (m) to it are driven off; the army gathers this far ahead of it. */
const DEFEND_RADIUS = 60;
const RALLY_DISTANCE = 26;
/** On the attack, enemies known within this distance (m) of the army come before buildings. */
const CONTACT_DISTANCE = 30;

/**
 * Commander of an AI army (prototype: one army, one formation). Every `thinkInterval` it refreshes its
 * knowledge, casts its heroes' abilities, plans, and issues the same commands a player would. Strategic
 * (economy) and operational layers will sit above it; unit-level behaviour stays in the CombatSystem.
 */
export class AIController implements System {
  readonly name = 'ai';
  readonly knowledge: AIKnowledge;
  private readonly units: UnitManager;
  private next = 0;
  private lastPlan: TacticalPlan | null = null;
  /** Disabled by the performance test, which drives both armies itself. */
  enabled = true;
  /** Heroes of the battle (set once the simulation exists): the AI casts its heroes' abilities. */
  heroes: HeroSystem | null = null;
  /** Economy and war plan when the AI has a base (set once the simulation exists). */
  strategy: StrategicAI | null = null;
  private readonly plans = new Map<string, { plan: TacticalPlan; size: number }>();

  constructor(
    world: World,
    private readonly options: AIOptions,
  ) {
    this.knowledge = new AIKnowledge(world, options.team);
    this.units = new UnitManager(world);
  }

  get plan(): TacticalPlan | null {
    return this.lastPlan;
  }

  update(world: World): void {
    if (!this.enabled || world.time.elapsed < this.next) return;
    this.next = world.time.elapsed + (this.options.thinkInterval ?? 1);
    this.knowledge.update();
    if (this.heroes) {
      for (const h of this.heroes.list(this.options.team)) {
        if (h.direct || h.casting) continue;
        const cast = chooseCast(world, this.heroes, h);
        if (cast) world.commands.push({ kind: 'cast', team: this.options.team, hero: h.id, slot: cast.slot, x: cast.x, z: cast.z });
      }
    }

    const army: number[] = [];
    this.units.forEachActive((id) => army.push(id), this.options.team);
    if (!army.length) return;
    const strategy = this.strategy;
    if (strategy) {
      strategy.think(world);
      // Two groups: the waves on the march, the garrison at home.
      const wave = army.filter((id) => strategy.attackers.has(id));
      const garrison = army.filter((id) => !strategy.attackers.has(id));
      if (wave.length) this.command(world, 'wave', wave, this.planAttack(world, strategy, wave));
      if (garrison.length) this.command(world, 'garrison', garrison, this.planDefence(strategy));
      return;
    }
    const centre = this.units.centroid(army)!;
    this.command(world, 'army', army, planTactics(world, this.knowledge, centre.x, centre.z, this.options));
  }

  /** Orders a group, unless its plan barely changed and no reinforcement joined it. */
  private command(world: World, group: string, units: number[], plan: TacticalPlan): void {
    const previous = this.plans.get(group);
    const changed = !previous || previous.plan.kind !== plan.kind || Math.hypot(previous.plan.x - plan.x, previous.plan.z - plan.z) > REORDER_DISTANCE;
    // Losses do not re-order a group (its formation closes ranks by itself); reinforcements do.
    if (!changed && units.length - previous.size < 3) return;
    this.plans.set(group, { plan, size: units.length });
    this.lastPlan = plan;
    if (plan.kind === 'hold') {
      world.commands.push({ kind: 'setFormation', team: this.options.team, units, formation: this.options.formation ?? 'LINE' });
      return;
    }
    world.commands.push({
      kind: 'formationMove',
      team: this.options.team,
      units,
      x: plan.x,
      z: plan.z,
      facing: null,
      width: null,
      formation: this.options.formation ?? 'LINE',
      attackMove: true,
    });
  }

  /** The garrison drives off the enemies known near the base, else gathers in front of it. */
  private planDefence(strategy: StrategicAI): TacticalPlan {
    const { baseX, baseZ, enemyX, enemyZ } = strategy.options;
    let intruder: { x: number; z: number } | null = null;
    let nearest = DEFEND_RADIUS;
    for (const e of this.knowledge.enemies.values()) {
      const d = Math.hypot(e.x - baseX, e.z - baseZ);
      if (d < nearest) {
        nearest = d;
        intruder = e;
      }
    }
    if (intruder) return { kind: 'engage', x: intruder.x, z: intruder.z };
    const dir = Math.atan2(enemyX - baseX, enemyZ - baseZ);
    return { kind: 'advance', x: baseX + Math.sin(dir) * RALLY_DISTANCE, z: baseZ + Math.cos(dir) * RALLY_DISTANCE };
  }

  /**
   * A wave engages the enemies at hand, else the nearest enemy building it knows (not the recruits
   * trickling out of a barracks), else marches on the enemy base.
   */
  private planAttack(world: World, strategy: StrategicAI, wave: number[]): TacticalPlan {
    const { enemyX, enemyZ } = strategy.options;
    const centre = this.units.centroid(wave)!;
    const plan = planTactics(world, this.knowledge, centre.x, centre.z, { objectiveX: enemyX, objectiveZ: enemyZ, advanceDelay: 0 });
    if (plan.kind === 'engage' && Math.hypot(plan.x - centre.x, plan.z - centre.z) <= CONTACT_DISTANCE) return plan;
    let target: { x: number; z: number } | null = null;
    let nearest = Infinity;
    for (const s of this.knowledge.structures.values()) {
      const d = Math.hypot(s.x - centre.x, s.z - centre.z);
      if (d < nearest) {
        nearest = d;
        target = s;
      }
    }
    return target ? { kind: 'engage', x: target.x, z: target.z } : plan;
  }
}

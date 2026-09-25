import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import type { FormationType } from '../formations/FormationType';
import { UnitManager } from '../units/UnitManager';
import { AIKnowledge } from './AIKnowledge';
import { planTactics, type TacticalOptions, type TacticalPlan } from './TacticalAI';

export interface AIOptions extends TacticalOptions {
  team: number;
  formation?: FormationType;
  /** Seconds between two decisions. */
  thinkInterval?: number;
}

/** Re-issue an order only when its goal moved this far (avoids re-planning noise). */
const REORDER_DISTANCE = 6;

/**
 * Commander of an AI army (prototype: one army, one formation). Every `thinkInterval` it refreshes its
 * knowledge, plans, and issues the same commands a player would. Strategic (economy) and operational
 * layers will sit above it; unit-level behaviour stays in the CombatSystem.
 */
export class AIController implements System {
  readonly name = 'ai';
  readonly knowledge: AIKnowledge;
  private readonly units: UnitManager;
  private next = 0;
  private lastPlan: TacticalPlan | null = null;

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
    if (world.time.elapsed < this.next) return;
    this.next = world.time.elapsed + (this.options.thinkInterval ?? 1);
    this.knowledge.update();

    const army: number[] = [];
    this.units.forEachActive((id) => army.push(id), this.options.team);
    if (!army.length) return;
    const centre = this.units.centroid(army)!;
    const plan = planTactics(world, this.knowledge, centre.x, centre.z, this.options);
    const previous = this.lastPlan;
    const changed = !previous || previous.kind !== plan.kind || Math.hypot(previous.x - plan.x, previous.z - plan.z) > REORDER_DISTANCE;
    if (!changed) return;
    this.lastPlan = plan;
    if (plan.kind === 'hold') {
      world.commands.push({ kind: 'setFormation', team: this.options.team, units: army, formation: this.options.formation ?? 'LINE' });
      return;
    }
    world.commands.push({
      kind: 'formationMove',
      team: this.options.team,
      units: army,
      x: plan.x,
      z: plan.z,
      facing: null,
      width: null,
      formation: this.options.formation ?? 'LINE',
      attackMove: true,
    });
  }
}

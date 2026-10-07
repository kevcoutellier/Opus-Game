import { ChargeSystem } from '../combat/ChargeSystem';
import { CombatSystem } from '../combat/CombatSystem';
import { MoraleSystem } from '../combat/MoraleSystem';
import { ProjectileSystem } from '../combat/Projectiles';
import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { FormationManager } from '../formations/FormationManager';
import { HeroSystem } from '../heroes/HeroSystem';
import { SpatialSystem } from '../navigation/SpatialSystem';
import { LifecycleSystem } from '../units/LifecycleSystem';
import { MovementSystem } from '../units/MovementSystem';
import { Simulation, type System } from './Simulation';
import type { World } from './World';

export interface BattleSimulation {
  simulation: Simulation;
  formations: FormationManager;
  combat: CombatSystem;
  heroes: HeroSystem;
}

/**
 * The battle pipeline, in order: neighbour grid → formations (anchors, slots) → heroes (abilities,
 * statuses, direct control) → combat (targets, blows, shots) → missiles in flight → cavalry charges →
 * morale (states, flight points) → movement (steering) → lifecycle (corpses). `extra` systems (AI) run
 * first, so their commands are applied at the next tick like a player's.
 */
export function createBattleSimulation(world: World, extra: System[] = [], perf?: PerformanceMonitor): BattleSimulation {
  const formations = new FormationManager(world);
  const combat = new CombatSystem(formations);
  const heroes = new HeroSystem(world, combat.damage, combat, formations);
  const simulation = new Simulation(
    world,
    [
      ...extra,
      new SpatialSystem(),
      formations,
      heroes,
      combat,
      new ProjectileSystem(combat.damage),
      new ChargeSystem(combat.damage),
      new MoraleSystem(world, formations),
      new MovementSystem(),
      new LifecycleSystem(),
    ],
    perf,
  );
  return { simulation, formations, combat, heroes };
}

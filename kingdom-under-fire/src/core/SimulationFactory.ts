import { ChargeSystem } from '../combat/ChargeSystem';
import { CombatSystem } from '../combat/CombatSystem';
import { FireSystem } from '../combat/FireSystem';
import { MoraleSystem } from '../combat/MoraleSystem';
import { ProjectileSystem } from '../combat/Projectiles';
import { TrapSystem } from '../combat/TrapSystem';
import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { FormationManager } from '../formations/FormationManager';
import { HeroSystem } from '../heroes/HeroSystem';
import { TroopSystem } from '../troops/TroopSystem';
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
  troops: TroopSystem;
}

/**
 * The battle pipeline, in order: neighbour grid → troops (orders, waypoints, escort, skills, broken
 * troops) → formations (anchors, slots) → heroes (abilities, moves, statuses) → combat (targets, blows,
 * shots) → missiles in flight → forest fires → traps → cavalry charges → morale (states, flight points)
 * → movement (steering) → lifecycle (corpses). `extra` systems (AI) run first, so their commands are
 * applied at the next tick like a player's.
 */
export function createBattleSimulation(world: World, extra: System[] = [], perf?: PerformanceMonitor): BattleSimulation {
  const formations = new FormationManager(world);
  const combat = new CombatSystem(formations);
  const heroes = new HeroSystem(world, combat.damage, formations);
  const troops = new TroopSystem(world, formations);
  // A hero's troop spends and earns its hero's SP; troop skills use the heroes' effects.
  troops.heroes = heroes;
  const simulation = new Simulation(
    world,
    [
      ...extra,
      new SpatialSystem(),
      troops,
      formations,
      heroes,
      combat,
      new ProjectileSystem(combat.damage),
      new FireSystem(combat.damage),
      new TrapSystem(combat.damage),
      new ChargeSystem(combat.damage),
      new MoraleSystem(world, formations),
      new MovementSystem(),
      new LifecycleSystem(),
    ],
    perf,
  );
  return { simulation, formations, combat, heroes, troops };
}

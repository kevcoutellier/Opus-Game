import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import type { World } from './World';

export interface System {
  readonly name: string;
  update(world: World, dt: number): void;
}

/** Runs the systems in a fixed order, once per fixed step, and times each of them. */
export class Simulation {
  constructor(
    readonly world: World,
    readonly systems: System[],
    private readonly perf?: PerformanceMonitor,
  ) {}

  step(dt: number): void {
    const { world, perf } = this;
    const start = perf ? performance.now() : 0;
    world.beginTick();
    for (const system of this.systems) {
      if (perf) perf.measure(`sim.${system.name}`, () => system.update(world, dt));
      else system.update(world, dt);
    }
    world.entities.flush();
    world.time.advance();
    if (perf) {
      perf.commit('pathfinding');
      perf.record('sim', performance.now() - start);
    }
  }
}

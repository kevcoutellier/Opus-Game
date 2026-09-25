import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';

/** Rebuilds the neighbour grid at the start of every tick (corpses are not indexed). */
export class SpatialSystem implements System {
  readonly name = 'spatial';

  update(world: World): void {
    const { c } = world;
    world.spatial.rebuild(world.entities, Comp.Unit, c.x, c.z, (id) => c.state[id] !== UnitState.Dying);
  }
}

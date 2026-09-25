import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';
import { CORPSE_SECONDS } from './Unit';

/** Ages the unit states and frees the entities of corpses once they have sunk into the ground. */
export class LifecycleSystem implements System {
  readonly name = 'lifecycle';

  update(world: World, dt: number): void {
    const { entities, c } = world;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0) continue;
      c.stateTime[id] += dt;
      if (c.state[id] === UnitState.Dying && c.stateTime[id] >= CORPSE_SECONDS) entities.destroyLater(id);
    }
  }
}

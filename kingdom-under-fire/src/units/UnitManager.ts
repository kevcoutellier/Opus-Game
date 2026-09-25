import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';

/** Read-only queries over the unit entities (UI, AI, selection). */
export class UnitManager {
  constructor(private readonly world: World) {}

  /** Alive and not dying: can move, fight and be selected. */
  isActive(id: number): boolean {
    const w = this.world;
    return w.entities.has(id, Comp.Unit) && w.c.state[id] !== UnitState.Dying;
  }

  /** Calls `fn` for every active unit (optionally of one team). */
  forEachActive(fn: (id: number) => void, team = -1): void {
    const { entities, c } = this.world;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.state[id] === UnitState.Dying) continue;
      if (team >= 0 && c.team[id] !== team) continue;
      fn(id);
    }
  }

  countActive(team: number): number {
    let n = 0;
    this.forEachActive(() => n++, team);
    return n;
  }

  /** Centroid of a list of units, or null when none is active. */
  centroid(ids: readonly number[]): { x: number; z: number } | null {
    let x = 0;
    let z = 0;
    let n = 0;
    for (const id of ids) {
      if (!this.isActive(id)) continue;
      x += this.world.c.x[id];
      z += this.world.c.z[id];
      n++;
    }
    return n ? { x: x / n, z: z / n } : null;
  }
}

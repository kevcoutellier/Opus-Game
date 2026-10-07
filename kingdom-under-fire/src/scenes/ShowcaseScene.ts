import type { World } from '../core/World';
import { UNIT_DEFS, unitIndex } from '../data/units';
import { Comp, Order } from '../entities/Components';
import { spawnUnit } from '../units/UnitFactory';

/**
 * `#showcase`: one of every unit type of The Crusaders, Hironeiden in one row and Vellond in the other, seen
 * from the side, for checking models and animations. The units hold still; the AI is disabled by the caller.
 */
export function setupShowcase(world: World, x: number, z: number): number[] {
  const { entities } = world;
  const doomed: number[] = [];
  for (let i = 0; i < entities.count; i++) if (entities.mask[entities.dense[i]] & Comp.Unit) doomed.push(entities.dense[i]);
  for (const id of doomed) entities.destroy(id);
  const ids: number[] = [];
  const realms = (['hironeiden', 'vellond'] as const).map((realm) => UNIT_DEFS.filter((d) => d.realm === realm).map((d) => d.id));
  realms.forEach((units, row) => {
    units.forEach((unit, col) => {
      // Seen from the side: every unit faces +x, rows far enough apart not to fight, holding still.
      const px = x + (col - (units.length - 1) / 2) * 4;
      const pz = z - row * 14;
      const id = spawnUnit(world, unitIndex(unit), row, px, pz, Math.PI / 2);
      world.c.order[id] = Order.Hold;
      ids.push(id);
    });
  });
  return ids;
}

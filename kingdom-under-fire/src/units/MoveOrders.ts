import type { World } from '../core/World';
import { Comp, NO_ENTITY, Order, UnitState } from '../entities/Components';

/**
 * Movement orders (phase 6): the group keeps its relative layout and shares one flow field to the
 * destination. Formations (phase 7) replace the layout with real slots.
 */
export function registerMoveOrders(world: World): void {
  // Until the combat phase, attacking a unit means marching onto it.
  world.commands.on('attack', (cmd) => {
    if (!world.entities.isAlive(cmd.target)) return;
    const { x, z } = { x: world.c.x[cmd.target], z: world.c.z[cmd.target] };
    world.commands.push({ kind: 'formationMove', team: cmd.team, units: cmd.units, x, z, facing: null, width: null, formation: null, attackMove: true });
  });
  world.commands.on('hold', (cmd) => {
    for (const id of cmd.units) {
      if (!world.entities.has(id, Comp.Unit) || world.c.team[id] !== cmd.team) continue;
      world.c.slotX[id] = world.c.x[id];
      world.c.slotZ[id] = world.c.z[id];
      world.c.order[id] = Order.Hold;
    }
  });
  world.commands.on('setFormation', () => {});
  world.commands.on('formationMove', (cmd) => {
    const { c } = world;
    const ids = cmd.units.filter(
      (id) => world.entities.has(id, Comp.Unit) && c.team[id] === cmd.team && c.state[id] !== UnitState.Dying,
    );
    if (!ids.length) return;
    let cx = 0;
    let cz = 0;
    for (const id of ids) {
      cx += c.x[id];
      cz += c.z[id];
    }
    cx /= ids.length;
    cz /= ids.length;
    const flow = world.nav.cellAt(cmd.x, cmd.z);
    world.paths.fieldForCell(flow);
    const facing = cmd.facing ?? Math.atan2(cmd.x - cx, cmd.z - cz);
    const margin = 2;
    for (const id of ids) {
      c.slotX[id] = Math.min(world.size - margin, Math.max(margin, cmd.x + c.x[id] - cx));
      c.slotZ[id] = Math.min(world.size - margin, Math.max(margin, cmd.z + c.z[id] - cz));
      c.slotRot[id] = facing;
      c.flow[id] = flow;
      c.target[id] = NO_ENTITY;
      c.order[id] = cmd.attackMove ? Order.AttackMove : Order.Move;
    }
  });
}

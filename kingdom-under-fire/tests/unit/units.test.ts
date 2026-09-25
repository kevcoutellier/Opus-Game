import { describe, expect, it } from 'vitest';
import { World } from '../../src/core/World';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { Comp, NO_ENTITY, UnitState } from '../../src/entities/Components';
import { setupPrototypeBattle } from '../../src/scenes/BattleScene';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';
import { UnitManager } from '../../src/units/UnitManager';

describe('UnitFactory', () => {
  it('initialises every component from the unit definition', () => {
    const world = new World({ seed: 3 });
    const type = unitIndex('human_spearman');
    const id = spawnUnit(world, type, 1, 10, 20, 0.5);
    const def = UNIT_DEFS[type];
    const c = world.c;
    expect(world.entities.has(id, Comp.Unit | Comp.Health | Comp.Morale | Comp.FormationSlot)).toBe(true);
    expect([c.x[id], c.z[id], c.rot[id]]).toEqual([10, 20, 0.5]);
    expect(c.hp[id]).toBe(def.health);
    expect(c.reach[id]).toBeCloseTo(def.reach);
    expect(c.team[id]).toBe(1);
    expect(c.target[id]).toBe(NO_ENTITY);
    expect(c.state[id]).toBe(UnitState.Idle);
    expect(c.attackTimer[id]).toBeLessThan(def.attackPeriod);
  });

  it('deploys a block with the front row ahead along the facing direction', () => {
    const world = new World({ seed: 3 });
    const ids = spawnBlock(world, 0, 0, 6, 3, 50, 50, Math.PI, 2);
    // Facing -z: the first row (ids 0-2) is at a smaller z than the second.
    expect(world.c.z[ids[0]]).toBeLessThan(world.c.z[ids[3]]);
    expect(world.c.z[ids[0]]).toBeCloseTo(49, 4);
    const xs = ids.slice(0, 3).map((id) => world.c.x[id]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(4, 4);
  });

  it('sets up the 20 vs 20 prototype battle', () => {
    const world = new World({ seed: 3 });
    const { player, enemy } = setupPrototypeBattle(world, 256);
    const units = new UnitManager(world);
    expect(player.units).toHaveLength(20);
    expect(units.countActive(0)).toBe(20);
    expect(units.countActive(1)).toBe(20);
    expect(units.centroid(player.units)!.z).toBeGreaterThan(units.centroid(enemy.units)!.z);
  });
});

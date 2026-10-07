import { describe, expect, it } from 'vitest';
import { MAX_QUEUE } from '../../src/buildings/BuildingSystem';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { BUILDING_DEFS, buildingIndex, buildingsOf } from '../../src/data/buildings';
import { FACTIONS } from '../../src/data/factions';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { ResourceManager } from '../../src/economy/Resources';
import { UnitState } from '../../src/entities/Components';
import { spawnBlock } from '../../src/units/UnitFactory';

function base(seed = 3) {
  const world = new World({ seed });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  const keep = sim.buildings.place(buildingIndex('human_keep'), 0, 30, 64, 0, true);
  world.resources.set(0, { gold: 1000, wood: 1000, food: 1000, stone: 1000, mana: 100 });
  return { world, run, buildings: sim.buildings, keep };
}

describe('resources', () => {
  it('only spends what a team can afford, and refunds exactly', () => {
    const r = new ResourceManager(2);
    r.set(0, { gold: 100, food: 30 });
    expect(r.canAfford(0, { gold: 50, food: 20 })).toBe(true);
    expect(r.spend(0, { gold: 50, food: 20 })).toBe(true);
    expect(r.spend(0, { gold: 60 })).toBe(false);
    expect(r.get(0, 'gold')).toBe(50);
    expect(r.spend(0, { gold: 10, wood: 1 })).toBe(false);
    expect(r.get(0, 'gold')).toBe(50);
    r.refund(0, { gold: 50, food: 20 });
    expect(r.stock(0)).toMatchObject({ gold: 100, food: 30, wood: 0 });
    expect(r.get(1, 'gold')).toBe(0);
  });
});

describe('building data', () => {
  it('gives each faction a headquarters and a building for every soldier it fields', () => {
    for (const faction of FACTIONS) {
      const own = buildingsOf(faction.id);
      expect(own.filter((b) => b.hq)).toHaveLength(1);
      const trained = new Set(own.flatMap((b) => b.trains));
      for (const unit of faction.units) {
        const def = UNIT_DEFS[unitIndex(unit)];
        if (def.role !== 'hero') expect(trained.has(unit)).toBe(true);
      }
      for (const b of own) for (const u of b.trains) expect(faction.units).toContain(u);
    }
    expect(BUILDING_DEFS.every((b) => b.hq || Object.keys(b.cost).length > 0)).toBe(true);
  });
});

describe('construction', () => {
  it('lays foundations only in its territory, on free ground, with the requirements and the money', () => {
    const { world, run, buildings } = base();
    const errors = (id: string, x: number, z: number) => buildings.placementError(0, buildingIndex(id), x, z, 0);
    expect(errors('human_barracks', 110, 64)).toBe('Hors de votre territoire');
    expect(errors('human_barracks', 32, 66)).toBe('Terrain impraticable');
    expect(errors('human_stable', 50, 64)).toMatch(/Nécessite/);
    expect(errors('human_keep', 50, 64)).not.toBeNull();
    expect(errors('human_barracks', 50, 64)).toBeNull();
    spawnBlock(world, unitIndex('human_footman'), 0, 4, 2, 50, 64, 0);
    run(0.1);
    expect(errors('human_barracks', 50, 64)).toMatch(/soldats/);

    world.resources.set(0, { gold: 100, wood: 0 });
    world.commands.push({ kind: 'build', team: 0, building: 'human_farm', x: 30, z: 84, rot: 0 });
    run(0.1);
    expect(buildings.list(0)).toHaveLength(1);
    world.resources.set(0, { gold: 1000, wood: 1000 });
    world.commands.push({ kind: 'build', team: 0, building: 'human_farm', x: 30, z: 84, rot: 0 });
    run(0.1);
    expect(buildings.list(0)).toHaveLength(2);
    // (plus the income of the keep during the tick)
    expect(world.resources.get(0, 'gold')).toBeCloseTo(1000 - 60, 0);
  });

  it('rises over its build time, blocks the ground under it and yields its income once complete', () => {
    const { world, run, buildings } = base();
    world.resources.set(0, { gold: 1000, wood: 1000, food: 0 });
    world.commands.push({ kind: 'build', team: 0, building: 'human_farm', x: 30, z: 84, rot: Math.PI / 2 });
    run(0.1);
    const farm = buildings.list(0).find((b) => b.def.id === 'human_farm')!;
    expect(farm.complete).toBe(false);
    expect(world.nav.isBlockedAt(30, 84)).toBe(true);
    const hp0 = world.c.hp[farm.id];
    run(farm.def.buildTime / 2);
    expect(farm.progress).toBeCloseTo(0.5, 1);
    expect(world.c.hp[farm.id]).toBeGreaterThan(hp0);
    expect(world.resources.get(0, 'food')).toBe(0);
    run(farm.def.buildTime / 2 + 0.2);
    expect(farm.complete).toBe(true);
    expect(world.c.hp[farm.id]).toBeCloseTo(world.c.maxHp[farm.id], 0);
    run(10);
    expect(world.resources.get(0, 'food')).toBeCloseTo(12, 0);
    expect(world.resources.rate(0).food).toBeCloseTo(1.2);
  });
});

describe('production', () => {
  it('trains queued soldiers one after the other, who march to the rally point; cancelling refunds', () => {
    const { world, run, buildings } = base();
    const barracks = buildings.place(buildingIndex('human_barracks'), 0, 50, 64, Math.PI / 2, true);
    world.commands.push({ kind: 'rally', team: 0, building: barracks, x: 70, z: 70 });
    const gold = world.resources.get(0, 'gold');
    const price = UNIT_DEFS[unitIndex('human_footman')].cost.gold!;
    for (let k = 0; k < MAX_QUEUE + 2; k++) world.commands.push({ kind: 'train', team: 0, building: barracks, unit: 'human_footman' });
    // A unit this building does not train is refused.
    world.commands.push({ kind: 'train', team: 0, building: barracks, unit: 'human_knight' });
    run(0.1);
    const b = buildings.get(barracks)!;
    expect(b.queue).toHaveLength(MAX_QUEUE);
    expect(world.resources.get(0, 'gold')).toBeCloseTo(gold - MAX_QUEUE * price, 0);
    world.commands.push({ kind: 'cancelTrain', team: 0, building: barracks, index: 4 });
    run(0.1);
    expect(b.queue).toHaveLength(MAX_QUEUE - 1);
    expect(world.resources.get(0, 'gold')).toBeCloseTo(gold - (MAX_QUEUE - 1) * price, -1);

    const trained: number[] = [];
    world.events.on('unitTrained', ({ id }) => trained.push(id));
    run(UNIT_DEFS[unitIndex('human_footman')].trainTime * 2 + 0.5);
    expect(trained).toHaveLength(2);
    const first = trained.slice();
    run(10);
    for (const id of first) expect(Math.hypot(world.c.x[id] - 70, world.c.z[id] - 70)).toBeLessThan(4);
  });
});

describe('destruction', () => {
  it('orcs batter an enemy barracks down; its ground is free again', () => {
    const { world, run, buildings } = base(5);
    const barracks = buildings.place(buildingIndex('human_barracks'), 0, 60, 64, 0, true);
    world.c.hp[barracks] = 300;
    const orcs = spawnBlock(world, unitIndex('orc_warrior'), 1, 8, 4, 60, 80, Math.PI);
    world.commands.push({ kind: 'attack', team: 1, units: orcs, target: barracks });
    let destroyed = -1;
    world.events.on('buildingDestroyed', ({ id }) => (destroyed = id));
    run(40);
    expect(destroyed).toBe(barracks);
    expect(world.c.state[barracks]).toBe(UnitState.Dying);
    expect(world.buildings).not.toContain(barracks);
    expect(world.nav.isBlockedAt(60, 64)).toBe(false);
    run(12);
    expect(world.entities.isAlive(barracks)).toBe(false);
  });

  it('archers shoot at buildings when no soldier is in range', () => {
    const { world, run, buildings } = base(6);
    const farm = buildings.place(buildingIndex('human_farm'), 0, 60, 64, 0, true);
    const archers = spawnBlock(world, unitIndex('dark_elf_archer'), 1, 4, 4, 60, 100, Math.PI);
    world.commands.push({ kind: 'hold', team: 1, units: archers });
    let arrows = 0;
    world.events.on('unitHit', ({ attack }) => {
      if (attack.target === farm && attack.missile) arrows++;
    });
    run(10);
    expect(arrows).toBeGreaterThan(3);
    expect(world.c.hp[farm]).toBeLessThan(world.c.maxHp[farm]);
  });
});

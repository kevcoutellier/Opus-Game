import { describe, expect, it } from 'vitest';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { unitIndex } from '../../src/data/units';
import { Order } from '../../src/entities/Components';
import { Terrain } from '../../src/maps/Terrain';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

function battle(seed = 7, terrain?: Terrain) {
  const world = new World({ seed, terrain });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  return { world, run, sim };
}

const health = (world: World, ids: number[]) => ids.reduce((s, id) => s + Math.max(0, world.c.hp[id]), 0);

describe('flyers', () => {
  it('Storm Riders strike infantry, which cannot touch them; archers shoot them down; mortars cannot', () => {
    const { world, run } = battle();
    const riders = spawnBlock(world, unitIndex('hir_storm_rider'), 0, 3, 3, 64, 50, 0);
    const infantry = spawnBlock(world, unitIndex('vel_infantry'), 1, 9, 3, 64, 58, Math.PI);
    const struck = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (riders.includes(attack.target)) struck.add(attack.attacker);
    });
    world.commands.push({ kind: 'formationMove', team: 0, units: riders, x: 64, z: 58, facing: 0, width: null, formation: null, attackMove: true });
    world.commands.push({ kind: 'formationMove', team: 1, units: infantry, x: 64, z: 52, facing: Math.PI, width: null, formation: null, attackMove: true });
    const before = health(world, infantry);
    run(12);
    expect(health(world, infantry)).toBeLessThan(before - 100);
    expect([...struck].filter((a) => infantry.includes(a))).toHaveLength(0);

    // Mortars hold their fire; archers do not.
    const mortars = spawnBlock(world, unitIndex('hir_mortar'), 1, 3, 3, 64, 90, Math.PI);
    world.commands.push({ kind: 'hold', team: 1, units: mortars });
    run(8);
    expect([...struck].filter((a) => mortars.includes(a))).toHaveLength(0);
    for (const id of mortars) expect(world.c.target[id] < 0 || !world.c.flying[world.c.target[id]]).toBe(true);
    const archers = spawnBlock(world, unitIndex('vel_archer'), 1, 6, 3, 64, 80, Math.PI);
    world.commands.push({ kind: 'hold', team: 1, units: archers });
    run(10);
    expect([...struck].some((a) => archers.includes(a))).toBe(true);
  });
});

describe('mortars and spears', () => {
  it('a mortar shell bursts over several soldiers of a block', () => {
    const { world, run } = battle(8);
    const mortar = spawnUnit(world, unitIndex('hir_mortar'), 0, 64, 20, 0);
    const block = spawnBlock(world, unitIndex('hir_heavy_infantry'), 1, 16, 4, 64, 70, Math.PI);
    world.commands.push({ kind: 'hold', team: 1, units: block });
    let most = 0;
    world.events.on('projectileLanded', ({ index }) => {
      if (world.projectiles.attacker[index] !== mortar) return;
      let n = 0;
      for (const id of block) if (Math.hypot(world.c.x[id] - world.projectiles.ex[index], world.c.z[id] - world.projectiles.ez[index]) < 2.8) n++;
      most = Math.max(most, n);
    });
    const before = health(world, block);
    run(20);
    expect(health(world, block)).toBeLessThan(before);
    expect(most).toBeGreaterThanOrEqual(2);
  });

  it('spearmen pin the soldiers they strike', () => {
    const { world, run } = battle(9);
    const spears = spawnBlock(world, unitIndex('hir_spearman'), 0, 6, 6, 64, 60, 0);
    const orcs = spawnBlock(world, unitIndex('orc_warrior'), 1, 6, 6, 64, 64, Math.PI);
    world.commands.push({ kind: 'hold', team: 0, units: spears });
    let pinned = 0;
    for (let t = 0; t < 8 * 30; t++) {
      run(1 / 30);
      pinned = Math.max(pinned, orcs.filter((id) => world.c.pinned[id] > 0).length);
    }
    expect(pinned).toBeGreaterThanOrEqual(2);
  });
});

describe('cavalry archers', () => {
  it('shoot while they gallop, only at enemies on their left', () => {
    const { world, run } = battle(10);
    const riders = spawnBlock(world, unitIndex('vel_cavalry_archer'), 1, 4, 4, 20, 64, Math.PI / 2);
    // Riding east (+x): their left is north (−z)... the sim's left of facing (sin r, cos r) is (cos r, −sin r).
    const left = spawnBlock(world, unitIndex('hir_infantry'), 0, 6, 6, 60, 40, 0);
    const right = spawnBlock(world, unitIndex('hir_infantry'), 0, 6, 6, 60, 88, 0);
    world.commands.push({ kind: 'hold', team: 0, units: [...left, ...right] });
    // The targets stand still, so that left and right stay where they are.
    for (const id of [...left, ...right]) world.c.maxSpeed[id] = 0.01;
    const shotAt = new Set<number>();
    let shotsWhileMoving = 0;
    world.events.on('projectileLaunched', ({ x, z }) => {
      for (const id of riders) if (Math.hypot(world.c.x[id] - x, world.c.z[id] - z) < 0.5 && Math.hypot(world.c.vx[id], world.c.vz[id]) > 2) shotsWhileMoving++;
    });
    world.events.on('unitHit', ({ attack }) => {
      if (riders.includes(attack.attacker)) shotAt.add(attack.target);
    });
    world.commands.push({ kind: 'formationMove', team: 1, units: riders, x: 110, z: 64, facing: Math.PI / 2, width: null, formation: null, attackMove: false });
    run(14);
    expect(world.c.x[riders[0]]).toBeGreaterThan(80);
    expect(shotsWhileMoving).toBeGreaterThan(2);
    const leftSide = (id: number) => left.includes(id);
    const hits = [...shotAt];
    expect(hits.length).toBeGreaterThan(0);
    // East-bound riders face +x: (cos r, −sin r) with r = π/2 is (0, −1), north: the `left` block.
    expect(hits.every(leftSide)).toBe(true);
  });
});

describe('dark elves', () => {
  it('heal in the woods and shrug off part of the magic', () => {
    const size = 128;
    const trees: number[] = [];
    for (let x = 20; x <= 50; x += 3) for (let z = 20; z <= 50; z += 3) trees.push(x, z, 1, 0, 0);
    const terrain = new Terrain(size, new Float32Array((size + 1) * (size + 1)), trees, []);
    const { world, run, sim } = battle(11, terrain);
    const inWood = spawnUnit(world, unitIndex('vel_infantry'), 1, 35, 35, 0);
    const inField = spawnUnit(world, unitIndex('vel_infantry'), 1, 90, 90, 0);
    const man = spawnUnit(world, unitIndex('hir_infantry'), 0, 36, 33, 0);
    for (const id of [inWood, inField, man]) {
      world.c.hp[id] = world.c.maxHp[id] * 0.5;
      world.c.order[id] = Order.Hold;
    }
    world.entities.destroy(man);
    run(10);
    expect(world.c.hp[inWood]).toBeGreaterThan(world.c.maxHp[inWood] * 0.6);
    expect(world.c.hp[inField]).toBeCloseTo(world.c.maxHp[inField] * 0.5, 1);

    // The same spell hurts a man more than an elf.
    const elf = spawnUnit(world, unitIndex('vel_infantry'), 1, 100, 30, 0);
    const human = spawnUnit(world, unitIndex('hir_infantry'), 1, 104, 30, 0);
    world.c.defense[human] = world.c.defense[elf];
    world.c.armorType[human] = world.c.armorType[elf];
    const lost = { elf: 0, human: 0 };
    world.events.on('unitHit', ({ attack, damage }) => {
      if (attack.target === elf) lost.elf += damage;
      if (attack.target === human) lost.human += damage;
    });
    const caster = spawnUnit(world, unitIndex('hero_curian'), 0, 102, 20, 0);
    run(0.1);
    for (let k = 0; k < 6; k++) {
      const h = sim.heroes.get(caster)!;
      h.cooldowns[1] = 0;
      h.sp = 300;
      world.commands.push({ kind: 'cast', team: 0, hero: caster, slot: 1, x: 102, z: 30 });
      run(0.8);
    }
    expect(lost.human).toBeGreaterThan(0);
    expect(lost.elf).toBeLessThan(lost.human * 0.9);
  });
});

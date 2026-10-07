import { describe, expect, it } from 'vitest';
import { FIRE_CELL } from '../../src/combat/FireSystem';
import { TroopAI } from '../../src/ai/TroopAI';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { ABILITIES } from '../../src/data/abilities';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { UnitState } from '../../src/entities/Components';
import { Terrain } from '../../src/maps/Terrain';
import { spawnUnit } from '../../src/units/UnitFactory';

/** A flat 128 m map with a wood from x = 60 to 100, z = 40 to 90 (a tree every 3 m). */
function woodland(): Terrain {
  const size = 128;
  const trees: number[] = [];
  for (let x = 60; x <= 100; x += 3) for (let z = 40; z <= 90; z += 3) trees.push(x, z, 1, 0, 0);
  return new Terrain(size, new Float32Array((size + 1) * (size + 1)), trees, []);
}

function battle(seed = 4) {
  const world = new World({ seed, terrain: woodland() });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  return { world, run, troops: sim.troops, heroes: sim.heroes };
}

describe('skill data', () => {
  it('gives every troop of The Crusaders known skills', () => {
    for (const def of UNIT_DEFS) for (const id of def.skills) expect(ABILITIES.some((a) => a.id === id)).toBe(true);
    const skills = (id: string) => UNIT_DEFS.find((d) => d.id === id)!.skills;
    expect(skills('hir_archer')).toContain('fire_arrow');
    expect(skills('hir_sapper')).toEqual(['trap', 'set_fire']);
    expect(skills('hir_paladin')).toContain('curatio');
    expect(skills('vel_infantry')).toEqual(['tree_of_healing', 'elemental_boost']);
    // Fire Arrow costs 20 SP, the sappers' fire five times more.
    const cost = (id: string) => ABILITIES.find((a) => a.id === id)!.spCost;
    expect(cost('fire_arrow')).toBe(20);
    expect(cost('set_fire')).toBe(5 * cost('fire_arrow'));
  });
});

describe('forest fires', () => {
  it('only woods burn; the fire spreads through them, burns out, and hurts those inside', () => {
    const { world, run } = battle();
    expect(world.fire.ignite(20, 20, 6)).toBe(0);
    expect(world.fire.ignite(80, 65, 4)).toBeGreaterThan(0);
    const burning = () => world.fire.active.size;
    const start = burning();
    const man = spawnUnit(world, unitIndex('hir_infantry'), 0, 80, 65, 0);
    world.c.order[man] = 1;
    const hp = world.c.hp[man];
    run(1.2);
    expect(world.c.hp[man]).toBeLessThan(hp);
    run(12);
    expect(burning()).toBeGreaterThan(start);
    // Fire never leaves the wood.
    for (const cell of world.fire.active) expect(world.fire.centreX(cell)).toBeGreaterThan(60 - FIRE_CELL * 2);
    run(120);
    expect(burning()).toBe(0);
    expect(world.fire.burnt.reduce((s, v) => s + v, 0)).toBeGreaterThan(start);
  });
});

describe('troop skills', () => {
  it('earn SP by fighting and spend them: Fire Arrow sets the wood ablaze', () => {
    const { world, run, troops } = battle();
    const archers = troops.create({ team: 0, name: 'Archers', soldierType: 'hir_archer', count: 10, x: 40, z: 65, facing: Math.PI / 2 });
    run(0.2);
    expect(archers.skills.map((a) => a.id)).toEqual(['fire_arrow']);
    const sp = archers.sp;
    world.commands.push({ kind: 'troopSkill', team: 0, troop: archers.id, slot: 0, x: 80, z: 65 });
    run(0.1);
    expect(archers.sp).toBe(sp - 20);
    expect(troops.skillBlocked(archers, 0)).toBe('casting');
    run(1.2);
    expect(world.fire.active.size).toBeGreaterThan(0);
    expect(troops.skillBlocked(archers, 0)).toBe('cooldown');
    // A blow that lands earns SP; a kill more.
    const before = archers.sp;
    const orc = spawnUnit(world, unitIndex('orc_warrior'), 1, 41, 66, 0);
    world.c.hp[orc] = 1;
    run(4);
    expect(world.c.state[orc]).toBe(UnitState.Dying);
    expect(archers.sp).toBeGreaterThan(before + 5);
  });

  it('a trap laid by sappers blows up under the first enemy, stuns and sets the wood on fire', () => {
    const { world, run, troops } = battle();
    const sappers = troops.create({ team: 0, name: 'Sapeurs', soldierType: 'hir_sapper', count: 10, x: 60, z: 30, facing: 0 });
    run(0.2);
    world.commands.push({ kind: 'troopSkill', team: 0, troop: sappers.id, slot: 0, x: 62, z: 44 });
    run(2);
    expect(world.traps).toHaveLength(1);
    const orc = spawnUnit(world, unitIndex('orc_warrior'), 1, 62, 52, 0);
    world.c.maxHp[orc] = world.c.hp[orc] = 400;
    world.commands.push({ kind: 'formationMove', team: 1, units: [orc], x: 62, z: 38, facing: null, width: null, formation: null, attackMove: false });
    let sprung = false;
    world.events.on('trapSprung', () => (sprung = true));
    run(8);
    expect(sprung).toBe(true);
    expect(world.traps).toHaveLength(0);
    expect(world.c.hp[orc]).toBeLessThan(400 - 40);
    expect(world.fire.active.size + world.fire.burnt.reduce((s, v) => s + v, 0)).toBeGreaterThan(0);
  });

  it('heals with Curatio and Tree of Healing, and a hero’s troop uses its hero’s SP', () => {
    const { world, run, troops, heroes } = battle();
    const paladins = troops.create({ team: 0, name: 'Paladins', soldierType: 'hir_paladin', count: 8, x: 30, z: 30, facing: 0 });
    run(0.2);
    for (const id of paladins.members) world.c.hp[id] = world.c.maxHp[id] * 0.4;
    paladins.sp = 300;
    world.commands.push({ kind: 'troopSkill', team: 0, troop: paladins.id, slot: 0, x: 0, z: 0 });
    run(1.5);
    for (const id of paladins.members) expect(world.c.hp[id]).toBeGreaterThan(world.c.maxHp[id] * 0.75);

    const lucretia = spawnUnit(world, unitIndex('hero_lucretia'), 1, 0, 0, 0);
    const guard = troops.create({ team: 1, name: 'Garde', soldierType: 'vel_infantry', count: 8, leader: lucretia, x: 30, z: 100, facing: Math.PI });
    run(0.2);
    expect(guard.skills).toHaveLength(0);
    expect(troops.spOf(guard)).toBe(heroes.get(lucretia)!.sp);
    for (const id of guard.members) world.c.hp[id] = world.c.maxHp[id] * 0.5;
    heroes.get(lucretia)!.sp = 200;
    world.commands.push({ kind: 'cast', team: 1, hero: lucretia, slot: 0, x: 0, z: 0 });
    run(1.2);
    expect(heroes.get(lucretia)!.sp).toBe(50);
    const healed = guard.members.filter((id) => world.c.hp[id] > world.c.maxHp[id] * 0.7);
    expect(healed.length).toBeGreaterThanOrEqual(guard.members.length - 2);
  });
});

describe('troop AI and skills', () => {
  it('heals its wounded troop, and sets fire to the wood where the enemy stands', () => {
    const world = new World({ seed: 6, terrain: woodland() });
    const ai = new TroopAI(world, { team: 1 });
    const sim = createBattleSimulation(world, [ai]);
    ai.troops = sim.troops;
    ai.heroes = sim.heroes;
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
    };
    const elves = sim.troops.create({ team: 1, name: 'Elfes', soldierType: 'vel_infantry', count: 10, x: 30, z: 20, facing: 0 });
    run(0.5);
    for (const id of elves.members) world.c.hp[id] = world.c.maxHp[id] * 0.4;
    elves.sp = 400;
    run(3);
    expect(elves.sp).toBeLessThan(400);
    expect(elves.members.filter((id) => world.c.hp[id] > world.c.maxHp[id] * 0.6).length).toBeGreaterThan(5);

    const archers = sim.troops.create({ team: 1, name: 'Archers', soldierType: 'hir_archer', count: 8, x: 45, z: 65, facing: Math.PI / 2 });
    sim.troops.create({ team: 0, name: 'Cibles', soldierType: 'hir_infantry', count: 6, x: 80, z: 65, facing: -Math.PI / 2 });
    world.commands.push({ kind: 'troopHold', team: 1, troop: archers.id });
    run(4);
    expect(world.fire.active.size + world.fire.burnt.reduce((s, v) => s + v, 0)).toBeGreaterThan(0);
  });
});

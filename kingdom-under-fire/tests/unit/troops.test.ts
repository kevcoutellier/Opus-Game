import { describe, expect, it } from 'vitest';
import { TroopAI } from '../../src/ai/TroopAI';
import { kill } from '../../src/combat/DamageSystem';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { MoraleState, Order, UnitState } from '../../src/entities/Components';
import { BattleOutcome } from '../../src/scenes/BattleOutcome';
import { setupTroopBattle } from '../../src/scenes/BattleScene';
import { spawnUnit } from '../../src/units/UnitFactory';

function battle(seed = 3) {
  const world = new World({ seed });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  return { world, run, troops: sim.troops };
}

const centroid = (world: World, ids: number[]) => {
  let x = 0;
  let z = 0;
  for (const id of ids) {
    x += world.c.x[id];
    z += world.c.z[id];
  }
  return { x: x / ids.length, z: z / ids.length };
};

describe('troops', () => {
  it('raises soldiers around a tougher captain, all in one formation', () => {
    const { world, run, troops } = battle();
    const t = troops.create({ team: 0, name: 'Infanterie', soldierType: 'human_footman', count: 15, x: 40, z: 40, facing: 0 });
    run(0.1);
    expect(t.members).toHaveLength(16);
    expect(world.c.leader[t.leader]).toBe(1);
    expect(world.c.maxHp[t.leader]).toBeGreaterThan(world.c.maxHp[t.members[1]] * 4);
    const formations = new Set(t.members.map((id) => world.c.formation[id]));
    expect(formations.size).toBe(1);
    for (const id of t.members) expect(troops.of(id)).toBe(t);
    // The captain stands in front of his men (the troop faces +z).
    expect(world.c.z[t.leader]).toBeGreaterThan(centroid(world, t.members.slice(1)).z);
  });

  it('marches through its waypoints in order', () => {
    const { world, run, troops } = battle();
    const t = troops.create({ team: 0, name: 'Infanterie', soldierType: 'human_footman', count: 11, x: 30, z: 30, facing: 0 });
    world.commands.push({ kind: 'troopMove', team: 0, troop: t.id, x: 30, z: 70, queue: false });
    world.commands.push({ kind: 'troopMove', team: 0, troop: t.id, x: 80, z: 70, queue: true });
    let passedFirst = false;
    // (orders are applied at the next tick)
    for (let s = 0; s < 60; s++) {
      run(1);
      const p = centroid(world, t.members);
      if (Math.hypot(p.x - 30, p.z - 70) < 8) passedFirst = true;
      if (!t.waypoints.length) break;
    }
    run(4);
    expect(passedFirst).toBe(true);
    expect(t.waypoints).toHaveLength(0);
    const p = centroid(world, t.members);
    expect(Math.hypot(p.x - 80, p.z - 70)).toBeLessThan(5);
  });

  it('breaks when its leader falls: the soldiers flee, never rally, and leave the field', () => {
    const { world, run, troops } = battle();
    const t = troops.create({ team: 1, name: 'Guerriers', soldierType: 'orc_warrior', count: 12, x: 64, z: 64, facing: 0 });
    run(0.5);
    let routed = false;
    world.events.on('troopRouted', ({ troop }) => (routed = troop === t.id));
    world.c.hp[t.leader] = 1;
    const killer = spawnUnit(world, unitIndex('human_knight'), 0, world.c.x[t.leader], world.c.z[t.leader] + 1.3, Math.PI);
    world.c.attack[killer] = 500;
    run(3);
    expect(world.c.state[t.leader]).toBe(UnitState.Dying);
    expect(routed).toBe(true);
    expect(t.status).toBe('routing');
    // The knight is removed: nobody threatens them any more.
    world.entities.destroy(killer);
    run(2);
    expect(t.members.every((id) => world.c.moraleState[id] === MoraleState.Routing)).toBe(true);
    let defeated = false;
    world.events.on('troopDefeated', ({ troop }) => (defeated = troop === t.id));
    run(15);
    expect(defeated).toBe(true);
    expect(t.status).toBe('defeated');
  });

  it('sends the whole army side by side to one place', () => {
    const { world, run, troops } = battle();
    const a = troops.create({ team: 0, name: 'A', soldierType: 'human_footman', count: 9, x: 30, z: 20, facing: 0 });
    const b = troops.create({ team: 0, name: 'B', soldierType: 'human_spearman', count: 9, x: 60, z: 20, facing: 0 });
    const c = troops.create({ team: 0, name: 'C', soldierType: 'human_archer', count: 9, x: 90, z: 20, facing: 0 });
    world.commands.push({ kind: 'troopsMoveAll', team: 0, x: 60, z: 80 });
    run(35);
    const pa = centroid(world, a.members);
    const pb = centroid(world, b.members);
    const pc = centroid(world, c.members);
    for (const p of [pa, pb, pc]) expect(Math.abs(p.z - 80)).toBeLessThan(5);
    // Same order from left to right as before, about TROOP_GAP apart.
    expect(pa.x).toBeLessThan(pb.x);
    expect(pb.x).toBeLessThan(pc.x);
    expect(pb.x - pa.x).toBeGreaterThan(10);
  });

  it('escorts its hero while the player steers him, and takes him back in its ranks', () => {
    const { world, run, troops } = battle();
    const curian = spawnUnit(world, unitIndex('hero_curian'), 0, 0, 0, 0);
    const t = troops.create({ team: 0, name: 'Curian', soldierType: 'human_footman', count: 12, leader: curian, x: 40, z: 40, facing: 0 });
    run(0.5);
    world.commands.push({ kind: 'heroControl', team: 0, hero: curian, direct: true });
    for (let k = 0; k < 4 * 30; k++) {
      world.commands.push({ kind: 'heroSteer', team: 0, hero: curian, x: 1, z: 0, aim: Math.PI / 2 });
      run(1 / 30);
    }
    world.commands.push({ kind: 'heroSteer', team: 0, hero: curian, x: 0, z: 0, aim: Math.PI / 2 });
    run(4);
    expect(world.c.x[curian]).toBeGreaterThan(50);
    const escort = centroid(world, t.members.filter((id) => id !== curian));
    expect(Math.hypot(escort.x - world.c.x[curian], escort.z - world.c.z[curian])).toBeLessThan(8);
    world.commands.push({ kind: 'heroControl', team: 0, hero: curian, direct: false });
    run(0.5);
    expect(world.c.order[curian]).not.toBe(Order.Direct);
    expect(new Set(t.members.map((id) => world.c.formation[id])).size).toBe(1);
  });

  it('attacks an enemy troop on order', () => {
    const { world, run, troops } = battle(5);
    const ours = troops.create({ team: 0, name: 'Infanterie', soldierType: 'human_footman', count: 12, x: 40, z: 30, facing: 0 });
    const theirs = troops.create({ team: 1, name: 'Guerriers', soldierType: 'orc_warrior', count: 12, x: 40, z: 80, facing: Math.PI });
    world.commands.push({ kind: 'troopHold', team: 1, troop: theirs.id });
    world.commands.push({ kind: 'troopAttack', team: 0, troop: ours.id, target: theirs.id });
    const hp = () => theirs.members.reduce((s, id) => s + Math.max(0, world.c.hp[id]), 0);
    const before = hp();
    run(25);
    expect(ours.status === 'fighting' || hp() < before).toBe(true);
    expect(hp()).toBeLessThan(before);
  });
});

describe('TroopAI', () => {
  it('holds until its advance time, marches, then attacks the troop it sees', () => {
    const world = new World({ seed: 9 });
    const ai = new TroopAI(world, { team: 1, stance: { kind: 'advance', x: 64, z: 40, after: 5 }, engageRadius: 40 });
    const sim = createBattleSimulation(world, [ai]);
    ai.troops = sim.troops;
    ai.heroes = sim.heroes;
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
    };
    const ours = sim.troops.create({ team: 0, name: 'Infanterie', soldierType: 'human_footman', count: 12, x: 64, z: 30, facing: 0 });
    const theirs = sim.troops.create({ team: 1, name: 'Guerriers', soldierType: 'orc_warrior', count: 12, x: 64, z: 118, facing: Math.PI });
    world.commands.push({ kind: 'troopHold', team: 0, troop: ours.id });
    const start = centroid(world, theirs.members).z;
    run(4);
    expect(Math.abs(centroid(world, theirs.members).z - start)).toBeLessThan(1.5);
    run(6);
    expect(centroid(world, theirs.members).z).toBeLessThan(start - 4);
    const hp = () => ours.members.reduce((s, id) => s + Math.max(0, world.c.hp[id]), 0);
    const before = hp();
    run(40);
    expect(hp()).toBeLessThan(before);
  });
});

describe('troop battle', () => {
  it('deploys the troops of both sides, each hero leading the first', () => {
    const { world, troops } = battle();
    const setup = setupTroopBattle(world, troops, 128);
    expect(setup.playerTroops).toHaveLength(6);
    expect(setup.enemyTroops).toHaveLength(5);
    expect(setup.playerTroops[0].hero).toBe(true);
    expect(setup.enemyTroops[0].hero).toBe(true);
    expect(setup.hero).toBe(setup.playerTroops[0].leader);
    expect(UNIT_DEFS[world.c.unitType[setup.hero]].role).toBe('hero');
    expect(setup.player.units).toHaveLength(setup.playerTroops.reduce((n, t) => n + t.members.length, 0));
  });

  it('is lost when the player’s hero falls, won when every enemy troop is broken', () => {
    const lost = battle();
    const a = setupTroopBattle(lost.world, lost.troops, 128);
    const outcome = new BattleOutcome(0, { troops: lost.troops, hero: a.hero });
    lost.run(1);
    expect(outcome.update(lost.world)).toBeNull();
    lost.world.c.hp[a.hero] = 0;
    kill(lost.world, a.hero, -1);
    for (let s = 0; s < 6; s++) {
      lost.run(1);
      outcome.update(lost.world);
    }
    expect(outcome.result).toBe('defeat');

    const won = battle();
    const b = setupTroopBattle(won.world, won.troops, 128);
    const result = new BattleOutcome(0, { troops: won.troops, hero: b.hero });
    for (const t of b.enemyTroops) for (const id of t.members) won.world.entities.destroy(id);
    for (let s = 0; s < 6; s++) {
      won.run(1);
      result.update(won.world);
    }
    expect(result.result).toBe('victory');
  });
});

import { describe, expect, it } from 'vitest';
import { ProjectilePool } from '../../src/combat/Projectiles';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { unitIndex } from '../../src/data/units';
import { Order, UnitState } from '../../src/entities/Components';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

const ARCHER = unitIndex('human_archer');
const ORC = unitIndex('orc_warrior');
const FOOTMAN = unitIndex('human_footman');

function battle(seed = 3) {
  const world = new World({ seed });
  const { simulation } = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * world.time.hz; i++) simulation.step(world.time.dt);
  };
  return { world, run };
}

describe('projectile pool', () => {
  it('reuses released slots and refuses shots when full', () => {
    const pool = new ProjectilePool(3);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect([a, b, c]).toEqual([0, 1, 2]);
    expect(pool.acquire()).toBe(-1);
    pool.release(b);
    expect(pool.count).toBe(2);
    expect(pool.acquire()).toBe(b);
  });

  it('flies a parabola from the bow to the aim point', () => {
    const pool = new ProjectilePool(1);
    const i = pool.acquire();
    pool.sx[i] = 0;
    pool.sy[i] = 1;
    pool.sz[i] = 0;
    pool.ex[i] = 40;
    pool.ey[i] = 1;
    pool.ez[i] = 0;
    pool.arc[i] = 5;
    pool.duration[i] = 2;
    const p = { x: 0, y: 0, z: 0 };
    pool.positionAt(i, 1, p);
    expect(p).toEqual({ x: 20, y: 6, z: 0 });
    pool.positionAt(i, 2, p);
    expect(p).toEqual({ x: 40, y: 1, z: 0 });
  });
});

describe('archers', () => {
  it('stand and shoot an enemy in range; the arrows land and wound', () => {
    const { world, run } = battle();
    const archer = spawnUnit(world, ARCHER, 0, 40, 40, Math.PI / 2);
    const orc = spawnUnit(world, ORC, 1, 75, 40);
    world.commands.push({ kind: 'hold', team: 1, units: [orc] });
    let launched = 0;
    let landed = 0;
    world.events.on('projectileLaunched', () => launched++);
    world.events.on('projectileLanded', () => landed++);
    run(12);
    expect(launched).toBeGreaterThanOrEqual(4);
    expect(landed).toBeGreaterThanOrEqual(launched - 1);
    expect(world.c.hp[orc]).toBeLessThan(world.c.maxHp[orc]);
    // The archer did not walk up to the orc: it shot from where it stood.
    expect(Math.hypot(world.c.x[archer] - 40, world.c.z[archer] - 40)).toBeLessThan(1.5);
  });

  it('ignore enemies out of range and never hit their own side', () => {
    const { world, run } = battle(4);
    spawnUnit(world, ARCHER, 0, 20, 64, Math.PI / 2);
    const far = spawnUnit(world, ORC, 1, 90, 64);
    world.commands.push({ kind: 'hold', team: 1, units: [far] });
    let launched = 0;
    world.events.on('projectileLaunched', () => launched++);
    run(5);
    expect(launched).toBe(0);

    // A friendly block stands right on the line of fire, around the target.
    const { world: w2, run: run2 } = battle(5);
    spawnUnit(w2, ARCHER, 0, 30, 64, Math.PI / 2);
    const friends = spawnBlock(w2, FOOTMAN, 0, 16, 4, 64, 64, 0);
    const target = spawnUnit(w2, ORC, 1, 64, 64);
    w2.commands.push({ kind: 'hold', team: 0, units: friends });
    w2.commands.push({ kind: 'hold', team: 1, units: [target] });
    let hits = 0;
    w2.events.on('unitHit', ({ attack }) => {
      if (attack.missile) {
        hits++;
        expect(w2.c.team[attack.target]).toBe(1);
      }
    });
    run2(10);
    expect(hits).toBeGreaterThan(0);
  });

  it('draw their dagger when an enemy reaches them', () => {
    const { world, run } = battle(6);
    const archer = spawnUnit(world, ARCHER, 0, 40, 40, Math.PI / 2);
    const orc = spawnUnit(world, ORC, 1, 55, 40);
    world.commands.push({ kind: 'attack', team: 1, units: [orc], target: archer });
    let stabs = 0;
    world.events.on('unitHit', ({ attack }) => {
      if (attack.attacker === archer && !attack.missile) stabs++;
    });
    run(15);
    expect(stabs).toBeGreaterThan(0);
  });

  it('thin out an orc charge before the lines meet', () => {
    // 20 archers holding their ground against 20 orcs charging from 60 m: the orcs must have lost a good
    // part of their health before they reach the bows.
    const { world, run } = battle(7);
    const archers = spawnBlock(world, ARCHER, 0, 20, 10, 64, 30, 0);
    const orcs = spawnBlock(world, ORC, 1, 20, 10, 64, 92, Math.PI);
    world.commands.push({ kind: 'hold', team: 0, units: archers });
    world.commands.push({ kind: 'formationMove', team: 1, units: orcs, x: 64, z: 30, facing: null, width: null, formation: 'LINE', attackMove: true });
    let contact = false;
    let hpAtContact = 0;
    for (let s = 0; s < 80 && !contact; s++) {
      run(0.5);
      contact = orcs.some((o) => world.c.state[o] === UnitState.Attacking);
      if (contact) for (const o of orcs) hpAtContact += Math.max(0, world.c.hp[o]);
    }
    expect(contact).toBe(true);
    const full = orcs.length * world.c.maxHp[orcs[0]];
    expect(hpAtContact / full).toBeLessThan(0.85);
    expect(world.c.order[archers[0]]).toBe(Order.Hold);
  });
});

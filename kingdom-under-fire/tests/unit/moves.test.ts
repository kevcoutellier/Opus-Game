import { describe, expect, it } from 'vitest';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { OFFICERS } from '../../src/data/officers';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { SwingKind } from '../../src/entities/Components';
import type { Button, MoveId } from '../../src/heroes/Moves';
import { MOVES, nextMove } from '../../src/heroes/Moves';
import { ASSIST_SP } from '../../src/heroes/Officer';
import { IMPACT_FRACTION } from '../../src/units/Unit';
import { spawnUnit } from '../../src/units/UnitFactory';

const CURIAN = unitIndex('hero_curian');
const ORC = unitIndex('orc_warrior');
const AIM_EAST = Math.PI / 2;

/** Curian under direct control at (40, 40), looking east, and a way to press his buttons. */
function arena(seed = 5) {
  const world = new World({ seed });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  const curian = spawnUnit(world, CURIAN, 0, 40, 40, AIM_EAST);
  world.commands.push({ kind: 'heroControl', team: 0, hero: curian, direct: true });
  run(0.1);
  const press = (button: Button, x = 0, z = 0) => world.commands.push({ kind: 'heroButton', team: 0, hero: curian, button, x, z, aim: AIM_EAST });
  const moves: MoveId[] = [];
  world.events.on('heroMove', ({ move }) => moves.push(move));
  return { world, sim, run, curian, h: sim.heroes.get(curian)!, press, moves };
}

/** An orc that takes blows without falling or striking back. */
function dummy(world: World, x: number, z: number): number {
  const id = spawnUnit(world, ORC, 1, x, z, -AIM_EAST);
  world.c.maxHp[id] = world.c.hp[id] = 100000;
  world.c.attack[id] = 0;
  world.c.attackTimer[id] = 1000;
  return id;
}

describe('moves data', () => {
  it('chains the combos of The Crusaders', () => {
    expect(nextMove(null, 'X', 0)).toBe('weak1');
    let m = MOVES.get('weak1')!;
    const weak: string[] = [m.id];
    while (m.next.X) {
      m = MOVES.get(m.next.X)!;
      weak.push(m.id);
    }
    expect(weak).toEqual(['weak1', 'weak2', 'weak3', 'weak4', 'weak5']);
    expect(nextMove(MOVES.get('weak1')!, 'A', 0)).toBe('strong2');
    expect(nextMove(MOVES.get('weak1')!, 'A', 1)).toBe('thrust');
    expect(nextMove(null, 'Y', 0)).toBe('special');
    expect(nextMove(MOVES.get('special')!, 'Y', 0)).toBe('smash');
    expect(MOVES.get('smash')!.sp).toBe(180);
    expect(nextMove(null, 'B', 0)).toBeNull();
  });

  it('gives each hero officer a known definition, one per chord', () => {
    for (const def of UNIT_DEFS.filter((d) => d.hero)) {
      const chords = def.hero!.officers.map((id) => OFFICERS.find((o) => o.id === id)!.chord);
      expect(new Set(chords).size).toBe(chords.length);
    }
  });
});

describe('hero moves', () => {
  it('chains the weak combo when X is pressed again during each blow, and counts the hits', () => {
    const { world, run, press, moves, h } = arena();
    for (let k = 0; k < 3; k++) dummy(world, 41.4, 39.2 + k * 0.8);
    for (let k = 0; k < 5; k++) {
      press('X');
      run(0.2);
    }
    run(1.2);
    expect(moves.slice(0, 5)).toEqual(['weak1', 'weak2', 'weak3', 'weak4', 'weak5']);
    expect(h.combo).toBeGreaterThanOrEqual(10);
  });

  it('turns into the strong combo with X then A A A A, whose last blow strikes all around', () => {
    const { world, run, press, moves, curian } = arena();
    dummy(world, 41.4, 40);
    const behind = dummy(world, 38.6, 40);
    const struck = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.attacker === curian) struck.add(attack.target);
    });
    for (const b of ['X', 'A', 'A', 'A', 'A'] as const) {
      press(b);
      run(0.3);
    }
    run(1.5);
    expect(moves.slice(0, 5)).toEqual(['weak1', 'strong2', 'strong3', 'strong4', 'strong5']);
    expect(struck.has(behind)).toBe(true);
  });

  it('thrusts with A and the stick towards the enemy: the hero lunges forward', () => {
    const { world, run, press, moves, curian } = arena();
    const x0 = world.c.x[curian];
    press('A', 1, 0);
    run(0.8);
    expect(moves).toEqual(['thrust']);
    expect(world.c.x[curian] - x0).toBeGreaterThan(1.5);
  });

  it('performs the special attack with Y, and the Smash with Y Y for 180 SP', () => {
    const { world, run, press, moves, h } = arena();
    const orcs = [dummy(world, 42, 40), dummy(world, 40, 43), dummy(world, 37.5, 40)];
    h.sp = 50;
    press('Y');
    run(0.15);
    press('Y');
    run(1.5);
    expect(moves).toEqual(['special']);
    h.sp = 200;
    press('Y');
    run(0.15);
    press('Y');
    run(0.2);
    expect(world.c.swingKind[h.id]).toBe(SwingKind.Move);
    run(1.5);
    expect(moves).toEqual(['special', 'special', 'smash']);
    expect(h.sp).toBeLessThan(200 - 180 + 30);
    for (const o of orcs) expect(world.c.hp[o]).toBeLessThan(world.c.maxHp[o]);
  });

  it('counters with B as an enemy strikes: the blow is parried, the attacker stunned and wounded', () => {
    const { world, run, press, moves, curian } = arena();
    const orc = spawnUnit(world, ORC, 1, 41.5, 40, -AIM_EAST);
    const hpBefore = world.c.hp[curian];
    // Wait for the orc's blow to be on its way.
    let ready = false;
    for (let t = 0; t < 120 && !ready; t++) {
      run(1 / 30);
      const left = world.c.swingDuration[orc] * IMPACT_FRACTION - world.c.swing[orc];
      ready = world.c.swing[orc] >= 0 && world.c.target[orc] === curian && left > 0.12 && left < 0.4;
    }
    expect(ready).toBe(true);
    const hit = world.c.hp[curian];
    press('B');
    run(0.6);
    expect(moves).toEqual(['counter']);
    expect(world.c.hp[curian]).toBe(hit);
    expect(hit).toBeGreaterThan(hpBefore - 60);
    expect(world.c.stun[orc]).toBeGreaterThan(0);
    expect(world.c.hp[orc]).toBeLessThan(world.c.maxHp[orc]);
  });

  it('pushes the enemies away with B right after being hit, else dodges', () => {
    const { world, run, press, moves, curian } = arena();
    const ring = [0, 1, 2, 3].map((k) => dummy(world, 40 + Math.sin((k * Math.PI) / 2) * 1.3, 40 + Math.cos((k * Math.PI) / 2) * 1.3));
    const dist = () => ring.reduce((s, o) => s + Math.hypot(world.c.x[o] - 40, world.c.z[o] - 40), 0) / ring.length;
    const before = dist();
    world.c.lastHit[curian] = 0.1;
    press('B');
    run(0.8);
    expect(moves).toEqual(['repel']);
    expect(dist()).toBeGreaterThan(before + 0.8);
    // Again at once: the knockback needs time, and nobody hit him: a dodge.
    world.c.lastHit[curian] = 5;
    let dodged = false;
    world.events.on('heroDodged', () => (dodged = true));
    press('B', 0, 1);
    run(0.2);
    expect(dodged).toBe(true);
  });
});

describe('SP and officers', () => {
  it('earns SP by fighting, never by waiting', () => {
    const { world, run, press, h } = arena();
    const start = h.sp;
    run(10);
    expect(h.sp).toBe(start);
    const orc = spawnUnit(world, ORC, 1, 41.4, 40, -AIM_EAST);
    world.c.hp[orc] = 1;
    world.c.attack[orc] = 0;
    press('X');
    run(0.6);
    expect(world.c.hp[orc]).toBeLessThanOrEqual(0);
    expect(h.sp).toBeGreaterThanOrEqual(start + 10);
  });

  it('raises two officers in the hero’s troop; the paladin heals it, the lieutenant cuts through the enemy', () => {
    const world = new World({ seed: 8 });
    const sim = createBattleSimulation(world);
    const run = (seconds: number) => {
      for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
    };
    const curian = spawnUnit(world, CURIAN, 0, 0, 0, 0);
    const troop = sim.troops.create({ team: 0, name: 'Garde', soldierType: 'human_footman', count: 10, leader: curian, x: 40, z: 40, facing: 0 });
    run(0.2);
    const h = sim.heroes.get(curian)!;
    const officers = troop.members.filter((id) => world.c.officer[id] > 0);
    expect(officers).toHaveLength(2);
    expect(h.officers.map((o) => o?.def.chord)).toEqual(['XA', 'BY']);
    expect(h.officers.map((o) => o?.unit)).toEqual(officers);

    // Curatio (B + Y): too few SP, nothing; with enough, the wounded of the troop heal.
    const wounded = troop.members.filter((id) => world.c.officer[id] === 0 && id !== curian);
    for (const id of wounded) world.c.hp[id] = world.c.maxHp[id] * 0.3;
    h.sp = ASSIST_SP - 1;
    world.commands.push({ kind: 'officerAssist', team: 0, hero: curian, slot: 1 });
    run(0.1);
    expect(sim.heroes.assistBlocked(world, h, 1)).toBe('sp');
    expect(world.c.hp[wounded[0]]).toBeCloseTo(world.c.maxHp[wounded[0]] * 0.3, 0);
    h.sp = ASSIST_SP + 50;
    world.commands.push({ kind: 'officerAssist', team: 0, hero: curian, slot: 1 });
    run(0.1);
    expect(h.sp).toBeLessThanOrEqual(50 + 5);
    for (const id of wounded) expect(world.c.hp[id]).toBeGreaterThan(world.c.maxHp[id] * 0.7);

    // The lieutenant's assault (X + A) through orcs ahead of the hero.
    const ahead = [0, 1, 2].map((k) => spawnUnit(world, ORC, 1, 40 + (k - 1) * 1.2, 52, Math.PI));
    run(0.1);
    world.c.rot[curian] = 0;
    const struck = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.ability === 'lieutenant_assault') struck.add(attack.target);
    });
    h.sp = ASSIST_SP;
    world.commands.push({ kind: 'officerAssist', team: 0, hero: curian, slot: 0 });
    run(0.2);
    expect(struck.size).toBeGreaterThanOrEqual(2);
    expect(ahead.some((o) => struck.has(o))).toBe(true);
  });
});

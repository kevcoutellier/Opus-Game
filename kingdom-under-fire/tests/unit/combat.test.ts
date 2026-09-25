import { describe, expect, it } from 'vitest';
import { computeDamage, CRITICAL_MULTIPLIER, DamageSystem } from '../../src/combat/DamageSystem';
import { Random } from '../../src/core/Random';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { unitIndex } from '../../src/data/units';
import { MoraleState, Order, UnitState } from '../../src/entities/Components';
import { BattleOutcome } from '../../src/scenes/BattleOutcome';
import { setupPrototypeBattle } from '../../src/scenes/BattleScene';
import { CORPSE_SECONDS } from '../../src/units/Unit';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

const SWORD = unitIndex('human_footman');

const average = (fn: (rng: Random) => number, n = 2000) => {
  const rng = new Random(1);
  let sum = 0;
  for (let i = 0; i < n; i++) sum += fn(rng);
  return sum / n;
};

describe('damage formula', () => {
  const blow = { damage: 20, damageType: 'SLASH' as const, criticalChance: 0 };

  it('is mitigated by defence, never below 1', () => {
    const light = average((r) => computeDamage(blow, 0, 'MEDIUM', r).damage);
    const armoured = average((r) => computeDamage(blow, 15, 'MEDIUM', r).damage);
    expect(light).toBeCloseTo(20, 0);
    expect(armoured).toBeCloseTo(20 * (100 / 160), 0);
    expect(computeDamage({ ...blow, damage: 0.1 }, 500, 'HEAVY', new Random(2)).damage).toBe(1);
  });

  it('applies damage types against armour types and critical hits', () => {
    const pierceMounted = average((r) => computeDamage({ ...blow, damageType: 'PIERCING' }, 0, 'MOUNTED', r).damage);
    const pierceHeavy = average((r) => computeDamage({ ...blow, damageType: 'PIERCING' }, 0, 'HEAVY', r).damage);
    expect(pierceMounted).toBeGreaterThan(pierceHeavy * 1.4);
    const magic = average((r) => computeDamage({ ...blow, damageType: 'MAGICAL' }, 20, 'MEDIUM', r).damage);
    const slash = average((r) => computeDamage(blow, 20, 'MEDIUM', r).damage);
    expect(magic).toBeGreaterThan(slash * 1.3);
    const crit = average((r) => computeDamage({ ...blow, criticalChance: 1 }, 0, 'MEDIUM', r).damage);
    expect(crit / 20).toBeCloseTo(CRITICAL_MULTIPLIER, 1);
  });

  it('hurts, shakes, pushes back and kills through the DamageSystem', () => {
    const world = new World({ seed: 1 });
    const a = spawnUnit(world, SWORD, 0, 10, 10);
    const b = spawnUnit(world, SWORD, 1, 11, 10);
    const deaths: number[] = [];
    world.events.on('unitDied', (e) => deaths.push(e.id));
    const damage = new DamageSystem();
    const attack = { attacker: a, target: b, damage: 20, damageType: 'SLASH' as const, timestamp: 0, x: 10, z: 10, ability: null, criticalChance: 0 };
    const morale = world.c.morale[b];
    const result = damage.apply(world, attack);
    expect(world.c.hp[b]).toBeCloseTo(120 - result.damage, 3);
    expect(world.c.morale[b]).toBeLessThan(morale);
    expect(world.c.vx[b]).toBeGreaterThan(0);
    expect(world.c.lastHit[b]).toBe(0);
    damage.apply(world, { ...attack, damage: 5000 });
    expect(world.c.state[b]).toBe(UnitState.Dying);
    expect(deaths).toEqual([b]);
  });
});

function battleWorld(seed = 4) {
  const world = new World({ seed });
  const { simulation, formations } = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * world.time.hz; i++) simulation.step(world.time.dt);
  };
  return { world, formations, run };
}

describe('combat and morale', () => {
  it('routs a soldier cut off among enemies, who flees then rallies once safe', () => {
    const { world, run } = battleWorld();
    const lone = spawnUnit(world, SWORD, 0, 60, 60);
    const foes = spawnBlock(world, SWORD, 1, 8, 4, 60, 62.5, Math.PI, 1.3);
    const routed: number[] = [];
    world.events.on('unitRouted', (e) => routed.push(e.id));
    run(25);
    expect(routed).toContain(lone);
    // Remove the enemies: the fugitive recovers.
    for (const f of foes) world.c.state[f] = UnitState.Dying;
    if (world.c.state[lone] !== UnitState.Dying) {
      world.c.morale[lone] = Math.max(world.c.morale[lone], 30);
      run(30);
      expect([MoraleState.Normal, MoraleState.Shaken, MoraleState.Recovering]).toContain(world.c.moraleState[lone]);
    }
  });

  it('holding troops strike within reach but do not chase', () => {
    const { world, run } = battleWorld();
    const guard = spawnUnit(world, SWORD, 0, 40, 40);
    spawnUnit(world, SWORD, 1, 45, 40);
    world.commands.push({ kind: 'hold', team: 0, units: [guard] });
    run(5);
    expect(world.c.order[guard]).toBe(Order.Hold);
    expect(Math.hypot(world.c.x[guard] - 40, world.c.z[guard] - 40)).toBeLessThan(1.2);
  });

  it('fights the 20 vs 20 prototype battle to a decision and clears the corpses', () => {
    const { world, run } = battleWorld(11);
    const { player, enemy } = setupPrototypeBattle(world, 128);
    const outcome = new BattleOutcome(0);
    const deaths: number[] = [];
    world.events.on('unitDied', (e) => deaths.push(e.id));
    world.commands.push({ kind: 'formationMove', team: 0, units: player.units, x: 64, z: 16, facing: null, width: null, formation: 'LINE', attackMove: true });
    world.commands.push({ kind: 'formationMove', team: 1, units: enemy.units, x: 64, z: 112, facing: null, width: null, formation: 'LINE', attackMove: true });
    let seconds = 0;
    while (!outcome.update(world) && seconds < 240) {
      run(1);
      seconds++;
    }
    expect(outcome.result).not.toBeNull();
    expect(deaths.length).toBeGreaterThan(10);
    run(CORPSE_SECONDS + 1);
    for (const id of deaths) expect(world.entities.isAlive(id)).toBe(false);
  });

  it('is fair: the army created first (lower entity ids) has no systematic edge', () => {
    // Regression test: in-place movement and sequential blows once made one side win ~90 % of mirror battles.
    let firstWins = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const world = new World({ seed });
      const { simulation } = createBattleSimulation(world);
      const spear = unitIndex('human_spearman');
      const a = [...spawnBlock(world, SWORD, 0, 10, 10, 64, 116, Math.PI), ...spawnBlock(world, spear, 0, 10, 10, 64, 119, Math.PI)];
      const b = [...spawnBlock(world, SWORD, 1, 10, 10, 64, 12, 0), ...spawnBlock(world, spear, 1, 10, 10, 64, 9, 0)];
      const outcome = new BattleOutcome(0);
      world.commands.push({ kind: 'formationMove', team: 0, units: a, x: 64, z: 16, facing: null, width: null, formation: 'LINE', attackMove: true });
      world.commands.push({ kind: 'formationMove', team: 1, units: b, x: 64, z: 112, facing: null, width: null, formation: 'LINE', attackMove: true });
      for (let t = 0; t < 240 * 30 && !outcome.update(world); t++) simulation.step(world.time.dt);
      if (outcome.result === 'victory') firstWins++;
    }
    expect(firstWins).toBeGreaterThanOrEqual(3);
    expect(firstWins).toBeLessThanOrEqual(9);
  });

  it('balances the Human Alliance against the orcs of the Dark Legion (each side wins some battles)', () => {
    // Measured over 40 seeds when tuned: humans 17 / orcs 23. Guards against a one-sided roster change.
    let humans = 0;
    const seeds = 12;
    for (let seed = 1; seed <= seeds; seed++) {
      const world = new World({ seed });
      const { simulation } = createBattleSimulation(world);
      const { player, enemy } = setupPrototypeBattle(world, 128);
      const outcome = new BattleOutcome(0);
      world.commands.push({ kind: 'formationMove', team: 0, units: player.units, x: 64, z: 16, facing: null, width: null, formation: 'LINE', attackMove: true });
      world.commands.push({ kind: 'formationMove', team: 1, units: enemy.units, x: 64, z: 112, facing: null, width: null, formation: 'LINE', attackMove: true });
      for (let t = 0; t < 240 * 30 && !outcome.update(world); t++) simulation.step(world.time.dt);
      if (outcome.result === 'victory') humans++;
    }
    expect(humans).toBeGreaterThanOrEqual(2);
    expect(humans).toBeLessThanOrEqual(seeds - 2);
  });

  it('replays identically from the same seed and orders', () => {
    const play = () => {
      const { world, run } = battleWorld(21);
      const { player, enemy } = setupPrototypeBattle(world, 128);
      world.commands.push({ kind: 'formationMove', team: 0, units: player.units, x: 64, z: 40, facing: null, width: null, formation: 'WEDGE', attackMove: true });
      world.commands.push({ kind: 'attack', team: 1, units: enemy.units, target: player.units[0] });
      run(40);
      return [...world.c.hp.subarray(0, 40), ...world.c.x.subarray(0, 40)];
    };
    expect(play()).toEqual(play());
  });
});

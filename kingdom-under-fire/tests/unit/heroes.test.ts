import { describe, expect, it } from 'vitest';
import { chooseCast } from '../../src/ai/HeroAI';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { ABILITIES } from '../../src/data/abilities';
import { UNIT_DEFS, unitIndex } from '../../src/data/units';
import { Order, UnitState } from '../../src/entities/Components';
import { xpForLevel } from '../../src/heroes/HeroSystem';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

const CURIAN = unitIndex('hero_curian');
const LIKUKU = unitIndex('hero_likuku');
const FOOTMAN = unitIndex('human_footman');
const ORC = unitIndex('orc_warrior');

function battle(seed = 3) {
  const world = new World({ seed });
  const sim = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < Math.round(seconds * world.time.hz); i++) sim.simulation.step(world.time.dt);
  };
  return { world, run, heroes: sim.heroes };
}

const hp = (world: World, ids: number[]) => ids.reduce((sum, id) => sum + Math.max(0, world.c.hp[id]), 0);

describe('hero data', () => {
  it('gives every hero four known abilities and uses every ability', () => {
    const used = new Set<string>();
    for (const def of UNIT_DEFS.filter((d) => d.role === 'hero')) {
      expect(def.hero?.abilities).toHaveLength(4);
      for (const id of def.hero!.abilities) {
        expect(ABILITIES.some((a) => a.id === id)).toBe(true);
        used.add(id);
      }
    }
    expect(used.size).toBe(ABILITIES.length);
  });

  it('needs more experience for each level', () => {
    expect(xpForLevel(1)).toBe(0);
    for (let l = 2; l <= 10; l++) expect(xpForLevel(l) - xpForLevel(l - 1)).toBeGreaterThan(xpForLevel(l - 1) - xpForLevel(Math.max(1, l - 2)));
  });
});

describe('abilities', () => {
  it('Gel freezes and wounds a group after its cast time, costs mana and goes on cooldown', () => {
    const { world, run, heroes } = battle();
    const curian = spawnUnit(world, CURIAN, 0, 40, 60, Math.PI / 2);
    const orcs = spawnBlock(world, ORC, 1, 6, 3, 58, 60, -Math.PI / 2);
    world.commands.push({ kind: 'hold', team: 0, units: [curian] });
    world.commands.push({ kind: 'hold', team: 1, units: orcs });
    run(0.1);
    const h = heroes.get(curian)!;
    const mana = h.mana;
    world.commands.push({ kind: 'cast', team: 0, hero: curian, slot: 1, x: 58, z: 60 });
    run(0.2);
    expect(h.mana).toBeLessThan(mana - 30);
    expect(h.cooldowns[1]).toBeGreaterThan(10);
    expect(orcs.every((o) => world.c.stun[o] === 0)).toBe(true);
    run(0.6);
    const frozen = orcs.filter((o) => world.c.stun[o] > 0);
    expect(frozen.length).toBeGreaterThanOrEqual(5);
    expect(hp(world, orcs)).toBeLessThan(orcs.length * world.c.maxHp[orcs[0]]);
    // A second cast while on cooldown does nothing.
    const before = h.mana;
    world.commands.push({ kind: 'cast', team: 0, hero: curian, slot: 1, x: 58, z: 60 });
    run(0.1);
    expect(h.mana).toBeGreaterThanOrEqual(before);
    expect(heroes.blocked(world, h, 1)).toBe('cooldown');
  });

  it('frozen soldiers neither move nor strike', () => {
    const { world, run } = battle(4);
    const orc = spawnUnit(world, ORC, 1, 50, 50, 0);
    const man = spawnUnit(world, FOOTMAN, 0, 51.2, 50, -Math.PI / 2);
    world.commands.push({ kind: 'hold', team: 0, units: [man] });
    world.c.stun[orc] = 3;
    let orcBlows = 0;
    world.events.on('unitHit', ({ attack }) => {
      if (attack.attacker === orc) orcBlows++;
    });
    run(2.5);
    expect(orcBlows).toBe(0);
    run(3);
    expect(orcBlows).toBeGreaterThan(0);
  });

  it('Salve d’énergie bursts over several enemies; Déplacement carries Curian through a line', () => {
    const { world, run, heroes } = battle(5);
    const curian = spawnUnit(world, CURIAN, 0, 30, 60, Math.PI / 2);
    const orcs = spawnBlock(world, ORC, 1, 9, 3, 55, 60, -Math.PI / 2, 1.4);
    world.commands.push({ kind: 'hold', team: 0, units: [curian] });
    world.commands.push({ kind: 'hold', team: 1, units: orcs });
    const victims = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.ability === 'curian_energy') victims.add(attack.target);
    });
    world.commands.push({ kind: 'cast', team: 0, hero: curian, slot: 2, x: 55, z: 60 });
    run(2.5);
    expect(victims.size).toBeGreaterThanOrEqual(4);

    heroes.get(curian)!.mana = 100;
    const dashed = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.ability === 'curian_shift') dashed.add(attack.target);
    });
    world.commands.push({ kind: 'cast', team: 0, hero: curian, slot: 0, x: 60, z: 60 });
    run(0.5);
    // Range 14 m: from x = 30 towards x = 60 it stops at x ≈ 44, short of the orcs at 53.6–56.4.
    expect(world.c.x[curian]).toBeGreaterThan(42);
    expect(world.c.x[curian]).toBeLessThan(46);
    heroes.get(curian)!.mana = 100;
    heroes.get(curian)!.cooldowns[0] = 0;
    world.commands.push({ kind: 'cast', team: 0, hero: curian, slot: 0, x: 58, z: 60 });
    run(0.5);
    expect(world.c.x[curian]).toBeGreaterThan(56);
    expect(dashed.size).toBeGreaterThanOrEqual(2);
  });

  it('Séisme throws back and stuns everything around Likuku', () => {
    const { world, run } = battle(6);
    const likuku = spawnUnit(world, LIKUKU, 1, 64, 64, 0);
    const men: number[] = [];
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      men.push(spawnUnit(world, FOOTMAN, 0, 64 + Math.sin(a) * 3, 64 + Math.cos(a) * 3, a + Math.PI));
    }
    world.commands.push({ kind: 'hold', team: 0, units: men });
    world.commands.push({ kind: 'cast', team: 1, hero: likuku, slot: 0, x: 0, z: 0 });
    // Distance of each man from Likuku when the ground shakes, then once they have landed.
    const away = () => men.map((m) => Math.hypot(world.c.x[m] - world.c.x[likuku], world.c.z[m] - world.c.z[likuku]));
    let before: number[] = [];
    world.events.on('abilityCast', () => (before = away()));
    run(0.8);
    expect(before).toHaveLength(8);
    expect(men.filter((m) => world.c.stun[m] > 0)).toHaveLength(8);
    run(1);
    const after = away();
    expect(men.filter((_, k) => after[k] - before[k] > 0.8).length).toBeGreaterThanOrEqual(6);
  });

  it('Rage sanguinaire makes the horde hit harder and faster for 12 s; Cri de guerre shakes the enemy', () => {
    const { world, run } = battle(7);
    const likuku = spawnUnit(world, LIKUKU, 1, 64, 64, 0);
    const orcs = spawnBlock(world, ORC, 1, 6, 3, 64, 58, 0);
    const far = spawnUnit(world, ORC, 1, 64, 90, 0);
    const men = spawnBlock(world, FOOTMAN, 0, 6, 3, 64, 76, Math.PI);
    world.commands.push({ kind: 'hold', team: 0, units: men });
    world.commands.push({ kind: 'hold', team: 1, units: [...orcs, far, likuku] });
    world.commands.push({ kind: 'cast', team: 1, hero: likuku, slot: 1, x: 0, z: 0 });
    run(0.5);
    for (const o of orcs) expect(world.c.damageMul[o]).toBeCloseTo(1.3);
    expect(world.c.hasteMul[orcs[0]]).toBeCloseTo(1.3);
    expect(world.c.damageMul[far]).toBe(1);
    run(12);
    expect(world.c.damageMul[orcs[0]]).toBe(1);

    const morale = men.map((m) => world.c.morale[m]);
    world.commands.push({ kind: 'cast', team: 1, hero: likuku, slot: 2, x: 0, z: 0 });
    run(0.7);
    const lost = men.map((m, k) => morale[k] - world.c.morale[m]);
    expect(Math.min(...lost)).toBeGreaterThan(5);
  });
});

describe('experience and aura', () => {
  it('levels a hero up through its kills and makes it stronger', () => {
    const { world, run, heroes } = battle(8);
    const curian = spawnUnit(world, CURIAN, 0, 60, 60, Math.PI / 2);
    const h = () => heroes.get(curian)!;
    run(0.1);
    const attack = world.c.attack[curian];
    const maxHp = world.c.maxHp[curian];
    let levels = 0;
    world.events.on('heroLevelUp', () => levels++);
    for (let k = 0; k < 12; k++) {
      const orc = spawnUnit(world, ORC, 1, 61.3, 60, -Math.PI / 2);
      world.c.hp[orc] = 5;
      run(3);
    }
    expect(levels).toBeGreaterThanOrEqual(2);
    expect(h().level).toBe(1 + levels);
    expect(world.c.attack[curian]).toBeGreaterThan(attack);
    expect(world.c.maxHp[curian]).toBeGreaterThan(maxHp);
  });

  it('steadies the soldiers around the hero and breaks them when he falls', () => {
    const moraleNear = (withHero: boolean) => {
      const { world, run } = battle(9);
      const men = spawnBlock(world, FOOTMAN, 0, 6, 3, 64, 64, 0);
      if (withHero) spawnUnit(world, CURIAN, 0, 64, 61, 0);
      const orcs = spawnBlock(world, ORC, 1, 14, 7, 64, 70, Math.PI);
      world.commands.push({ kind: 'hold', team: 0, units: men });
      world.commands.push({ kind: 'hold', team: 1, units: orcs });
      for (const o of orcs) world.c.attack[o] = 0;
      run(6);
      return men.reduce((s, m) => s + world.c.morale[m], 0) / men.length;
    };
    expect(moraleNear(true)).toBeGreaterThan(moraleNear(false) + 5);

    const { world, run } = battle(10);
    const men = spawnBlock(world, FOOTMAN, 0, 6, 3, 64, 64, 0);
    const curian = spawnUnit(world, CURIAN, 0, 64, 61, 0);
    run(0.5);
    const before = men.map((m) => world.c.morale[m]);
    world.c.hp[curian] = 1;
    const orc = spawnUnit(world, ORC, 1, 64, 59.8, 0);
    world.c.attack[orc] = 500;
    run(3);
    expect(world.c.state[curian]).toBe(UnitState.Dying);
    const drop = men.map((m, k) => before[k] - world.c.morale[m]);
    expect(Math.min(...drop)).toBeGreaterThan(8);
  });
});

describe('direct control', () => {
  it('steers the hero, strikes in an arc, dodges, and gives it back to the army', () => {
    const { world, run, heroes } = battle(11);
    const curian = spawnUnit(world, CURIAN, 0, 40, 40, 0);
    const guards = spawnBlock(world, FOOTMAN, 0, 4, 4, 40, 36, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: [curian, ...guards], x: 40, z: 38, facing: 0, width: null, formation: 'LINE', attackMove: false });
    run(1);
    world.commands.push({ kind: 'heroControl', team: 0, hero: curian, direct: true });
    run(0.1);
    expect(heroes.get(curian)!.direct).toBe(true);
    expect(world.c.order[curian]).toBe(Order.Direct);
    expect(world.c.formation[curian]).toBe(-1);

    // Walk east for 2 s.
    const x0 = world.c.x[curian];
    for (let t = 0; t < 60; t++) {
      world.commands.push({ kind: 'heroSteer', team: 0, hero: curian, x: 1, z: 0, aim: Math.PI / 2 });
      run(1 / 30);
    }
    expect(world.c.x[curian] - x0).toBeGreaterThan(5);

    // Three orcs in front (east), one behind: a free blow hits those in front only.
    world.commands.push({ kind: 'heroSteer', team: 0, hero: curian, x: 0, z: 0, aim: Math.PI / 2 });
    run(0.5);
    const cx = world.c.x[curian];
    const cz = world.c.z[curian];
    const front = [spawnUnit(world, ORC, 1, cx + 1.4, cz, -Math.PI / 2), spawnUnit(world, ORC, 1, cx + 1.2, cz + 0.9, -Math.PI / 2), spawnUnit(world, ORC, 1, cx + 1.2, cz - 0.9, -Math.PI / 2)];
    const back = spawnUnit(world, ORC, 1, cx - 1.4, cz, Math.PI / 2);
    for (const o of [...front, back]) world.c.attack[o] = 0;
    const struck = new Set<number>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.attacker === curian) struck.add(attack.target);
    });
    world.commands.push({ kind: 'heroStrike', team: 0, hero: curian, heavy: false });
    run(1);
    expect(front.filter((o) => struck.has(o)).length).toBeGreaterThanOrEqual(2);
    expect(struck.has(back)).toBe(false);

    // Dodge roll north: fast and untouchable for a moment.
    const z0 = world.c.z[curian];
    world.commands.push({ kind: 'heroDodge', team: 0, hero: curian, x: 0, z: 1 });
    run(0.1);
    expect(world.c.invulnerable[curian]).toBeGreaterThan(0);
    run(0.4);
    expect(world.c.z[curian] - z0).toBeGreaterThan(2);

    world.commands.push({ kind: 'heroControl', team: 0, hero: curian, direct: false });
    run(0.1);
    expect(heroes.get(curian)!.direct).toBe(false);
    expect(world.c.order[curian]).toBe(Order.Defend);
  });

  it('a stun interrupts a spell being cast', () => {
    const { world, run, heroes } = battle(12);
    const likuku = spawnUnit(world, LIKUKU, 1, 64, 64, 0);
    const man = spawnUnit(world, FOOTMAN, 0, 66, 64, 0);
    world.commands.push({ kind: 'cast', team: 1, hero: likuku, slot: 0, x: 0, z: 0 });
    run(0.2);
    expect(heroes.get(likuku)!.casting).not.toBeNull();
    world.c.stun[likuku] = 1;
    let quakes = 0;
    world.events.on('abilityCast', () => quakes++);
    run(1);
    expect(quakes).toBe(0);
    expect(heroes.get(likuku)!.casting).toBeNull();
    expect(world.c.stun[man]).toBe(0);
  });
});

describe('hero AI', () => {
  it('casts on the densest enemy group it can see, and not on a lone soldier', () => {
    const { world, run, heroes } = battle(13);
    const likuku = spawnUnit(world, LIKUKU, 1, 64, 40, 0);
    spawnUnit(world, FOOTMAN, 0, 50, 60, 0);
    run(0.1);
    const h = heroes.get(likuku)!;
    expect(chooseCast(world, heroes, h)).toBeNull();
    const block = spawnBlock(world, FOOTMAN, 0, 12, 4, 70, 60, Math.PI);
    world.commands.push({ kind: 'hold', team: 0, units: block });
    run(0.1);
    const cast = chooseCast(world, heroes, h)!;
    expect(cast).not.toBeNull();
    // The boulder (slot 3) at the block, 20 m away: out of reach of the self-centred abilities.
    expect(cast.slot).toBe(3);
    expect(Math.hypot(cast.x - 70, cast.z - 60)).toBeLessThan(3);
  });
});

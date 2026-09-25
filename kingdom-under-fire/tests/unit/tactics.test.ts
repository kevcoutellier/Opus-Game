import { describe, expect, it } from 'vitest';
import { ChargeState } from '../../src/combat/ChargeSystem';
import { DamageSystem, Flank, FLANK_DAMAGE, flankOf, type Attack } from '../../src/combat/DamageSystem';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { unitIndex } from '../../src/data/units';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

const FOOTMAN = unitIndex('human_footman');
const SPEARMAN = unitIndex('human_spearman');
const KNIGHT = unitIndex('human_knight');
const OGRE = unitIndex('ogre');
const ORC = unitIndex('orc_warrior');

function battle(seed = 3) {
  const world = new World({ seed });
  const { simulation } = createBattleSimulation(world);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * world.time.hz; i++) simulation.step(world.time.dt);
  };
  return { world, run };
}

const blow = (attacker: number, target: number, x: number, z: number, missile = false): Attack => ({
  attacker,
  target,
  damage: 20,
  damageType: 'SLASH',
  timestamp: 0,
  x,
  z,
  ability: null,
  missile,
  criticalChance: 0,
});

describe('flanks', () => {
  it('tells front, side and rear apart', () => {
    // Facing +z (rot 0).
    expect(flankOf(0, 0, 0, 0, 5)).toBe(Flank.Front);
    expect(flankOf(0, 0, 0, 4, 1)).toBe(Flank.Side);
    expect(flankOf(0, 0, 0, -4, 0)).toBe(Flank.Side);
    expect(flankOf(0, 0, 0, 1, -5)).toBe(Flank.Rear);
    // Facing +x (rot π/2).
    expect(flankOf(Math.PI / 2, 10, 10, 15, 10)).toBe(Flank.Front);
    expect(flankOf(Math.PI / 2, 10, 10, 5, 10)).toBe(Flank.Rear);
  });

  it('hurts and shakes more in the back than in the face; shields stop frontal arrows only', () => {
    const average = (from: 'front' | 'rear', missile: boolean) => {
      let damage = 0;
      let shock = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const world = new World({ seed });
        const victim = spawnUnit(world, FOOTMAN, 1, 50, 50, 0);
        const morale = world.c.morale[victim];
        const z = from === 'front' ? 51 : 49;
        damage += new DamageSystem().apply(world, blow(-1, victim, 50, z, missile)).damage;
        shock += morale - world.c.morale[victim];
      }
      return { damage: damage / 200, shock: shock / 200 };
    };
    const front = average('front', false);
    const rear = average('rear', false);
    expect(rear.damage / front.damage).toBeCloseTo(FLANK_DAMAGE[Flank.Rear], 1);
    expect(rear.shock).toBeGreaterThan(front.shock * 3);
    // The footman's heater shield stops half the arrows coming from the front, none from behind.
    const arrowFront = average('front', true);
    const arrowRear = average('rear', true);
    expect(arrowFront.damage / front.damage).toBeCloseTo(0.5, 1);
    expect(arrowRear.damage / rear.damage).toBeCloseTo(1, 1);
  });
});

describe('sweeping blows', () => {
  it('lets an ogre hit several soldiers of a packed line with one swing', () => {
    const { world, run } = battle(8);
    const ogre = spawnUnit(world, OGRE, 1, 60, 58, 0);
    spawnBlock(world, FOOTMAN, 0, 5, 5, 60, 60.2, Math.PI, 1.1);
    const victimsPerSwing = new Map<number, Set<number>>();
    world.events.on('unitHit', ({ attack }) => {
      if (attack.attacker !== ogre) return;
      const key = Math.round(attack.timestamp * 30);
      if (!victimsPerSwing.has(key)) victimsPerSwing.set(key, new Set());
      victimsPerSwing.get(key)!.add(attack.target);
    });
    run(8);
    const most = Math.max(0, ...[...victimsPerSwing.values()].map((s) => s.size));
    expect(most).toBeGreaterThanOrEqual(2);
    expect(most).toBeLessThanOrEqual(1 + world.c.cleave[ogre]);
  });
});

describe('cavalry charge', () => {
  it('gathers, gallops, strikes hard and recovers', () => {
    const { world, run } = battle(4);
    const knight = spawnUnit(world, KNIGHT, 0, 30, 64, Math.PI / 2);
    const orc = spawnUnit(world, ORC, 1, 60, 64, -Math.PI / 2);
    world.commands.push({ kind: 'hold', team: 1, units: [orc] });
    world.commands.push({ kind: 'attack', team: 0, units: [knight], target: orc });
    const states = new Set<number>();
    let topSpeed = 0;
    let impact: { damage: number } | null = null;
    world.events.on('unitHit', ({ attack, damage }) => {
      if (attack.ability === 'charge' && !impact) impact = { damage };
    });
    for (let t = 0; t < 15 * 30; t++) {
      run(1 / 30);
      states.add(world.c.chargeState[knight]);
      topSpeed = Math.max(topSpeed, Math.hypot(world.c.vx[knight], world.c.vz[knight]));
    }
    for (const s of [ChargeState.Prepare, ChargeState.Accelerate, ChargeState.Charge, ChargeState.Impact, ChargeState.Disengage, ChargeState.Recover]) {
      expect(states.has(s)).toBe(true);
    }
    expect(topSpeed).toBeGreaterThan(world.c.maxSpeed[knight] * 1.3);
    expect(impact).not.toBeNull();
    // The lance at full gallop hits far harder than a normal blow.
    expect(impact!.damage).toBeGreaterThan(world.c.attack[knight] * 1.3);
  });

  it('breaks on spears set against it but crushes footmen caught in the flank', () => {
    const charge = (victimType: number, facing: number) => {
      const { world, run } = battle(5);
      const knights = spawnBlock(world, KNIGHT, 0, 6, 6, 30, 64, Math.PI / 2, 2.2);
      const line = spawnBlock(world, victimType, 1, 12, 6, 62, 64, facing, 1.2);
      world.commands.push({ kind: 'hold', team: 1, units: line });
      world.commands.push({ kind: 'attack', team: 0, units: knights, target: line[3] });
      let dealt = 0;
      let hits = 0;
      let taken = 0;
      let impacts = 0;
      world.events.on('chargeImpact', () => impacts++);
      world.events.on('unitHit', ({ attack, damage }) => {
        if (attack.ability === 'charge') {
          dealt += damage;
          hits++;
        }
        if (attack.ability === 'brace') taken += damage;
      });
      run(12);
      return { perHit: dealt / Math.max(1, hits), taken, impacts };
    };
    // Spearmen facing the knights (−x) brace; footmen facing away (+x) are hit in the back.
    const spears = charge(SPEARMAN, -Math.PI / 2);
    const backs = charge(FOOTMAN, Math.PI / 2);
    expect(spears.impacts).toBeGreaterThan(0);
    expect(backs.impacts).toBeGreaterThan(0);
    expect(spears.taken).toBeGreaterThan(0);
    expect(backs.taken).toBe(0);
    // Each soldier struck by the lance: braced spears absorb most of it, backs take it in full and more.
    expect(backs.perHit).toBeGreaterThan(spears.perHit * 2);
  });
});

describe('encirclement', () => {
  it('breaks a surrounded soldier faster than one facing the same enemies in front', () => {
    const moraleAfter = (surrounded: boolean) => {
      const { world, run } = battle(6);
      const soldier = spawnUnit(world, FOOTMAN, 0, 64, 64, 0);
      world.commands.push({ kind: 'hold', team: 0, units: [soldier] });
      const enemies: number[] = [];
      for (let k = 0; k < 6; k++) {
        const a = surrounded ? (k / 6) * Math.PI * 2 : -0.5 + (k / 5) * 1;
        enemies.push(spawnUnit(world, ORC, 1, 64 + Math.sin(a) * 5, 64 + Math.cos(a) * 5, a + Math.PI));
      }
      // The enemies only stand there: no blow, only the pressure of their presence.
      world.commands.push({ kind: 'hold', team: 1, units: enemies });
      for (const e of enemies) world.c.attack[e] = 0;
      run(3);
      return world.c.morale[soldier];
    };
    expect(moraleAfter(true)).toBeLessThan(moraleAfter(false) - 3);
  });
});

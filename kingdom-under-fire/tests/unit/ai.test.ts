import { describe, expect, it } from 'vitest';
import { AIController } from '../../src/ai/AIController';
import { AIKnowledge } from '../../src/ai/AIKnowledge';
import { planTactics } from '../../src/ai/TacticalAI';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { UnitState } from '../../src/entities/Components';
import { BattleOutcome } from '../../src/scenes/BattleOutcome';
import { setupPrototypeBattle } from '../../src/scenes/BattleScene';
import { spawnUnit } from '../../src/units/UnitFactory';

describe('AIKnowledge', () => {
  it('only knows enemies inside the sight of its own soldiers and remembers where they were', () => {
    const world = new World({ seed: 1 });
    const watcher = spawnUnit(world, 0, 1, 20, 20);
    const scout = spawnUnit(world, 0, 0, 100, 100);
    const k = new AIKnowledge(world, 1);
    k.update();
    expect(k.enemies.size).toBe(0);
    world.c.x[scout] = 40;
    world.c.z[scout] = 30;
    k.update();
    expect(k.enemies.get(scout)?.visible).toBe(true);
    // Both move apart: the spot leaves the AI's sight, the AI keeps the last known position.
    world.c.x[scout] = 110;
    world.c.z[scout] = 110;
    world.c.z[watcher] = 100;
    k.update();
    expect(k.enemies.get(scout)).toMatchObject({ x: 40, z: 30, visible: false });
  });

  it('forgets a sighting disproved by looking at the spot, and dead enemies', () => {
    const world = new World({ seed: 1 });
    const watcher = spawnUnit(world, 0, 1, 20, 20);
    const enemy = spawnUnit(world, 0, 0, 30, 20);
    const k = new AIKnowledge(world, 1);
    k.update();
    expect(k.enemies.has(enemy)).toBe(true);
    world.c.state[enemy] = UnitState.Dying;
    k.update();
    expect(k.enemies.has(enemy)).toBe(false);
    // A remembered position that comes back into sight while empty is dropped.
    const ghost = spawnUnit(world, 0, 0, 60, 20);
    world.c.x[watcher] = 50;
    k.update();
    expect(k.enemies.has(ghost)).toBe(true);
    world.c.x[ghost] = 120;
    world.c.x[watcher] = 20;
    k.update();
    world.c.x[watcher] = 55;
    k.update();
    expect(k.enemies.has(ghost)).toBe(false);
  });
});

describe('TacticalAI', () => {
  it('holds, then advances towards the expected enemy, and engages known enemies', () => {
    const world = new World({ seed: 1 });
    const k = new AIKnowledge(world, 1);
    const options = { objectiveX: 64, objectiveZ: 110, advanceDelay: 10 };
    expect(planTactics(world, k, 64, 20, options).kind).toBe('hold');
    world.time.elapsed = 11;
    expect(planTactics(world, k, 64, 20, options)).toEqual({ kind: 'advance', x: 64, z: 110 });
    k.enemies.set(5, { x: 70, z: 60, seen: 11, visible: true });
    k.enemies.set(6, { x: 74, z: 62, seen: 11, visible: true });
    k.enemies.set(7, { x: 120, z: 120, seen: 11, visible: false });
    expect(planTactics(world, k, 64, 20, options)).toEqual({ kind: 'engage', x: 72, z: 61 });
  });
});

describe('AIController', () => {
  it('finds and attacks a passive player army, and the battle is decided', () => {
    const world = new World({ seed: 5 });
    const setup = setupPrototypeBattle(world, 128);
    const ai = new AIController(world, { ...setup.ai, advanceDelay: 5 });
    const { simulation } = createBattleSimulation(world, [ai]);
    const outcome = new BattleOutcome(0);
    let engaged = false;
    for (let t = 0; t < 240 * 30 && !outcome.update(world); t++) {
      simulation.step(world.time.dt);
      if (ai.plan?.kind === 'engage') engaged = true;
    }
    expect(engaged).toBe(true);
    expect(outcome.result).not.toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { AIController } from '../../src/ai/AIController';
import { StrategicAI } from '../../src/ai/StrategicAI';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { RESOURCE_TYPES } from '../../src/economy/Resources';
import { Terrain } from '../../src/maps/Terrain';
import { BattleOutcome } from '../../src/scenes/BattleOutcome';
import { BASE_SITES, ENEMY_TEAM, PLAYER_TEAM, setupBaseBattle } from '../../src/scenes/BattleScene';

const terrain = Terrain.generate({ size: 256, seed: 20260925, sites: BASE_SITES });

function baseBattle(firstWave: number) {
  const world = new World({ seed: 4, terrain });
  const setup0 = { team: ENEMY_TEAM, objectiveX: 128, objectiveZ: 212, advanceDelay: 0 };
  const ai = new AIController(world, setup0);
  const sim = createBattleSimulation(world, [ai]);
  const setup = setupBaseBattle(world, sim.buildings);
  ai.heroes = sim.heroes;
  ai.strategy = new StrategicAI(sim.buildings, { ...setup.strategy, firstWave });
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * world.time.hz; i++) sim.simulation.step(world.time.dt);
  };
  return { world, run, sim, setup, ai, strategy: ai.strategy };
}

describe('battle with bases', () => {
  it('stands both bases on level, walkable ground', () => {
    const { world, sim, setup } = baseBattle(99);
    for (const team of [PLAYER_TEAM, ENEMY_TEAM]) {
      const list = sim.buildings.list(team);
      expect(list.length).toBe(4);
      expect(list.every((b) => b.complete && b.cells.length > 0)).toBe(true);
      expect(sim.buildings.hasHeadquarters(team)).toBe(true);
    }
    // Buildings block the ground under them; every soldier stands on free ground.
    for (const id of world.buildings) expect(world.nav.isBlockedAt(world.c.x[id], world.c.z[id])).toBe(true);
    for (const id of [...setup.player.units, ...setup.enemy.units]) expect(world.nav.isBlockedAt(world.c.x[id], world.c.z[id])).toBe(false);
  });

  it('the AI builds up its base, keeps its barracks busy and never goes into debt', () => {
    const { world, run, sim } = baseBattle(99);
    let trained = 0;
    world.events.on('unitTrained', ({ id }) => {
      if (world.c.team[id] === ENEMY_TEAM) trained++;
    });
    for (let minute = 0; minute < 4; minute++) {
      run(60);
      for (const type of RESOURCE_TYPES) expect(world.resources.get(ENEMY_TEAM, type)).toBeGreaterThanOrEqual(0);
    }
    const kinds = new Set(sim.buildings.list(ENEMY_TEAM).map((b) => b.def.kind));
    expect(sim.buildings.list(ENEMY_TEAM).length).toBeGreaterThanOrEqual(8);
    for (const kind of ['archery', 'stable', 'temple'] as const) expect(kinds.has(kind)).toBe(true);
    expect(trained).toBeGreaterThanOrEqual(12);
  });

  it('sends a wave on the player’s base once its garrison is big enough, and the keep can fall', () => {
    // The player does nothing: his company only defends itself where it stands.
    const { world, run, sim, strategy } = baseBattle(22);
    const outcome = new BattleOutcome(PLAYER_TEAM, (team) => sim.buildings.hasHeadquarters(team));
    let marched = false;
    for (let s = 0; s < 9 * 60 && !outcome.update(world); s += 5) {
      run(5);
      if (strategy.mode === 'attack') marched = true;
    }
    expect(marched).toBe(true);
    expect(outcome.result).toBe('defeat');
  }, 60_000);
});

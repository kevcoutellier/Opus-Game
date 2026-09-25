import { it } from 'vitest';
import { AIController } from '../../src/ai/AIController';
import { createBattleSimulation } from '../../src/core/SimulationFactory';
import { World } from '../../src/core/World';
import { PerformanceMonitor } from '../../src/debug/PerformanceMonitor';
import { Terrain } from '../../src/maps/Terrain';
import { PerformanceTestScene } from '../../src/scenes/PerformanceTestScene';

/**
 * CPU cost of one simulation tick in a mass battle of combined arms (infantry, spearmen, archers, cavalry)
 * on the real 256 m battlefield (the 30 Hz budget is 33 ms; to keep 60 FPS the whole frame has 16.7 ms).
 * Run with `npm run bench`.
 */
it('simulation tick cost from 100 to 1000 units', () => {
  const terrain = Terrain.generate({ size: 256, seed: 20260925 });
  const rows: string[] = [];
  const systems = ['spatial', 'formations', 'combat', 'projectiles', 'charge', 'morale', 'movement', 'ai', 'lifecycle'];
  rows.push(`| Unités | tick moyen | p95 | max | ${systems.join(' | ')} | pathfinding |`);
  rows.push(`|${' --- |'.repeat(5 + systems.length)}`);
  for (const units of [100, 200, 300, 500, 1000]) {
    const perf = new PerformanceMonitor(0.02);
    const world = new World({ seed: units, terrain, perf });
    const ai = new AIController(world, { team: 1, objectiveX: 128, objectiveZ: 170, advanceDelay: 0 });
    ai.enabled = false;
    const { simulation } = createBattleSimulation(world, [ai], perf);
    PerformanceTestScene.deploy(world, units);
    // March until the lines are locked in melee, then measure 20 s of battle.
    for (let i = 0; i < 20 * 30; i++) simulation.step(world.time.dt);
    perf.reset();
    const samples: number[] = [];
    for (let i = 0; i < 20 * 30; i++) {
      const start = performance.now();
      simulation.step(world.time.dt);
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const mean = samples.reduce((s, v) => s + v, 0) / samples.length;
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const max = samples[samples.length - 1];
    const f = (v: number) => `${v.toFixed(3)} ms`;
    rows.push(`| ${units} | ${f(mean)} | ${f(p95)} | ${f(max)} | ${systems.map((s) => f(perf.average(`sim.${s}`))).join(' | ')} | ${f(perf.average('pathfinding'))} |`);
  }
  console.log(`\nCoût CPU d'un tick de simulation (${new Date().toISOString().slice(0, 10)})\n\n${rows.join('\n')}\n`);
});

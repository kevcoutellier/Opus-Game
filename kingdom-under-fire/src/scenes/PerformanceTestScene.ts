import type { World } from '../core/World';
import { unitIndex } from '../data/units';
import { Comp } from '../entities/Components';
import { spawnBlock } from '../units/UnitFactory';

/** Unit counts cycled by F2 (any count, e.g. 50, can be deployed with the `#perf=N` URL). */
export const PERF_STEPS = [100, 200, 300, 500, 1000] as const;
/** Seconds of measurement per step (after 2 s of warm-up). */
const WARMUP = 2;
const MEASURE = 8;

export interface PerfResult {
  units: number;
  fps: number;
  frameMs: number;
  simMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
}

export interface PerfSample {
  frameSeconds: number;
  frameMs: number;
  simMs: number;
  gpuMs: number | null;
  drawCalls: number;
  triangles: number;
}

/**
 * Mass-battle stress test: replaces the armies with N soldiers (N/2 per side, infantry, spearmen, archers
 * and cavalry) deployed face to face on the central plain and marching into each other, then measures FPS, frame time, simulation time and GPU
 * time. Each F2 press runs the next count of PERF_STEPS.
 */
export class PerformanceTestScene {
  readonly results: PerfResult[] = [];
  private step = -1;
  private elapsed = 0;
  private samples: PerfSample[] = [];
  running = false;

  private count = 0;

  get current(): number | null {
    return this.step >= 0 ? this.count : null;
  }

  /** Starts the next unit count of PERF_STEPS, or `units` when given. */
  next(world: World, units?: number): number {
    this.step++;
    this.count = units ?? PERF_STEPS[this.step % PERF_STEPS.length];
    PerformanceTestScene.deploy(world, this.count);
    this.elapsed = 0;
    this.samples = [];
    this.running = true;
    return this.count;
  }

  /**
   * Removes every unit and deploys `total` soldiers in two combined-arms armies that attack each other:
   * infantry in front, spearmen behind, archers at the rear, cavalry on both wings.
   */
  static deploy(world: World, total: number): { a: number[]; b: number[] } {
    const { entities } = world;
    const doomed: number[] = [];
    for (let i = 0; i < entities.count; i++) if (entities.mask[entities.dense[i]] & Comp.Unit) doomed.push(entities.dense[i]);
    for (const id of doomed) entities.destroy(id);
    const perSide = Math.floor(total / 2);
    const a = PerformanceTestScene.army(world, 0, perSide, ['human_footman', 'human_spearman', 'human_archer', 'human_knight']);
    const b = PerformanceTestScene.army(world, 1, perSide, ['orc_warrior', 'orc_spearman', 'dark_elf_archer', 'dark_elf_rider']);
    return { a, b };
  }

  /** One army of `count` soldiers: team 0 north of the centre facing south, team 1 south facing north. */
  private static army(world: World, team: number, count: number, roster: [string, string, string, string]): number[] {
    const size = world.size;
    const cx = size / 2;
    const dir = team === 0 ? 1 : -1;
    const rot = team === 0 ? Math.PI : 0;
    const spacing = 1.65;
    const cavalry = Math.round(count * 0.12);
    const archers = Math.round(count * 0.2);
    const spears = Math.round(count * 0.2);
    const foot = count - cavalry - archers - spears;
    const columns = Math.min(40, Math.max(10, Math.round(Math.sqrt(count * 3))));
    const body: number[] = [];
    let depth = 30;
    for (const [type, n] of [[roster[0], foot], [roster[1], spears], [roster[2], archers]] as const) {
      if (n <= 0) continue;
      const blockDepth = Math.ceil(n / columns) * spacing;
      body.push(...spawnBlock(world, unitIndex(type), team, n, columns, cx, size / 2 + dir * (depth + blockDepth / 2), rot, spacing));
      depth += blockDepth + 1;
    }
    const enemySide = size / 2 - dir * 40;
    world.commands.push({ kind: 'formationMove', team, units: body, x: cx, z: enemySide, facing: null, width: null, formation: 'LINE', attackMove: true });
    const all = [...body];
    const wing = Math.ceil(cavalry / 2);
    for (const [side, n] of [[-1, wing], [1, cavalry - wing]] as const) {
      if (n <= 0) continue;
      const x = cx + side * ((columns * spacing) / 2 + 10);
      const riders = spawnBlock(world, unitIndex(roster[3]), team, n, 4, x, size / 2 + dir * 32, rot, 2.4);
      world.commands.push({ kind: 'formationMove', team, units: riders, x, z: enemySide, facing: null, width: null, formation: 'LINE', attackMove: true });
      all.push(...riders);
    }
    return all;
  }

  /** Feeds one frame; returns the result when the measurement of the current count is complete. */
  sample(s: PerfSample): PerfResult | null {
    if (!this.running) return null;
    this.elapsed += s.frameSeconds;
    if (this.elapsed < WARMUP) return null;
    this.samples.push(s);
    if (this.elapsed < WARMUP + MEASURE) return null;
    this.running = false;
    const n = this.samples.length;
    const avg = (f: (x: PerfSample) => number) => this.samples.reduce((sum, x) => sum + f(x), 0) / n;
    const gpu = this.samples.filter((x) => x.gpuMs !== null);
    const result: PerfResult = {
      units: this.current!,
      fps: n / this.samples.reduce((sum, x) => sum + x.frameSeconds, 0),
      frameMs: avg((x) => x.frameMs),
      simMs: avg((x) => x.simMs),
      gpuMs: gpu.length ? gpu.reduce((sum, x) => sum + x.gpuMs!, 0) / gpu.length : null,
      drawCalls: avg((x) => x.drawCalls),
      triangles: avg((x) => x.triangles),
    };
    this.results.push(result);
    return result;
  }
}

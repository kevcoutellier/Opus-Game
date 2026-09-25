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
 * Mass-battle stress test: replaces the armies with N soldiers (N/2 per side) deployed face to face on the
 * central plain and marching into each other, then measures FPS, frame time, simulation time and GPU
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

  /** Removes every unit and deploys `total` soldiers in two armies that attack each other. */
  static deploy(world: World, total: number): { a: number[]; b: number[] } {
    const { entities } = world;
    const doomed: number[] = [];
    for (let i = 0; i < entities.count; i++) if (entities.mask[entities.dense[i]] & Comp.Unit) doomed.push(entities.dense[i]);
    for (const id of doomed) entities.destroy(id);
    const size = world.size;
    const perSide = Math.floor(total / 2);
    const columns = Math.min(40, Math.max(10, Math.round(Math.sqrt(perSide * 4))));
    const half = Math.ceil(perSide / 2);
    const cx = size / 2;
    const sword = unitIndex('swordsman');
    const spear = unitIndex('spearman');
    const rowsDepth = Math.ceil(half / columns) * 1.65;
    const a = [
      ...spawnBlock(world, sword, 0, half, columns, cx, size / 2 + 30, Math.PI, 1.65),
      ...spawnBlock(world, spear, 0, perSide - half, columns, cx, size / 2 + 30 + rowsDepth + 1, Math.PI, 1.65),
    ];
    const b = [
      ...spawnBlock(world, sword, 1, half, columns, cx, size / 2 - 30, 0, 1.65),
      ...spawnBlock(world, spear, 1, perSide - half, columns, cx, size / 2 - 30 - rowsDepth - 1, 0, 1.65),
    ];
    world.commands.push({ kind: 'formationMove', team: 0, units: a, x: cx, z: size / 2 - 40, facing: null, width: null, formation: 'LINE', attackMove: true });
    world.commands.push({ kind: 'formationMove', team: 1, units: b, x: cx, z: size / 2 + 40, facing: null, width: null, formation: 'LINE', attackMove: true });
    return { a, b };
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

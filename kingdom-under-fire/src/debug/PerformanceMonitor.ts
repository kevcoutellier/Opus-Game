/**
 * Rolling timings (exponential moving average, in milliseconds) of named sections: simulation systems,
 * rendering, pathfinding... Works in the browser and in Node (benchmarks).
 */
export class PerformanceMonitor {
  private readonly averages = new Map<string, number>();
  private readonly lasts = new Map<string, number>();
  private readonly starts = new Map<string, number>();
  private readonly pending = new Map<string, number>();

  constructor(private readonly smoothing = 0.1) {}

  begin(name: string): void {
    this.starts.set(name, performance.now());
  }

  end(name: string): number {
    const start = this.starts.get(name);
    if (start === undefined) return 0;
    const ms = performance.now() - start;
    this.record(name, ms);
    return ms;
  }

  measure<T>(name: string, fn: () => T): T {
    const start = performance.now();
    const result = fn();
    this.record(name, performance.now() - start);
    return result;
  }

  record(name: string, ms: number): void {
    const avg = this.averages.get(name);
    this.averages.set(name, avg === undefined ? ms : avg + (ms - avg) * this.smoothing);
    this.lasts.set(name, ms);
  }

  /** Accumulates time of a section measured in several pieces during one tick (see `commit`). */
  add(name: string, ms: number): void {
    this.pending.set(name, (this.pending.get(name) ?? 0) + ms);
  }

  /** Records the time accumulated by `add` since the last commit as one sample (0 when nothing ran). */
  commit(name: string): void {
    this.record(name, this.pending.get(name) ?? 0);
    this.pending.set(name, 0);
  }

  average(name: string): number {
    return this.averages.get(name) ?? 0;
  }

  last(name: string): number {
    return this.lasts.get(name) ?? 0;
  }

  names(): string[] {
    return [...this.averages.keys()];
  }

  reset(): void {
    this.averages.clear();
    this.lasts.clear();
  }
}

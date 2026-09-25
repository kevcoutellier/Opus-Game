/**
 * Seeded PRNG (mulberry32). The simulation never calls Math.random(): a battle replays identically from the
 * same seed and the same command stream, which keeps a future lockstep multiplayer possible.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Integer in [0, n). */
  int(n: number): number {
    return Math.floor(this.next() * n);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  /**
   * Roughly normal, mean 0 and standard deviation 1, bounded to ±3: sum of three uniforms (no log or cos,
   * so identical in every browser).
   */
  gaussian(): number {
    return (this.next() + this.next() + this.next() - 1.5) * 2;
  }

  get seed(): number {
    return this.state;
  }
}

/** Stateless hash of two integers to [0, 1): deterministic "noise" for placement jitter. */
export function hash2(x: number, y: number, seed = 0): number {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

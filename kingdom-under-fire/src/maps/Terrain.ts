import { hash2 } from '../core/Random';
import { fbm, smoothstep } from './Noise';

export interface TerrainOptions {
  /** Side of the square map in metres. */
  size: number;
  seed: number;
}

/**
 * Heightmap terrain with its props (trees, rocks). Pure data: shared by the simulation (heights, slopes,
 * obstacles) and the renderer. The map spans [0, size] on x and z, one height sample per metre.
 */
export class Terrain {
  readonly size: number;
  /** Samples per side (size + 1). */
  readonly res: number;
  readonly heights: Float32Array;
  /** Trees: [x, z, scale, rotation, variant] per tree. */
  readonly trees: Float32Array;
  readonly treeCount: number;
  /** Rocks: [x, z, radius, rotation] per rock. */
  readonly rocks: Float32Array;
  readonly rockCount: number;
  /** 0..1 forest density per metre cell (for speed and, later, visibility). */
  readonly forest: Float32Array;

  constructor(size: number, heights: Float32Array, trees: number[], rocks: number[]) {
    this.size = size;
    this.res = size + 1;
    this.heights = heights;
    this.trees = new Float32Array(trees);
    this.treeCount = trees.length / 5;
    this.rocks = new Float32Array(rocks);
    this.rockCount = rocks.length / 4;
    this.forest = new Float32Array(size * size);
    for (let t = 0; t < this.treeCount; t++) {
      const tx = this.trees[t * 5];
      const tz = this.trees[t * 5 + 1];
      // Each tree darkens and slows a disc of ~3 m around it.
      for (let dz = -3; dz <= 3; dz++) {
        for (let dx = -3; dx <= 3; dx++) {
          const cx = Math.floor(tx) + dx;
          const cz = Math.floor(tz) + dz;
          if (cx < 0 || cz < 0 || cx >= size || cz >= size) continue;
          const d = Math.hypot(cx + 0.5 - tx, cz + 0.5 - tz);
          const w = Math.max(0, 1 - d / 3.5) * 0.55;
          const i = cz * size + cx;
          this.forest[i] = Math.min(1, this.forest[i] + w);
        }
      }
    }
  }

  /** Bilinear height at world position (clamped to the map). */
  heightAt(x: number, z: number): number {
    const max = this.size - 1e-4;
    const fx = Math.min(max, Math.max(0, x));
    const fz = Math.min(max, Math.max(0, z));
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const r = this.res;
    const h = this.heights;
    const a = h[iz * r + ix];
    const b = h[iz * r + ix + 1];
    const c = h[(iz + 1) * r + ix];
    const d = h[(iz + 1) * r + ix + 1];
    return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
  }

  /** Terrain gradient magnitude (rise over run) at a world position. */
  slopeAt(x: number, z: number): number {
    const e = 0.75;
    const dx = (this.heightAt(x + e, z) - this.heightAt(x - e, z)) / (2 * e);
    const dz = (this.heightAt(x, z + e) - this.heightAt(x, z - e)) / (2 * e);
    return Math.hypot(dx, dz);
  }

  forestAt(x: number, z: number): number {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    if (ix < 0 || iz < 0 || ix >= this.size || iz >= this.size) return 0;
    return this.forest[iz * this.size + ix];
  }

  /** Flat, empty map (tests, benchmarks). */
  static flat(size: number): Terrain {
    return new Terrain(size, new Float32Array((size + 1) * (size + 1)), [], []);
  }

  /**
   * Battlefield: an open plain in the middle (where the armies meet), rolling hills around it, forests and
   * rock outcrops on the sides, a mountain rim along the borders.
   */
  static generate({ size, seed }: TerrainOptions): Terrain {
    const res = size + 1;
    const heights = new Float32Array(res * res);
    const plainAt = (x: number, z: number) => {
      const dx = (x - size / 2) / size;
      const dz = (z - size / 2) / size;
      // Elongated along z: the two armies deploy at both ends of the plain.
      return 1 - smoothstep(0.18, 0.42, Math.hypot(dx * 1.6, dz * 0.85));
    };
    // Superellipse distance to the border (rounded corners instead of a square crease).
    const edgeAt = (x: number, z: number) => {
      const ex = Math.abs(x / size - 0.5) * 2;
      const ez = Math.abs(z / size - 0.5) * 2;
      return Math.pow(ex ** 6 + ez ** 6, 1 / 6);
    };

    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const hills = (fbm(i * 0.011, j * 0.011, seed) - 0.5) * 22;
        const detail = (fbm(i * 0.06, j * 0.06, seed + 7) - 0.5) * 1.6;
        const plain = plainAt(i, j);
        const edge = edgeAt(i, j);
        const rim = smoothstep(0.78, 1, edge) * (16 + fbm(i * 0.03, j * 0.03, seed + 3) * 22);
        heights[j * res + i] = (hills * (1 - 0.8 * plain) + detail) + rim;
      }
    }

    const terrainAt = (x: number, z: number) => {
      const ix = Math.min(size - 1, Math.max(0, Math.floor(x)));
      const iz = Math.min(size - 1, Math.max(0, Math.floor(z)));
      const h = heights;
      const dx = h[iz * res + ix + 1] - h[iz * res + ix];
      const dz = h[(iz + 1) * res + ix] - h[iz * res + ix];
      return { slope: Math.hypot(dx, dz) };
    };

    const trees: number[] = [];
    const step = 3.2;
    for (let gz = 0; gz * step < size; gz++) {
      for (let gx = 0; gx * step < size; gx++) {
        const x = (gx + 0.15 + hash2(gx, gz, seed + 11) * 0.7) * step;
        const z = (gz + 0.15 + hash2(gx, gz, seed + 12) * 0.7) * step;
        if (x < 4 || z < 4 || x > size - 4 || z > size - 4) continue;
        const plain = plainAt(x, z);
        const edge = edgeAt(x, z);
        const { slope } = terrainAt(x, z);
        if (slope > 0.9 || edge > 0.93) continue;
        const forestMask = fbm(x * 0.018, z * 0.018, seed + 21);
        const threshold = 0.53 + plain * 0.3;
        const dense = forestMask > threshold;
        const lone = hash2(gx, gz, seed + 13) < 0.012 * (1 - plain * 0.7);
        if (!dense && !lone) continue;
        if (dense && hash2(gx, gz, seed + 14) > 0.55 + (forestMask - threshold) * 3) continue;
        const scale = 0.75 + hash2(gx, gz, seed + 15) * 0.6;
        const variant = hash2(gx, gz, seed + 16) < 0.72 ? 0 : 1; // 0 = pine, 1 = broadleaf
        trees.push(x, z, scale, hash2(gx, gz, seed + 17) * Math.PI * 2, variant);
      }
    }

    const rocks: number[] = [];
    const rockStep = 7;
    for (let gz = 0; gz * rockStep < size; gz++) {
      for (let gx = 0; gx * rockStep < size; gx++) {
        const x = (gx + hash2(gx, gz, seed + 31)) * rockStep;
        const z = (gz + hash2(gx, gz, seed + 32)) * rockStep;
        if (x < 3 || z < 3 || x > size - 3 || z > size - 3) continue;
        const plain = plainAt(x, z);
        const edge = edgeAt(x, z);
        const outcrop = fbm(x * 0.03, z * 0.03, seed + 33);
        const p = 0.015 + smoothstep(0.62, 0.8, outcrop) * 0.5 * (1 - plain * 0.85) + smoothstep(0.8, 0.95, edge) * 0.25;
        if (hash2(gx, gz, seed + 34) > p) continue;
        const radius = 0.7 + hash2(gx, gz, seed + 35) * (1.4 + outcrop * 1.6);
        rocks.push(x, z, radius, hash2(gx, gz, seed + 36) * Math.PI * 2);
      }
    }

    return new Terrain(size, heights, trees, rocks);
  }
}

import { describe, expect, it } from 'vitest';
import { Terrain } from '../../src/maps/Terrain';

describe('Terrain', () => {
  const terrain = Terrain.generate({ size: 128, seed: 7 });

  it('is deterministic for a seed', () => {
    const again = Terrain.generate({ size: 128, seed: 7 });
    expect(again.heights).toEqual(terrain.heights);
    expect(again.treeCount).toBe(terrain.treeCount);
    expect(Terrain.generate({ size: 128, seed: 8 }).heights).not.toEqual(terrain.heights);
  });

  it('interpolates heights bilinearly and clamps outside the map', () => {
    const h00 = terrain.heights[10 * terrain.res + 10];
    const h10 = terrain.heights[10 * terrain.res + 11];
    expect(terrain.heightAt(10, 10)).toBeCloseTo(h00, 5);
    expect(terrain.heightAt(10.5, 10)).toBeCloseTo((h00 + h10) / 2, 5);
    expect(terrain.heightAt(-50, 10)).toBeCloseTo(terrain.heightAt(0, 10), 5);
  });

  it('keeps the central plain flatter than the border rim and places forests and rocks', () => {
    const c = terrain.size / 2;
    expect(terrain.slopeAt(c, c)).toBeLessThan(0.3);
    expect(terrain.heightAt(2, 2)).toBeGreaterThan(terrain.heightAt(c, c) + 5);
    expect(terrain.treeCount).toBeGreaterThan(50);
    expect(terrain.rockCount).toBeGreaterThan(5);
    expect(terrain.forestAt(terrain.trees[0], terrain.trees[1])).toBeGreaterThan(0);
  });
});

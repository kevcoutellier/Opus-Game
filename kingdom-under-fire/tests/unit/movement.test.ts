import { describe, expect, it } from 'vitest';
import { Random } from '../../src/core/Random';
import { Simulation } from '../../src/core/Simulation';
import { World } from '../../src/core/World';
import { Comp } from '../../src/entities/Components';
import { EntityManager } from '../../src/entities/EntityManager';
import { FlowField } from '../../src/navigation/FlowField';
import { NavGrid } from '../../src/navigation/NavGrid';
import { SpatialHashGrid } from '../../src/navigation/SpatialHashGrid';
import { SpatialSystem } from '../../src/navigation/SpatialSystem';
import { MovementSystem, turnTowards } from '../../src/units/MovementSystem';
import { FormationManager } from '../../src/formations/FormationManager';
import { spawnBlock, spawnUnit } from '../../src/units/UnitFactory';

/** Vertical wall at x in [60, 62) over the whole height except a gap around z = 100. */
function wallWithGap(grid: NavGrid): void {
  for (let cz = 0; cz < grid.rows; cz++) {
    const z = (cz + 0.5) * grid.cellSize;
    if (z > 96 && z < 104) continue;
    grid.blocked[cz * grid.cols + grid.cellX(61)] = 1;
  }
}

function sim(world: World): Simulation {
  return new Simulation(world, [new SpatialSystem(), new FormationManager(world), new MovementSystem()]);
}

const run = (s: Simulation, seconds: number) => {
  for (let i = 0; i < seconds * s.world.time.hz; i++) s.step(s.world.time.dt);
};

describe('SpatialHashGrid', () => {
  it('returns exactly the entities a brute-force scan finds', () => {
    const em = new EntityManager(600);
    const xs = new Float32Array(600);
    const zs = new Float32Array(600);
    const rng = new Random(5);
    for (let i = 0; i < 500; i++) {
      const id = em.create(Comp.Unit);
      xs[id] = rng.range(0, 100);
      zs[id] = rng.range(0, 100);
    }
    const grid = new SpatialHashGrid(100, 100, 2, 600);
    grid.rebuild(em, Comp.Unit, xs, zs);
    const out = new Int32Array(600);
    for (let q = 0; q < 50; q++) {
      const x = rng.range(0, 100);
      const z = rng.range(0, 100);
      const r = rng.range(0.5, 12);
      const found = [...out.subarray(0, grid.query(x, z, r, xs, zs, out))].sort((a, b) => a - b);
      const expected: number[] = [];
      for (let id = 0; id < 500; id++) if (Math.hypot(xs[id] - x, zs[id] - z) <= r) expected.push(id);
      expect(found).toEqual(expected);
    }
  });
});

describe('FlowField', () => {
  it('leads around a wall through its gap', () => {
    const grid = new NavGrid(128, 128, 2);
    wallWithGap(grid);
    const field = new FlowField(grid, grid.cellAt(100, 30));
    expect(field.distanceAt(20, 30)).toBeLessThan(Infinity);
    // Walk the field from the far side of the wall: it must get through the gap.
    let x = 20;
    let z = 30;
    const dir = { x: 0, z: 0 };
    let crossedAt = -1;
    for (let step = 0; step < 400 && field.direction(x, z, dir); step++) {
      const nx = x + dir.x;
      if (x < 61 && nx >= 61) crossedAt = z;
      x = nx;
      z += dir.z;
      expect(grid.isBlockedAt(x, z)).toBe(false);
    }
    expect(Math.hypot(x - 100, z - 30)).toBeLessThan(3);
    expect(crossedAt).toBeGreaterThan(95);
    expect(crossedAt).toBeLessThan(105);
  });

  it('moves a blocked goal to the nearest walkable cell and reports unreachable cells', () => {
    const grid = new NavGrid(40, 40, 2);
    grid.blocked[grid.cellAt(21, 21)] = 1;
    const field = new FlowField(grid, grid.cellAt(21, 21));
    expect(grid.blocked[field.goal]).toBe(0);
    // Enclose a pocket: it cannot reach the goal.
    for (const [x, z] of [[5, 1], [5, 3], [5, 5], [5, 7], [3, 7], [1, 7]]) grid.blocked[grid.cellAt(x, z)] = 1;
    const closed = new FlowField(grid, grid.cellAt(30, 30));
    expect(closed.distanceAt(3, 3)).toBe(Infinity);
    expect(closed.direction(3, 3, { x: 0, z: 0 })).toBe(false);
  });
});

describe('MovementSystem', () => {
  it('brings a group to its destination and keeps soldiers apart', () => {
    const world = new World({ seed: 1 });
    const s = sim(world);
    const ids = spawnBlock(world, 0, 0, 12, 4, 30, 30, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: ids, x: 90, z: 80, facing: null, width: null, formation: null, attackMove: false });
    run(s, 40);
    for (const id of ids) {
      expect(Math.hypot(world.c.slotX[id] - world.c.x[id], world.c.slotZ[id] - world.c.z[id])).toBeLessThan(0.6);
    }
    for (const a of ids) {
      for (const b of ids) {
        if (a < b) expect(Math.hypot(world.c.x[a] - world.c.x[b], world.c.z[a] - world.c.z[b])).toBeGreaterThan(0.6);
      }
    }
  });

  it('goes around a wall with the shared flow field instead of getting stuck', () => {
    const world = new World({ seed: 1 });
    wallWithGap(world.nav);
    const s = sim(world);
    const id = spawnUnit(world, 0, 0, 30, 30);
    world.commands.push({ kind: 'formationMove', team: 0, units: [id], x: 100, z: 30, facing: null, width: null, formation: null, attackMove: false });
    run(s, 70);
    expect(Math.hypot(world.c.x[id] - 100, world.c.z[id] - 30)).toBeLessThan(1);
    expect(world.paths.computed).toBe(1);
  });

  it('never lets a unit walk into a blocked cell', () => {
    const world = new World({ seed: 2 });
    for (let cz = 0; cz < world.nav.rows; cz++) world.nav.blocked[cz * world.nav.cols + world.nav.cellX(61)] = 1;
    const s = sim(world);
    const ids = spawnBlock(world, 0, 0, 9, 3, 50, 60, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: ids, x: 100, z: 60, facing: null, width: null, formation: null, attackMove: false });
    for (let t = 0; t < 30 * 20; t++) {
      s.step(world.time.dt);
      for (const id of ids) expect(world.nav.isBlockedAt(world.c.x[id], world.c.z[id])).toBe(false);
    }
  });

  it('turns by the shortest way', () => {
    expect(turnTowards(3, -3, 0.1)).toBeCloseTo(3.1, 5);
    expect(turnTowards(0, 1, 5)).toBeCloseTo(1, 5);
  });
});

import { describe, expect, it } from 'vitest';
import { Simulation } from '../../src/core/Simulation';
import { World } from '../../src/core/World';
import { UnitState } from '../../src/entities/Components';
import { FORMATION_SPACING } from '../../src/formations/Formation';
import { FormationManager } from '../../src/formations/FormationManager';
import { assignSlots, autoColumns, columnsForWidth, computeSlots } from '../../src/formations/FormationSolver';
import { FORMATION_TYPES } from '../../src/formations/FormationType';
import { SpatialSystem } from '../../src/navigation/SpatialSystem';
import { MovementSystem } from '../../src/units/MovementSystem';
import { spawnBlock } from '../../src/units/UnitFactory';

const minDistance = (layout: ReturnType<typeof computeSlots>) => {
  let min = Infinity;
  for (let a = 0; a < layout.count; a++) {
    for (let b = a + 1; b < layout.count; b++) {
      min = Math.min(min, Math.hypot(layout.lateral[a] - layout.lateral[b], layout.forward[a] - layout.forward[b]));
    }
  }
  return min;
};

describe('FormationSolver', () => {
  it('lays out every type with one slot per unit, centred, never closer than ~the spacing', () => {
    for (const type of FORMATION_TYPES) {
      for (const n of [1, 7, 20, 64]) {
        const layout = computeSlots(type, n, 1.6);
        expect(layout.count).toBe(n);
        let ml = 0;
        let mf = 0;
        for (let i = 0; i < n; i++) {
          ml += layout.lateral[i];
          mf += layout.forward[i];
        }
        expect(Math.abs(ml / n)).toBeLessThan(1e-3);
        expect(Math.abs(mf / n)).toBeLessThan(1e-3);
        if (n > 1) expect(minDistance(layout)).toBeGreaterThan(type === 'SCATTERED' ? 1.6 : 1.3);
      }
    }
  });

  it('builds a wide line, a narrow column, a wedge with its point forward', () => {
    const line = computeSlots('LINE', 20, 1.6);
    expect(line.columns).toBe(10);
    expect(autoColumns('COLUMN', 20)).toBe(4);
    const wedge = computeSlots('WEDGE', 9, 1.6);
    const apex = [...wedge.row].indexOf(0);
    expect(wedge.forward[apex]).toBe(Math.max(...wedge.forward));
    expect(columnsForWidth(16, 1.6, 40)).toBe(11);
    expect(columnsForWidth(100, 1.6, 12)).toBe(12);
  });

  it('turns the outer ranks of a square and the rim of a circle outwards', () => {
    const square = computeSlots('SQUARE', 16, 1.6);
    for (let i = 0; i < 16; i++) {
      if (square.row[i] === 3 && Math.abs(square.lateral[i]) < 2) expect(square.facing[i]).toBeCloseTo(Math.PI);
    }
    const circle = computeSlots('CIRCLE', 12, 1.6);
    for (let i = 0; i < 12; i++) {
      const outward = Math.atan2(circle.lateral[i], circle.forward[i]);
      expect(Math.cos(outward - circle.facing[i])).toBeGreaterThan(0.99);
    }
  });

  it('keeps the files in order: no unit crosses another to reach its slot', () => {
    // Ten units on a line along x, ordered to face -z (their "left" is then +x).
    const xs = Array.from({ length: 10 }, (_, i) => i * 2);
    const zs = new Array(10).fill(0);
    const priority = new Array(10).fill(0);
    for (const facing of [0, Math.PI, Math.PI / 2]) {
      const layout = computeSlots('LINE', 10, 1.6, 10);
      const unitForSlot = assignSlots(layout, 'LINE', xs, zs, priority, facing);
      const slots = [...Array(10).keys()].sort((a, b) => layout.lateral[a] - layout.lateral[b]);
      const lateralOfUnit = (u: number) => xs[u] * Math.cos(facing) - zs[u] * Math.sin(facing);
      const order = slots.map((s) => lateralOfUnit(unitForSlot[s]));
      for (let k = 1; k < order.length; k++) expect(order[k]).toBeGreaterThanOrEqual(order[k - 1] - 1e-6);
    }
  });

  it('sends lower-priority units (ranged) to the rear ranks', () => {
    const layout = computeSlots('LINE', 6, 1.6, 3);
    const unitForSlot = assignSlots(layout, 'LINE', [0, 2, 4, 0, 2, 4], [0, 0, 0, 5, 5, 5], [1, 1, 1, 0, 0, 0], 0);
    for (let s = 0; s < 6; s++) {
      const expectedRow = unitForSlot[s] >= 3 ? 0 : 1;
      expect(layout.row[s]).toBe(expectedRow);
    }
  });
});

function battle() {
  const world = new World({ seed: 9 });
  const formations = new FormationManager(world);
  const sim = new Simulation(world, [new SpatialSystem(), formations, new MovementSystem()]);
  const run = (seconds: number) => {
    for (let i = 0; i < seconds * world.time.hz; i++) sim.step(world.time.dt);
  };
  return { world, formations, run };
}

describe('FormationManager', () => {
  it('forms a line of the drawn width, facing the drawn direction, at the destination', () => {
    const { world, formations, run } = battle();
    const ids = spawnBlock(world, 0, 0, 20, 5, 40, 40, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: ids, x: 70, z: 80, facing: Math.PI / 2, width: 8 * FORMATION_SPACING, formation: 'LINE', attackMove: false });
    run(45);
    expect(formations.count).toBe(1);
    const f = [...formations.all()][0];
    expect(f.layout!.columns).toBe(9);
    expect(f.moving).toBe(false);
    for (const id of ids) {
      expect(Math.hypot(world.c.x[id] - world.c.slotX[id], world.c.z[id] - world.c.slotZ[id])).toBeLessThan(0.6);
      expect(Math.cos(world.c.rot[id] - Math.PI / 2)).toBeGreaterThan(0.95);
    }
    // Facing +x: the front rank has the largest x.
    const frontX = Math.max(...ids.map((id) => world.c.slotX[id]));
    expect(frontX).toBeGreaterThan(70);
  });

  it('changes formation type in place and merges units into one formation', () => {
    const { world, formations, run } = battle();
    const a = spawnBlock(world, 0, 0, 8, 4, 40, 40, 0);
    const b = spawnBlock(world, 1, 0, 8, 4, 40, 45, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: a, x: 40, z: 60, facing: null, width: null, formation: null, attackMove: false });
    world.commands.push({ kind: 'formationMove', team: 0, units: b, x: 50, z: 60, facing: null, width: null, formation: null, attackMove: false });
    run(1);
    expect(formations.count).toBe(2);
    world.commands.push({ kind: 'setFormation', team: 0, units: [...a, ...b], formation: 'CIRCLE' });
    run(20);
    expect(formations.count).toBe(1);
    expect(formations.typeOf([...a, ...b])).toBe('CIRCLE');
  });

  it('waits for stragglers instead of stretching the column', () => {
    const { world, run } = battle();
    const ids = spawnBlock(world, 0, 0, 10, 5, 30, 30, 0);
    // One soldier is far behind.
    world.c.x[ids[9]] = world.c.prevX[ids[9]] = 30;
    world.c.z[ids[9]] = world.c.prevZ[ids[9]] = 5;
    world.commands.push({ kind: 'formationMove', team: 0, units: ids, x: 30, z: 110, facing: null, width: null, formation: null, attackMove: false });
    run(12);
    const behind = Math.hypot(world.c.slotX[ids[9]] - world.c.x[ids[9]], world.c.slotZ[ids[9]] - world.c.z[ids[9]]);
    expect(behind).toBeLessThan(12);
  });

  it('removes the dead and closes the ranks after the re-deal delay', () => {
    const { world, formations, run } = battle();
    const ids = spawnBlock(world, 0, 0, 12, 6, 40, 40, 0);
    world.commands.push({ kind: 'formationMove', team: 0, units: ids, x: 40, z: 50, facing: 0, width: null, formation: 'LINE', attackMove: false });
    run(10);
    world.c.state[ids[0]] = UnitState.Dying;
    world.c.state[ids[1]] = UnitState.Dying;
    run(0.2);
    const f = [...formations.all()][0];
    expect(f.members).toHaveLength(10);
    expect(f.layout!.count).toBe(12);
    run(2);
    expect(f.layout!.count).toBe(10);
    expect(f.losses).toBeCloseTo(2 / 12);
  });
});

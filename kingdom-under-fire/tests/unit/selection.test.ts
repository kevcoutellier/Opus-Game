import { describe, expect, it } from 'vitest';
import { SelectionManager, type SelectionContext } from '../../src/selection/SelectionManager';

/** 6 own units on a row (ids 0-5, type 0 or 1) and 2 enemies (ids 10, 11), 50 px apart on screen. */
function scene() {
  const alive = new Set([0, 1, 2, 3, 4, 5, 10, 11]);
  const pos = new Map<number, { x: number; y: number }>();
  for (let i = 0; i < 6; i++) pos.set(i, { x: 100 + i * 50, y: 100 });
  pos.set(10, { x: 100, y: 300 });
  pos.set(11, { x: 150, y: 300 });
  const ctx: SelectionContext = {
    candidates: () => [...alive],
    isOwn: (id) => id < 10,
    project: (id) => ({ ...pos.get(id)!, visible: pos.get(id)!.x < 1000 }),
    kind: (id) => (id < 10 ? id % 2 : 9),
    isAlive: (id) => alive.has(id),
  };
  return { sel: new SelectionManager(ctx), alive, pos };
}

describe('SelectionManager', () => {
  it('selects by click and by drag rectangle, own units only in a rectangle', () => {
    const { sel } = scene();
    sel.click(151, 102, 'replace');
    expect(sel.ids).toEqual([1]);
    sel.box({ x0: 80, y0: 50, x1: 230, y1: 350 }, 'replace');
    expect([...sel.ids].sort()).toEqual([0, 1, 2]);
    sel.click(600, 600, 'replace');
    expect(sel.size).toBe(0);
  });

  it('adds with shift and removes with ctrl', () => {
    const { sel } = scene();
    sel.box({ x0: 80, y0: 80, x1: 180, y1: 120 }, 'replace');
    sel.box({ x0: 280, y0: 80, x1: 380, y1: 120 }, 'add');
    expect([...sel.ids].sort()).toEqual([0, 1, 4, 5]);
    sel.click(100, 100, 'remove');
    expect([...sel.ids].sort()).toEqual([1, 4, 5]);
    sel.click(150, 100, 'add'); // shift-click on a selected unit toggles it off
    expect([...sel.ids].sort()).toEqual([4, 5]);
  });

  it('inspects an enemy alone and never commands it', () => {
    const { sel } = scene();
    sel.click(101, 301, 'replace');
    expect(sel.ids).toEqual([10]);
    expect(sel.commandable).toBe(false);
    sel.box({ x0: 80, y0: 80, x1: 130, y1: 120 }, 'add');
    expect(sel.ids).toEqual([0]);
    expect(sel.commandable).toBe(true);
  });

  it('selects every visible unit of the same type on double click', () => {
    const { sel } = scene();
    sel.selectSameKind(200, 100, 'replace'); // unit 2, type 0
    expect([...sel.ids].sort()).toEqual([0, 2, 4]);
  });

  it('filters the selection', () => {
    const { sel } = scene();
    sel.box({ x0: 0, y0: 0, x1: 1000, y1: 200 }, 'replace');
    sel.filter((id) => id % 2 === 1);
    expect([...sel.ids].sort()).toEqual([1, 3, 5]);
  });

  it('stores control groups, recalls them and reports a double tap', () => {
    const { sel, alive } = scene();
    sel.box({ x0: 0, y0: 0, x1: 260, y1: 200 }, 'replace');
    sel.assignGroup(1);
    sel.clear();
    expect(sel.recallGroup(1, 1000)).toBe(false);
    expect([...sel.ids].sort()).toEqual([0, 1, 2, 3]);
    expect(sel.recallGroup(1, 1200)).toBe(true);
    expect(sel.recallGroup(1, 2000)).toBe(false);
    alive.delete(2);
    sel.recallGroup(1, 5000);
    expect(sel.groupSize(1)).toBe(3);
    expect(sel.recallGroup(7, 5000)).toBe(false);
  });

  it('prunes dead units and bumps its version only on change', () => {
    const { sel, alive } = scene();
    sel.box({ x0: 0, y0: 0, x1: 1000, y1: 200 }, 'replace');
    const v = sel.version;
    sel.prune();
    expect(sel.version).toBe(v);
    alive.delete(0);
    sel.prune();
    expect(sel.ids.includes(0)).toBe(false);
    expect(sel.version).toBe(v + 1);
  });
});

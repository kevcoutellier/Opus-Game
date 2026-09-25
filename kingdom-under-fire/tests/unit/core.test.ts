import { describe, expect, it } from 'vitest';
import { CommandQueue } from '../../src/core/Commands';
import { EventBus } from '../../src/core/EventBus';
import { GameLoop } from '../../src/core/GameLoop';
import { Random } from '../../src/core/Random';
import { Simulation } from '../../src/core/Simulation';
import { World } from '../../src/core/World';
import { FACTIONS } from '../../src/data/factions';
import { UNIT_DEFS } from '../../src/data/units';
import { Comp } from '../../src/entities/Components';
import { EntityManager } from '../../src/entities/EntityManager';
import { parseUnitDefs } from '../../src/units/UnitStats';

describe('GameLoop', () => {
  it('runs a fixed number of simulation steps whatever the frame rate', () => {
    const run = (frameSeconds: number, frames: number) => {
      let steps = 0;
      const loop = new GameLoop(30, () => steps++, () => {});
      for (let i = 0; i < frames; i++) loop.advance(frameSeconds);
      return steps;
    };
    // Two seconds of real time at 144, 60 and 20 FPS: always 60 steps (±1 for the accumulator remainder).
    expect(Math.abs(run(1 / 144, 288) - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(run(1 / 60, 120) - 60)).toBeLessThanOrEqual(1);
    expect(Math.abs(run(1 / 20, 40) - 60)).toBeLessThanOrEqual(1);
  });

  it('gives the renderer an interpolation factor in [0, 1) and stops simulating when paused', () => {
    const alphas: number[] = [];
    let steps = 0;
    const loop = new GameLoop(30, () => steps++, (alpha) => alphas.push(alpha));
    loop.advance(0.05);
    expect(steps).toBe(1);
    expect(alphas[0]).toBeGreaterThanOrEqual(0);
    expect(alphas[0]).toBeLessThan(1);
    loop.paused = true;
    loop.advance(1);
    expect(steps).toBe(1);
  });

  it('never runs more than maxStepsPerFrame steps after a long stall', () => {
    let steps = 0;
    const loop = new GameLoop(60, () => steps++, () => {});
    loop.advance(10);
    expect(steps).toBe(loop.maxStepsPerFrame);
  });
});

describe('EntityManager', () => {
  it('creates, queries and destroys entities while keeping a dense list', () => {
    const em = new EntityManager(8);
    const a = em.create(Comp.Transform | Comp.Health);
    const b = em.create(Comp.Transform);
    const c = em.create(Comp.Transform | Comp.Health);
    expect(em.count).toBe(3);
    expect(em.has(a, Comp.Health)).toBe(true);
    expect(em.has(b, Comp.Health)).toBe(false);
    em.destroy(a);
    expect(em.isAlive(a)).toBe(false);
    expect(em.count).toBe(2);
    const seen: number[] = [];
    em.each(Comp.Transform, (id) => seen.push(id));
    expect(seen.sort()).toEqual([b, c].sort());
  });

  it('recycles ids first-in first-out and defers destruction', () => {
    const em = new EntityManager(4);
    const ids = [em.create(1), em.create(1), em.create(1)];
    em.destroyLater(ids[0]);
    expect(em.isAlive(ids[0])).toBe(true);
    em.flush();
    expect(em.isAlive(ids[0])).toBe(false);
    // A never-used id is handed out before the freed one.
    expect(em.create(1)).toBe(3);
    expect(em.create(1)).toBe(ids[0]);
    expect(() => em.create(1)).toThrow(/capacity/);
  });

  it('can recycle every id when all entities are destroyed at once', () => {
    const em = new EntityManager(3);
    const ids = [em.create(1), em.create(1), em.create(1)];
    for (const id of ids) em.destroy(id);
    expect([em.create(1), em.create(1), em.create(1)]).toEqual(ids);
  });
});

describe('EventBus and CommandQueue', () => {
  it('delivers typed events and supports unsubscription', () => {
    const bus = new EventBus<{ hit: { damage: number } }>();
    const got: number[] = [];
    const off = bus.on('hit', (e) => got.push(e.damage));
    bus.emit('hit', { damage: 3 });
    off();
    bus.emit('hit', { damage: 5 });
    expect(got).toEqual([3]);
  });

  it('applies queued commands in order and rejects unknown kinds', () => {
    type Cmd = { kind: 'a'; team: number; v: number } | { kind: 'b'; team: number };
    const queue = new CommandQueue<Cmd>();
    const log: string[] = [];
    queue.on('a', (c) => log.push(`a${c.v}`));
    queue.push({ kind: 'a', team: 0, v: 1 });
    queue.push({ kind: 'a', team: 0, v: 2 });
    expect(queue.apply()).toBe(2);
    expect(log).toEqual(['a1', 'a2']);
    queue.push({ kind: 'b', team: 0 });
    expect(() => queue.apply()).toThrow(/No handler/);
  });
});

describe('Simulation', () => {
  it('saves the previous transforms, runs systems in order and advances the clock', () => {
    const world = new World({ seed: 1 });
    const id = world.entities.create(Comp.Transform);
    world.c.x[id] = 5;
    const order: string[] = [];
    const sim = new Simulation(world, [
      { name: 'move', update: (w) => { order.push('move'); w.c.x[id] += 1; } },
      { name: 'after', update: () => order.push('after') },
    ]);
    sim.step(world.time.dt);
    expect(order).toEqual(['move', 'after']);
    expect(world.c.prevX[id]).toBe(5);
    expect(world.c.x[id]).toBe(6);
    expect(world.time.tick).toBe(1);
  });

  it('is deterministic for a given seed', () => {
    const a = new Random(42);
    const b = new Random(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(new Random(1).next()).not.toBe(new Random(2).next());
  });
});

describe('data', () => {
  it('validates the unit and faction definitions', () => {
    expect(UNIT_DEFS.map((u) => u.id)).toEqual(['swordsman', 'spearman']);
    expect(FACTIONS.length).toBeGreaterThanOrEqual(2);
  });

  it('rejects invalid unit data with a readable error', () => {
    const bad = { ...UNIT_DEFS[0], id: 'broken', health: -5 };
    expect(() => parseUnitDefs([bad])).toThrow(/broken/);
    expect(() => parseUnitDefs([UNIT_DEFS[0], UNIT_DEFS[0]])).toThrow(/Duplicate/);
  });
});

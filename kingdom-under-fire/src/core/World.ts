import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { Comp, Components } from '../entities/Components';
import { EntityManager } from '../entities/EntityManager';
import { Terrain } from '../maps/Terrain';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinding } from '../navigation/Pathfinding';
import { SpatialHashGrid } from '../navigation/SpatialHashGrid';
import { CommandQueue } from './Commands';
import { EventBus, type EventMap } from './EventBus';
import type { GameCommand } from './GameCommands';
import { Random } from './Random';
import { SimTime } from './Time';

export interface SimEvents extends EventMap {
  unitSpawned: { id: number };
  unitDied: { id: number; team: number; x: number; z: number; killer: number };
}

export interface WorldOptions {
  seed: number;
  hz?: number;
  capacity?: number;
  /** Battlefield; a flat 128 m map when omitted (tests). */
  terrain?: Terrain;
  perf?: PerformanceMonitor;
}

/** Cell size (m) of the neighbour grid: about two soldiers wide. */
const SPATIAL_CELL = 2;

/**
 * The whole simulation state. It holds no Three.js object: the simulation runs identically in the browser,
 * in Node (tests, benchmarks) and later in a worker or on a server.
 */
export class World {
  readonly entities: EntityManager;
  readonly c: Components;
  readonly events = new EventBus<SimEvents>();
  readonly commands = new CommandQueue<GameCommand>();
  readonly rng: Random;
  readonly time: SimTime;
  readonly terrain: Terrain;
  readonly nav: NavGrid;
  readonly paths: Pathfinding;
  readonly spatial: SpatialHashGrid;
  readonly perf?: PerformanceMonitor;

  constructor(options: WorldOptions) {
    const capacity = options.capacity ?? 4096;
    this.entities = new EntityManager(capacity);
    this.c = new Components(capacity);
    this.rng = new Random(options.seed);
    this.time = new SimTime(options.hz ?? 30);
    this.perf = options.perf;
    this.terrain = options.terrain ?? Terrain.flat(128);
    this.nav = NavGrid.fromTerrain(this.terrain);
    this.paths = new Pathfinding(this.nav, options.perf);
    this.spatial = new SpatialHashGrid(this.terrain.size, this.terrain.size, SPATIAL_CELL, capacity);
  }

  get size(): number {
    return this.terrain.size;
  }

  /** Saves the previous transform of every entity (render interpolation) and applies queued commands. */
  beginTick(): void {
    const { entities, c } = this;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Transform) === 0) continue;
      c.prevX[id] = c.x[id];
      c.prevZ[id] = c.z[id];
      c.prevRot[id] = c.rot[id];
    }
    this.commands.apply();
  }
}

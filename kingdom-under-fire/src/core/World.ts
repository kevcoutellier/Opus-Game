import type { Attack, FlankId } from '../combat/DamageSystem';
import { FireGrid } from '../combat/FireSystem';
import { ProjectilePool } from '../combat/Projectiles';
import type { Trap } from '../combat/TrapSystem';
import type { Prop } from '../maps/Props';
import type { PerformanceMonitor } from '../debug/PerformanceMonitor';
import { Comp, Components } from '../entities/Components';
import { EntityManager } from '../entities/EntityManager';
import { Terrain } from '../maps/Terrain';
import { NavGrid } from '../navigation/NavGrid';
import { Pathfinding } from '../navigation/Pathfinding';
import { SpatialHashGrid } from '../navigation/SpatialHashGrid';
import { CommandQueue } from './Commands';
import { EventBus, type EventMap } from './EventBus';
import type { MoveId } from '../heroes/Moves';
import type { GameCommand } from './GameCommands';
import { Random } from './Random';
import { SimTime } from './Time';

export interface SimEvents extends EventMap {
  unitSpawned: { id: number };
  unitHit: { attack: Attack; damage: number; critical: boolean; killed: boolean; flank: FlankId };
  unitDied: { id: number; team: number; x: number; z: number; killer: number };
  unitRouted: { id: number };
  unitRallied: { id: number };
  projectileLaunched: { x: number; z: number; type: number };
  /** `index` is the pool slot, still readable during the event. */
  projectileLanded: { index: number; x: number; z: number; hit: boolean };
  chargeStarted: { id: number };
  chargeImpact: { id: number; x: number; z: number; braced: boolean };
  abilityStarted: { hero: number; ability: string; x: number; z: number };
  abilityCast: { hero: number; ability: string; x: number; z: number; color: number };
  heroLevelUp: { id: number; level: number };
  heroControl: { id: number; direct: boolean };
  heroDodged: { id: number };
  /** A hero's move in action mode landed (`hits` enemies struck). */
  heroMove: { hero: number; move: MoveId; x: number; z: number; hits: number };
  /** A fire cell (FireGrid) caught fire or burnt out. */
  fireCell: { cell: number; burning: boolean };
  trapLaid: { id: number; team: number; x: number; z: number };
  trapSprung: { id: number; team: number; x: number; z: number; radius: number };
  /** A troop started using one of its skills. */
  troopSkillStarted: { troop: number; team: number; skill: string; x: number; z: number };
  /** An officer joined the troop of a hero (`slot` 0 or 1, `officer` its definition). */
  officerJoined: { hero: number; unit: number; slot: number; officer: string };
  /** An officer performed his assist attack. */
  assistCast: { hero: number; officer: number; assist: string; x: number; z: number; color: number; radius: number };
  /** A troop lost its leader: its soldiers flee the field. */
  troopRouted: { troop: number; team: number };
  /** A troop has no soldier left on the field. */
  troopDefeated: { troop: number; team: number };
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
  readonly projectiles = new ProjectilePool();
  /** What can burn and what burns (forest fires). */
  readonly fire: FireGrid;
  /** Buildings and fortifications of the map (missions). */
  readonly props: Prop[] = [];
  /** Traps laid by sappers, waiting for an enemy. */
  readonly traps: Trap[] = [];
  /** Next id given to a trap. */
  nextTrap = 1;
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
    this.fire = new FireGrid(this.terrain);
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

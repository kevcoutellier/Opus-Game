import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, UnitState } from '../entities/Components';
import type { Terrain } from '../maps/Terrain';
import type { Attack, DamageSystem } from './DamageSystem';

/** Side of a fire cell (m). */
export const FIRE_CELL = 4;
/** Cells with less fuel (forest density) than this do not burn: open ground stops a fire. */
const MIN_FUEL = 0.12;
/** Seconds a cell full of trees burns. */
const BURN_SECONDS = 30;
/** Chance per second that a burning cell sets a neighbour full of trees ablaze. */
const SPREAD = 0.3;
/** The fire is updated every STEP seconds. */
const STEP = 0.5;
/** Damage per second taken by a soldier standing in a burning cell. */
const FIRE_DPS = 8;
/** Morale lost per second in the flames. */
const FIRE_FEAR = 6;

/**
 * Where the battlefield can burn and where it burns: the fuel of each 4 m cell comes from the density of
 * its trees. Pure data (the simulation writes it, the renderer reads it).
 */
export class FireGrid {
  readonly cols: number;
  readonly rows: number;
  /** 0..1 fuel left in each cell. */
  readonly fuel: Float32Array;
  /** Seconds each cell still burns, 0 when it does not. */
  readonly burning: Float32Array;
  readonly burnt: Uint8Array;
  /** Cells on fire. */
  readonly active = new Set<number>();
  /** Cells that caught fire during the last update, for the system to announce. */
  readonly ignited: number[] = [];

  constructor(terrain: Terrain) {
    this.cols = Math.ceil(terrain.size / FIRE_CELL);
    this.rows = this.cols;
    this.fuel = new Float32Array(this.cols * this.rows);
    this.burning = new Float32Array(this.cols * this.rows);
    this.burnt = new Uint8Array(this.cols * this.rows);
    for (let cz = 0; cz < this.rows; cz++) {
      for (let cx = 0; cx < this.cols; cx++) {
        let sum = 0;
        let n = 0;
        for (let z = cz * FIRE_CELL; z < (cz + 1) * FIRE_CELL; z++) {
          for (let x = cx * FIRE_CELL; x < (cx + 1) * FIRE_CELL; x++) {
            sum += terrain.forestAt(x + 0.5, z + 0.5);
            n++;
          }
        }
        this.fuel[cz * this.cols + cx] = n ? sum / n : 0;
      }
    }
  }

  cellAt(x: number, z: number): number {
    const cx = Math.floor(x / FIRE_CELL);
    const cz = Math.floor(z / FIRE_CELL);
    if (cx < 0 || cz < 0 || cx >= this.cols || cz >= this.rows) return -1;
    return cz * this.cols + cx;
  }

  centreX(cell: number): number {
    return ((cell % this.cols) + 0.5) * FIRE_CELL;
  }

  centreZ(cell: number): number {
    return (Math.floor(cell / this.cols) + 0.5) * FIRE_CELL;
  }

  canBurn(cell: number): boolean {
    return cell >= 0 && !this.burnt[cell] && this.burning[cell] === 0 && this.fuel[cell] >= MIN_FUEL;
  }

  isBurning(x: number, z: number): boolean {
    const cell = this.cellAt(x, z);
    return cell >= 0 && this.burning[cell] > 0;
  }

  /** Sets the trees within `radius` of (x, z) ablaze; returns how many cells caught fire. */
  ignite(x: number, z: number, radius: number): number {
    let n = 0;
    const r = Math.ceil(radius / FIRE_CELL);
    const cx = Math.floor(x / FIRE_CELL);
    const cz = Math.floor(z / FIRE_CELL);
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= this.cols || gz >= this.rows) continue;
        const cell = gz * this.cols + gx;
        if (Math.hypot(this.centreX(cell) - x, this.centreZ(cell) - z) > radius + FIRE_CELL * 0.5) continue;
        if (this.light(cell)) n++;
      }
    }
    return n;
  }

  /** One cell catches fire (false when it cannot burn). */
  light(cell: number): boolean {
    if (!this.canBurn(cell)) return false;
    this.burning[cell] = Math.max(STEP, BURN_SECONDS * this.fuel[cell]);
    this.active.add(cell);
    this.ignited.push(cell);
    return true;
  }
}

/**
 * Forest fires (The Crusaders: fire arrows and sappers set the woods ablaze). Burning cells spread the fire
 * to their wooded neighbours, burn out, and hurt and frighten every soldier standing in them.
 */
export class FireSystem implements System {
  readonly name = 'fire';
  private wait = 0;
  private readonly neighbours = new Int32Array(128);
  private readonly hits: Attack[] = [];

  constructor(private readonly damage: DamageSystem) {}

  update(world: World, dt: number): void {
    const fire = world.fire;
    this.announce(world);
    if (!fire.active.size) return;
    this.wait -= dt;
    if (this.wait > 0) return;
    this.wait = STEP;
    const { cols, rows } = fire;
    for (const cell of [...fire.active]) {
      fire.burning[cell] -= STEP;
      const cx = cell % cols;
      const cz = Math.floor(cell / cols);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const gx = cx + dx;
        const gz = cz + dz;
        if (gx < 0 || gz < 0 || gx >= cols || gz >= rows) continue;
        const next = gz * cols + gx;
        if (fire.canBurn(next) && world.rng.chance(SPREAD * STEP * fire.fuel[next])) fire.light(next);
      }
      this.burn(world, cell);
      if (fire.burning[cell] <= 0) {
        fire.burning[cell] = 0;
        fire.burnt[cell] = 1;
        fire.fuel[cell] = 0;
        fire.active.delete(cell);
        world.events.emit('fireCell', { cell, burning: false });
      }
    }
    this.announce(world);
    for (const hit of this.hits) if (world.c.state[hit.target] !== UnitState.Dying) this.damage.apply(world, hit);
    this.hits.length = 0;
  }

  /** Tells the renderer which cells caught fire. */
  private announce(world: World): void {
    const fire = world.fire;
    for (const cell of fire.ignited) world.events.emit('fireCell', { cell, burning: true });
    fire.ignited.length = 0;
  }

  /** Every soldier inside the cell is burnt and frightened. */
  private burn(world: World, cell: number): void {
    const { c, entities, spatial, fire } = world;
    const x = fire.centreX(cell);
    const z = fire.centreZ(cell);
    const n = spatial.query(x, z, FIRE_CELL * 0.75, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const u = this.neighbours[k];
      if (!(entities.mask[u] & Comp.Unit) || c.state[u] === UnitState.Dying || fire.cellAt(c.x[u], c.z[u]) !== cell) continue;
      c.morale[u] = Math.max(0, c.morale[u] - FIRE_FEAR * STEP * (1 - c.discipline[u] * 0.5));
      this.hits.push({
        attacker: -1,
        target: u,
        damage: FIRE_DPS * STEP,
        damageType: 'FIRE',
        timestamp: world.time.elapsed,
        x,
        z,
        ability: 'fire',
        missile: false,
        criticalChance: 0,
      });
    }
  }
}

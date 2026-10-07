import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { BUILDING_DEFS, BUILDING_INDEX } from '../data/buildings';
import { UNIT_DEFS, UNIT_INDEX } from '../data/units';
import { RESOURCE_TYPES, type Stock } from '../economy/Resources';
import { Comp, MoraleState, NO_ENTITY, Order, UnitState } from '../entities/Components';
import { spawnUnit } from '../units/UnitFactory';
import { ARMOR_TYPES } from '../units/UnitStats';
import type { BuildingDef } from './Building';

export const MAX_QUEUE = 5;
/** New buildings must stand this close (m) to a completed building of the team: its territory. */
export const TERRITORY_RADIUS = 42;
/** Largest height difference (m) across a footprint. */
const MAX_UNEVENNESS = 2.6;
/** Seconds a ruin stays before its entity is freed. */
const RUIN_SECONDS = 10;
/** A building under construction starts with this share of its health. */
const FOUNDATION_HEALTH = 0.1;

export const BUILDING_MASK = Comp.Transform | Comp.Health | Comp.Faction | Comp.Building;

export interface BuildingState {
  readonly id: number;
  readonly def: BuildingDef;
  readonly type: number;
  readonly team: number;
  /** Footprint along x and z once turned. */
  readonly width: number;
  readonly depth: number;
  /** Construction progress 0..1. */
  progress: number;
  complete: boolean;
  /** Unit ids waiting to be trained; the first one is in training. */
  readonly queue: string[];
  /** Seconds spent on the first unit of the queue. */
  training: number;
  rallyX: number;
  rallyZ: number;
  /** Navigation cells it blocks. */
  cells: number[];
  destroyed: boolean;
  ruinTime: number;
}

/** Turns are snapped to quarter turns: footprints stay aligned with the navigation grid. */
export function snapRotation(rot: number): number {
  return Math.round(rot / (Math.PI / 2)) * (Math.PI / 2);
}

function footprint(def: BuildingDef, rot: number): { width: number; depth: number } {
  const quarter = Math.round(rot / (Math.PI / 2));
  return quarter % 2 === 0 ? { width: def.width, depth: def.depth } : { width: def.depth, depth: def.width };
}

/**
 * Buildings: foundations laid by a `build` command (validated: territory, ground, room, requirements,
 * cost), construction over time, income, production queues with rally points, destruction. A building
 * blocks the navigation grid under its footprint while it stands.
 */
export class BuildingSystem implements System {
  readonly name = 'buildings';
  private readonly states = new Map<number, BuildingState>();
  private readonly neighbours = new Int32Array(128);

  constructor(private readonly world: World) {
    const q = world.commands;
    q.on('build', (cmd) => {
      const type = BUILDING_INDEX.get(cmd.building);
      if (type === undefined) return;
      const def = BUILDING_DEFS[type];
      const rot = snapRotation(cmd.rot);
      if (this.placementError(cmd.team, type, cmd.x, cmd.z, rot) !== null) return;
      if (!world.resources.spend(cmd.team, def.cost)) return;
      this.place(type, cmd.team, cmd.x, cmd.z, rot, false);
    });
    q.on('train', (cmd) => {
      const b = this.own(cmd.team, cmd.building);
      const unit = UNIT_INDEX.get(cmd.unit);
      if (!b || unit === undefined || !b.complete || !b.def.trains.includes(cmd.unit) || b.queue.length >= MAX_QUEUE) return;
      if (!world.resources.spend(cmd.team, UNIT_DEFS[unit].cost)) return;
      b.queue.push(cmd.unit);
    });
    q.on('cancelTrain', (cmd) => {
      const b = this.own(cmd.team, cmd.building);
      if (!b || cmd.index < 0 || cmd.index >= b.queue.length) return;
      const [unit] = b.queue.splice(cmd.index, 1);
      world.resources.refund(cmd.team, UNIT_DEFS[UNIT_INDEX.get(unit)!].cost);
      if (cmd.index === 0) b.training = 0;
    });
    q.on('rally', (cmd) => {
      const b = this.own(cmd.team, cmd.building);
      if (!b) return;
      b.rallyX = Math.min(world.size - 3, Math.max(3, cmd.x));
      b.rallyZ = Math.min(world.size - 3, Math.max(3, cmd.z));
    });
    world.events.on('buildingDestroyed', ({ id }) => {
      const b = this.states.get(id);
      if (!b || b.destroyed) return;
      b.destroyed = true;
      b.queue.length = 0;
      world.nav.release(b.cells);
      b.cells = [];
      const i = world.buildings.indexOf(id);
      if (i >= 0) world.buildings.splice(i, 1);
    });
  }

  get(id: number): BuildingState | undefined {
    return this.states.get(id);
  }

  /** Standing buildings of a team (all teams when omitted). */
  list(team?: number): BuildingState[] {
    return [...this.states.values()].filter((b) => !b.destroyed && (team === undefined || b.team === team));
  }

  private own(team: number, id: number): BuildingState | null {
    const b = this.states.get(id);
    return b && !b.destroyed && b.team === team ? b : null;
  }

  /** Whether the headquarters of a team still stands. */
  hasHeadquarters(team: number): boolean {
    for (const b of this.states.values()) if (!b.destroyed && b.def.hq && b.team === team) return true;
    return false;
  }

  /** Whether a team owns a completed building of this definition. */
  owns(team: number, buildingId: string): boolean {
    for (const b of this.states.values()) if (!b.destroyed && b.complete && b.team === team && b.def.id === buildingId) return true;
    return false;
  }

  /**
   * Why a building cannot be laid there (text for the player), or null when it can. Checks the rules
   * of the `build` command: not a headquarters, requirements, territory, ground, room.
   */
  placementError(team: number, type: number, x: number, z: number, rot: number): string | null {
    const { world } = this;
    const def = BUILDING_DEFS[type];
    if (def.hq) return 'Le quartier général ne se construit pas.';
    for (const req of def.requires) {
      if (!this.owns(team, req)) return `Nécessite : ${BUILDING_DEFS[BUILDING_INDEX.get(req)!].name}`;
    }
    const { width, depth } = footprint(def, rot);
    const margin = 4;
    if (x - width / 2 < margin || z - depth / 2 < margin || x + width / 2 > world.size - margin || z + depth / 2 > world.size - margin) {
      return 'Hors de la carte';
    }
    let inTerritory = false;
    for (const b of this.states.values()) {
      if (!b.destroyed && b.complete && b.team === team && Math.hypot(world.c.x[b.id] - x, world.c.z[b.id] - z) <= TERRITORY_RADIUS) {
        inTerritory = true;
        break;
      }
    }
    if (!inTerritory) return 'Hors de votre territoire';
    for (const cell of world.nav.cellsInRect(x, z, width, depth)) if (world.nav.blocked[cell]) return 'Terrain impraticable';
    let low = Infinity;
    let high = -Infinity;
    for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) {
      const h = world.terrain.heightAt(x + (dx * width) / 2, z + (dz * depth) / 2);
      low = Math.min(low, h);
      high = Math.max(high, h);
    }
    if (high - low > MAX_UNEVENNESS) return 'Terrain trop pentu';
    const { c, spatial, entities } = world;
    const n = spatial.query(x, z, Math.hypot(width, depth) / 2 + 1.5, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const u = this.neighbours[k];
      if (!(entities.mask[u] & Comp.Unit) || c.state[u] === UnitState.Dying) continue;
      if (Math.abs(c.x[u] - x) < width / 2 + c.radius[u] && Math.abs(c.z[u] - z) < depth / 2 + c.radius[u]) return 'Des soldats sont sur l’emplacement';
    }
    return null;
  }

  /** Creates a building (scenario: already complete; `build` command: foundations). */
  place(type: number, team: number, x: number, z: number, rot: number, complete: boolean): number {
    const { world } = this;
    const def = BUILDING_DEFS[type];
    rot = snapRotation(rot);
    const { width, depth } = footprint(def, rot);
    const id = world.entities.create(BUILDING_MASK);
    const c = world.c;
    c.x[id] = c.prevX[id] = c.slotX[id] = x;
    c.z[id] = c.prevZ[id] = c.slotZ[id] = z;
    c.rot[id] = c.prevRot[id] = rot;
    c.vx[id] = c.vz[id] = 0;
    c.maxSpeed[id] = 0;
    c.radius[id] = Math.min(width, depth) / 2;
    c.halfW[id] = width / 2;
    c.halfD[id] = depth / 2;
    c.mass[id] = 1e6;
    c.maxHp[id] = def.health;
    c.hp[id] = complete ? def.health : def.health * FOUNDATION_HEALTH;
    c.defense[id] = def.defense;
    c.defenseBonus[id] = 0;
    c.armorType[id] = ARMOR_TYPES.indexOf('STRUCTURE');
    c.shield[id] = 0;
    c.invulnerable[id] = 0;
    c.stun[id] = 0;
    c.frozen[id] = 0;
    c.lastHit[id] = 99;
    c.morale[id] = 100;
    c.moraleState[id] = MoraleState.Normal;
    c.discipline[id] = 1;
    c.team[id] = team;
    c.target[id] = NO_ENTITY;
    c.formation[id] = NO_ENTITY;
    c.state[id] = UnitState.Idle;
    c.stateTime[id] = 0;
    c.order[id] = Order.Hold;
    c.auraRadius[id] = 0;
    c.chargePower[id] = 0;
    // Rally in front of the door: along +z of the model, turned by rot.
    const front = def.depth / 2 + 7;
    const b: BuildingState = {
      id,
      def,
      type,
      team,
      width,
      depth,
      progress: complete ? 1 : 0,
      complete,
      queue: [],
      training: 0,
      rallyX: x + Math.sin(rot) * front,
      rallyZ: z + Math.cos(rot) * front,
      cells: world.nav.occupy(world.nav.cellsInRect(x, z, width, depth)),
      destroyed: false,
      ruinTime: 0,
    };
    this.states.set(id, b);
    world.buildings.push(id);
    world.events.emit('buildingPlaced', { id, team, type });
    if (complete) world.events.emit('buildingCompleted', { id, team });
    return id;
  }

  update(world: World, dt: number): void {
    const { c } = world;
    const rates: Stock[] = [0, 1].map(() => ({ gold: 0, wood: 0, food: 0, stone: 0, mana: 0 }));
    for (const b of [...this.states.values()]) {
      if (b.destroyed) {
        b.ruinTime += dt;
        if (b.ruinTime >= RUIN_SECONDS) {
          world.entities.destroyLater(b.id);
          this.states.delete(b.id);
        }
        continue;
      }
      if (!b.complete) {
        const step = dt / b.def.buildTime;
        b.progress = Math.min(1, b.progress + step);
        c.hp[b.id] = Math.min(c.maxHp[b.id], c.hp[b.id] + c.maxHp[b.id] * (1 - FOUNDATION_HEALTH) * step);
        if (b.progress >= 1) {
          b.complete = true;
          world.events.emit('buildingCompleted', { id: b.id, team: b.team });
        }
        continue;
      }
      const rate = rates[b.team];
      if (rate) {
        for (const type of RESOURCE_TYPES) {
          const amount = b.def.income[type] ?? 0;
          if (!amount) continue;
          rate[type] += amount;
          world.resources.add(b.team, type, amount * dt);
        }
      }
      if (b.queue.length) {
        b.training += dt;
        const unit = UNIT_INDEX.get(b.queue[0])!;
        if (b.training >= UNIT_DEFS[unit].trainTime) {
          b.queue.shift();
          b.training = 0;
          this.release(world, b, unit);
        }
      }
    }
    rates.forEach((rate, team) => world.resources.setRate(team, rate));
  }

  /** A trained soldier walks out of the door and marches to the rally point, ready to fight. */
  private release(world: World, b: BuildingState, unit: number): void {
    const rot = world.c.rot[b.id];
    const reach = b.def.depth / 2 + 1.6;
    let x = world.c.x[b.id] + Math.sin(rot) * reach;
    let z = world.c.z[b.id] + Math.cos(rot) * reach;
    if (world.nav.isBlockedAt(x, z)) {
      const cell = world.nav.nearestWalkable(world.nav.cellAt(x, z));
      x = world.nav.centerX(cell);
      z = world.nav.centerZ(cell);
    }
    const id = spawnUnit(world, unit, b.team, x, z, rot);
    world.commands.push({
      kind: 'formationMove',
      team: b.team,
      units: [id],
      x: b.rallyX,
      z: b.rallyZ,
      facing: rot,
      width: null,
      formation: null,
      attackMove: true,
    });
    world.events.emit('unitTrained', { id, building: b.id });
  }
}

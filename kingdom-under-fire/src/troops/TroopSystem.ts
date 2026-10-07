import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { ability } from '../data/abilities';
import { officer } from '../data/officers';
import { UNIT_DEFS, unitIndex } from '../data/units';
import { Comp, MoraleState, NO_ENTITY, Order, UnitState } from '../entities/Components';
import type { Formation } from '../formations/Formation';
import type { FormationManager } from '../formations/FormationManager';
import type { FormationType } from '../formations/FormationType';
import type { AbilityDef } from '../heroes/Ability';
import type { HeroSystem } from '../heroes/HeroSystem';
import { spawnBlock, spawnUnit } from '../units/UnitFactory';

export type TroopStatus = 'idle' | 'moving' | 'fighting' | 'routing' | 'defeated';

/**
 * A troop (regiment), the unit the player commands in Kingdom Under Fire: The Crusaders. Its soldiers move
 * and fight together around their leader, a hero or a captain.
 */
export interface Troop {
  readonly id: number;
  readonly team: number;
  readonly name: string;
  /** Unit definition of its soldiers. */
  readonly soldierType: string;
  readonly leader: number;
  /** Led by a hero (the player's own troop, or an enemy hero's). */
  readonly hero: boolean;
  /** Who gives its orders: the player, or an AI (the enemy, and the player's allies until they join him). */
  controller: 'player' | 'ai';
  /** Soldiers still on the field, the leader included. */
  members: number[];
  readonly initialSize: number;
  /** Points still to reach, in order; the first is the current destination. */
  readonly waypoints: { x: number; z: number }[];
  status: TroopStatus;
  /** Seconds since the troop began to flee (routing). */
  routTime: number;
  /** Special points of the troop, earned by fighting (a hero's troop uses its hero's). */
  sp: number;
  readonly maxSp: number;
  /** Skills of its soldiers (none for a hero's troop: they are the hero's abilities). */
  readonly skills: readonly AbilityDef[];
  /** Seconds before each skill can be used again. */
  readonly cooldowns: number[];
  /** Skill being prepared. */
  casting: { slot: number; x: number; z: number; remaining: number } | null;
}

export type SkillBlock = 'none' | 'broken' | 'casting' | 'cooldown' | 'sp' | null;

export interface TroopSpec {
  team: number;
  name: string;
  /** Unit definition of the soldiers. */
  soldierType: string;
  /** Soldiers besides the leader. */
  count: number;
  /** An existing unit (a hero) that leads the troop; otherwise a captain of the soldiers' type is raised. */
  leader?: number;
  x: number;
  z: number;
  /** Direction the troop faces (radians). */
  facing: number;
  formation?: FormationType;
  columns?: number;
  /** Who gives its orders (an AI by default). */
  controller?: 'player' | 'ai';
}

/** A captain is a seasoned soldier of the troop's type: much tougher, steadier and harder-hitting. */
const CAPTAIN = { health: 5, attack: 1.4, defense: 6 };
/** The officers of a hero's troop are seasoned too, a little less than a captain. */
const OFFICER = { health: 3, attack: 1.3, defense: 4 };
/** Routed soldiers leave the field once no enemy has been near them for this long. */
const LEAVE_SECONDS = 6;
const LEAVE_SAFE_RADIUS = 16;
/** Troops sent together stand this far apart (m). */
const TROOP_GAP = 16;
/** A waypoint counts as reached within this distance of the troop's anchor. */
const WAYPOINT_RADIUS = 4;
/** How far behind the hero his troop marches when he is steered by the player. */
const ESCORT_DISTANCE = 3.5;
/** SP of a troop: its gauge, what it starts with, and what its soldiers earn by fighting. */
const TROOP_SP = 1000;
const TROOP_SP_START = 100;
const SP_PER_HIT = 1;
const SP_PER_KILL = 5;
const SP_PER_LEADER = 25;

/**
 * Troops: creation (soldiers around a leader, one formation), orders (march with waypoints, attack an enemy
 * troop, hold, formation, the whole army at once), the troop escorting its hero when the player steers him,
 * and the fall of a leader. That last rule is a reconstruction (see docs/CRUSADERS.md): a troop whose
 * leader dies breaks; its soldiers flee and leave the field.
 */
export class TroopSystem implements System {
  readonly name = 'troops';
  private readonly troops = new Map<number, Troop>();
  private nextId = 1;
  private readonly neighbours = new Int32Array(64);
  /** Heroes of the battle: a hero's troop earns and spends its hero's SP (set by the factory). */
  heroes: HeroSystem | null = null;

  constructor(
    private readonly world: World,
    private readonly formations: FormationManager,
  ) {
    const q = world.commands;
    q.on('troopMove', (cmd) => {
      const t = this.commandable(cmd.team, cmd.troop);
      if (!t) return;
      if (!cmd.queue) t.waypoints.length = 0;
      t.waypoints.push({ x: cmd.x, z: cmd.z });
      if (!cmd.queue || t.waypoints.length === 1) this.march(t, cmd.x, cmd.z, null);
    });
    q.on('troopAttack', (cmd) => {
      const t = this.commandable(cmd.team, cmd.troop);
      const target = this.troops.get(cmd.target);
      if (!t || !target || target.team === t.team || target.status === 'defeated') return;
      const f = this.formationOf(t);
      const victim = this.alive(target.leader) ? target.leader : target.members.find((m) => this.alive(m));
      if (!f || victim === undefined) return;
      t.waypoints.length = 0;
      this.formations.orderAttack(f, victim);
    });
    q.on('troopHold', (cmd) => {
      const t = this.commandable(cmd.team, cmd.troop);
      const f = t && this.formationOf(t);
      if (!t || !f) return;
      t.waypoints.length = 0;
      this.formations.orderHold(f);
    });
    q.on('troopFormation', (cmd) => {
      const t = this.commandable(cmd.team, cmd.troop);
      const f = t && this.formationOf(t);
      if (f) this.formations.setType(f, cmd.formation);
    });
    q.on('troopsMoveAll', (cmd) => this.moveAll(cmd.team, cmd.x, cmd.z));
    q.on('troopSkill', (cmd) => {
      const t = this.commandable(cmd.team, cmd.troop);
      if (t) this.useSkill(t, cmd.slot, cmd.x, cmd.z);
    });
    // SP come from the fight: every blow or arrow that lands, more for a kill, much more for a leader.
    world.events.on('unitHit', ({ attack, killed }) => {
      const a = attack.attacker;
      const t = a >= 0 ? this.troops.get(world.c.troop[a]) : undefined;
      if (!t) return;
      const gain = SP_PER_HIT + (killed ? (world.c.leader[attack.target] ? SP_PER_LEADER : SP_PER_KILL) : 0);
      if (!t.hero) {
        t.sp = Math.min(t.maxSp, t.sp + gain);
        return;
      }
      // The hero's soldiers fill his gauge (his own blows are counted by the HeroSystem).
      const h = a !== t.leader ? this.heroes?.get(t.leader) : undefined;
      if (h?.alive) h.sp = Math.min(h.maxSp, h.sp + gain);
    });
    world.events.on('unitDied', ({ id }) => {
      const t = this.troops.get(world.c.troop[id]);
      if (t && t.leader === id && t.status !== 'routing' && t.status !== 'defeated') this.rout(t);
    });
    // The player takes or gives back his hero: the troop escorts him, then takes him back in its ranks.
    world.events.on('heroControl', ({ id, direct }) => {
      const t = this.troops.get(world.c.troop[id]);
      if (!t || direct) return;
      const f = formations.assemble(t.team, this.fighting(t));
      if (f) formations.orderMove(f, world.c.x[id], world.c.z[id], world.c.rot[id], true);
    });
  }

  get(id: number): Troop | undefined {
    return this.troops.get(id);
  }

  /** Troops of a team (all teams when omitted), defeated ones included unless `standing`; `controller` filters. */
  list(team?: number, standing = false, controller?: 'player' | 'ai'): Troop[] {
    return [...this.troops.values()].filter(
      (t) =>
        (team === undefined || t.team === team) &&
        (!standing || (t.status !== 'defeated' && t.status !== 'routing')) &&
        (controller === undefined || t.controller === controller),
    );
  }

  /** Troop of a unit, or undefined. */
  of(unit: number): Troop | undefined {
    return this.troops.get(this.world.c.troop[unit]);
  }

  /** Raises a troop: its soldiers in a block, the leader in front, all in one formation. */
  create(spec: TroopSpec): Troop {
    const { world } = this;
    const { c } = world;
    const type = unitIndex(spec.soldierType);
    const columns = spec.columns ?? Math.min(spec.count, Math.max(4, Math.ceil(Math.sqrt(spec.count * 2))));
    const rows = Math.ceil(spec.count / columns);
    const soldiers = spawnBlock(world, type, spec.team, spec.count, columns, spec.x, spec.z, spec.facing);
    // The leader stands in front of the centre of his men.
    const ahead = (rows * 1.6) / 2 + 1.8;
    const lx = spec.x + Math.sin(spec.facing) * ahead;
    const lz = spec.z + Math.cos(spec.facing) * ahead;
    const seasoned = (id: number, boost: { health: number; attack: number; defense: number }) => {
      c.maxHp[id] *= boost.health;
      c.hp[id] = c.maxHp[id];
      c.attack[id] *= boost.attack;
      c.defense[id] += boost.defense;
      c.discipline[id] = 1;
      c.morale[id] = 100;
    };
    let leader = spec.leader ?? NO_ENTITY;
    if (leader === NO_ENTITY) {
      leader = spawnUnit(world, type, spec.team, lx, lz, spec.facing);
      seasoned(leader, CAPTAIN);
    } else {
      c.x[leader] = c.prevX[leader] = lx;
      c.z[leader] = c.prevZ[leader] = lz;
      c.rot[leader] = c.prevRot[leader] = spec.facing;
    }
    // A hero's troop is the only one with officers: they stand on either side of him.
    const officers: number[] = [];
    const heroDef = UNIT_DEFS[c.unitType[leader]].hero;
    (heroDef?.officers ?? []).forEach((name, slot) => {
      const side = slot === 0 ? -1.8 : 1.8;
      const ox = lx + Math.cos(spec.facing) * side;
      const oz = lz - Math.sin(spec.facing) * side;
      const id = spawnUnit(world, unitIndex(officer(name).unit), spec.team, ox, oz, spec.facing);
      seasoned(id, OFFICER);
      c.officer[id] = slot + 1;
      officers.push(id);
    });
    const troop: Troop = {
      id: this.nextId++,
      team: spec.team,
      name: spec.name,
      soldierType: spec.soldierType,
      leader,
      hero: UNIT_DEFS[c.unitType[leader]].role === 'hero',
      controller: spec.controller ?? 'ai',
      members: [leader, ...officers, ...soldiers],
      initialSize: soldiers.length + officers.length + 1,
      waypoints: [],
      status: 'idle',
      routTime: 0,
      sp: TROOP_SP_START,
      maxSp: TROOP_SP,
      skills: heroDef ? [] : UNIT_DEFS[type].skills.map(ability),
      cooldowns: heroDef ? [] : UNIT_DEFS[type].skills.map(() => 0),
      casting: null,
    };
    for (const id of troop.members) c.troop[id] = troop.id;
    c.leader[leader] = 1;
    this.troops.set(troop.id, troop);
    officers.forEach((id, slot) => world.events.emit('officerJoined', { hero: leader, unit: id, slot, officer: heroDef!.officers[slot] }));
    // At rest the formation defends (it answers enemies coming at it), facing the given way.
    const f = this.formations.assemble(spec.team, troop.members, spec.formation ?? 'LINE');
    if (f) {
      f.facing = spec.facing;
      f.forceSolve = true;
    }
    return troop;
  }

  update(world: World, dt: number): void {
    const { c } = world;
    for (const t of this.troops.values()) {
      if (t.status === 'defeated') continue;
      t.members = t.members.filter((id) => this.alive(id));
      if (!t.members.length) {
        t.status = 'defeated';
        world.events.emit('troopDefeated', { troop: t.id, team: t.team });
        continue;
      }
      if (t.status === 'routing') {
        t.casting = null;
        this.flee(world, t, dt);
        continue;
      }
      for (let k = 0; k < t.cooldowns.length; k++) t.cooldowns[k] = Math.max(0, t.cooldowns[k] - dt);
      if (t.casting && (t.casting.remaining -= dt) <= 0) this.release(world, t);
      const f = this.formationOf(t);
      const leader = t.leader;
      if (t.hero && this.alive(leader) && c.order[leader] === Order.Direct && f) {
        // Escorting the hero steered by the player: a little behind him, facing where he faces.
        const rot = c.rot[leader];
        this.formations.follow(f, c.x[leader] - Math.sin(rot) * ESCORT_DISTANCE, c.z[leader] - Math.cos(rot) * ESCORT_DISTANCE, rot);
      } else if (f && t.waypoints.length && !f.moving && Math.hypot(f.anchorX - t.waypoints[0].x, f.anchorZ - t.waypoints[0].z) < WAYPOINT_RADIUS) {
        t.waypoints.shift();
        const next = t.waypoints[0];
        if (next) this.march(t, next.x, next.z, null);
      }
      let fighting = false;
      for (const id of t.members) {
        const s = c.state[id];
        if (s === UnitState.Engaging || s === UnitState.Attacking) fighting = true;
      }
      t.status = fighting ? 'fighting' : f?.moving ? 'moving' : 'idle';
    }
  }

  /** SP the troop can spend (its hero's for a hero's troop). */
  spOf(t: Troop): number {
    return t.hero ? (this.heroes?.get(t.leader)?.sp ?? 0) : t.sp;
  }

  /** Why the troop cannot use skill `slot` now, or null when it can. */
  skillBlocked(t: Troop, slot: number): SkillBlock {
    const a = t.skills[slot];
    if (!a) return 'none';
    if (t.status === 'routing' || t.status === 'defeated') return 'broken';
    if (t.casting) return 'casting';
    if (t.cooldowns[slot] > 0) return 'cooldown';
    if (t.sp < a.spCost) return 'sp';
    return null;
  }

  /** The troop prepares a skill (aimed skills: at the ground point, within its range of the leader). */
  private useSkill(t: Troop, slot: number, x: number, z: number): void {
    if (this.skillBlocked(t, slot)) return;
    const { c, events } = this.world;
    const a = t.skills[slot];
    const lx = c.x[t.leader];
    const lz = c.z[t.leader];
    if (a.targeting === 'point') {
      const d = Math.hypot(x - lx, z - lz);
      if (d > a.range) {
        x = lx + ((x - lx) / d) * a.range;
        z = lz + ((z - lz) / d) * a.range;
      }
    } else {
      x = lx;
      z = lz;
    }
    t.sp -= a.spCost;
    t.cooldowns[slot] = a.cooldown;
    t.casting = { slot, x, z, remaining: a.castTime };
    events.emit('troopSkillStarted', { troop: t.id, team: t.team, skill: a.id, x, z });
  }

  /** The skill takes effect, cast by the leader (or by a soldier when he is gone). */
  private release(world: World, t: Troop): void {
    const cast = t.casting!;
    t.casting = null;
    const caster = this.alive(t.leader) ? t.leader : t.members.find((id) => this.alive(id));
    if (caster === undefined || !this.heroes) return;
    const a = t.skills[cast.slot];
    const { c } = world;
    const x = a.targeting === 'self' ? c.x[caster] : cast.x;
    const z = a.targeting === 'self' ? c.z[caster] : cast.z;
    for (const e of a.effects) this.heroes.applyEffect(world, caster, t.team, a.id, e, x, z, 1);
    world.events.emit('abilityCast', { hero: caster, ability: a.id, x, z, color: a.color });
  }

  private alive(id: number): boolean {
    const { entities, c } = this.world;
    return id >= 0 && entities.has(id, Comp.Unit) && c.state[id] !== UnitState.Dying;
  }

  /** Members that march and fight with the formation (a hero steered by the player does his own). */
  private fighting(t: Troop): number[] {
    return t.members.filter((id) => this.world.c.order[id] !== Order.Direct);
  }

  /** The troop's formation; gathered again when members strayed from it (a hero handed back). */
  private formationOf(t: Troop): Formation | null {
    const { c } = this.world;
    const members = this.fighting(t);
    if (!members.length) return null;
    const id = c.formation[members[0]];
    const f = this.formations.get(id);
    if (f && members.every((m) => c.formation[m] === id)) return f;
    return this.formations.assemble(t.team, members);
  }

  private commandable(team: number, id: number): Troop | null {
    const t = this.troops.get(id);
    return t && t.team === team && t.status !== 'routing' && t.status !== 'defeated' ? t : null;
  }

  private march(t: Troop, x: number, z: number, facing: number | null): void {
    const f = this.formationOf(t);
    if (f) this.formations.orderMove(f, x, z, facing, true);
  }

  /** The whole army marches to (x, z), its troops side by side across the direction of march. */
  private moveAll(team: number, x: number, z: number): void {
    const troops = this.list(team, true, 'player');
    if (!troops.length) return;
    const { c } = this.world;
    let cx = 0;
    let cz = 0;
    for (const t of troops) {
      cx += c.x[t.leader];
      cz += c.z[t.leader];
    }
    cx /= troops.length;
    cz /= troops.length;
    const len = Math.hypot(x - cx, z - cz);
    const dx = len > 1 ? (x - cx) / len : 0;
    const dz = len > 1 ? (z - cz) / len : 1;
    // Across the march: the troop furthest to the left keeps the left.
    const lx = dz;
    const lz = -dx;
    troops.sort((a, b) => (c.x[a.leader] - cx) * lx + (c.z[a.leader] - cz) * lz - ((c.x[b.leader] - cx) * lx + (c.z[b.leader] - cz) * lz));
    const facing = Math.atan2(dx, dz);
    troops.forEach((t, i) => {
      const offset = (i - (troops.length - 1) / 2) * TROOP_GAP;
      const px = x + lx * offset;
      const pz = z + lz * offset;
      t.waypoints.length = 0;
      t.waypoints.push({ x: px, z: pz });
      this.march(t, px, pz, facing);
    });
  }

  /** The leader fell: every soldier of the troop breaks and runs. */
  private rout(t: Troop): void {
    const { c, events } = this.world;
    t.status = 'routing';
    t.routTime = 0;
    t.waypoints.length = 0;
    for (const id of t.members) {
      c.morale[id] = 0;
      c.discipline[id] = 0;
      c.target[id] = NO_ENTITY;
    }
    events.emit('troopRouted', { troop: t.id, team: t.team });
  }

  /** Fleeing soldiers never rally; once out of the enemy's reach for a while, they leave the field. */
  private flee(world: World, t: Troop, dt: number): void {
    const { c, spatial, entities } = world;
    t.routTime += dt;
    const check = (world.time.tick + t.id) % 15 === 0;
    for (const id of t.members) {
      c.morale[id] = 0;
      if (!check || t.routTime < LEAVE_SECONDS || c.moraleState[id] !== MoraleState.Routing) continue;
      const n = spatial.query(c.x[id], c.z[id], LEAVE_SAFE_RADIUS, c.x, c.z, this.neighbours);
      let threatened = false;
      for (let k = 0; k < n && !threatened; k++) {
        const e = this.neighbours[k];
        threatened = c.team[e] !== t.team && c.state[e] !== UnitState.Dying;
      }
      if (!threatened) entities.destroyLater(id);
    }
  }
}

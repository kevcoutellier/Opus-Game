import type { Attack, DamageSystem } from '../combat/DamageSystem';
import { launchSpell } from '../combat/Projectiles';
import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { ability } from '../data/abilities';
import { officer as officerDef } from '../data/officers';
import { UNIT_DEFS } from '../data/units';
import { Comp, NO_ENTITY, Order, SwingKind, UnitState } from '../entities/Components';
import type { FormationManager } from '../formations/FormationManager';
import { IMPACT_FRACTION } from '../units/Unit';
import { DAMAGE_TYPES } from '../units/UnitStats';
import type { AbilityDef, Effect } from './Ability';
import { move, nextMove, type Button, type MoveDef, type MoveId } from './Moves';
import { ASSIST_SP, type OfficerDef } from './Officer';

export const MAX_LEVEL = 10;
/** Share of the experience of a kill given to allied heroes nearby who did not strike it. */
const ARMY_XP_SHARE = 0.4;
const ARMY_XP_RADIUS = 25;
const DODGE_SPEED = 10;
const DODGE_SECONDS = 0.32;
const DODGE_COOLDOWN = 1.2;
/** Share of his SP a hero has when the battle starts. */
const SP_START = 1 / 3;
/** SP earned by fighting (The Crusaders: SP are not regenerated, they come from the fight). */
const SP_PER_HIT = 3;
const SP_PER_KILL = 10;
const SP_PER_LEADER = 40;
const SP_PER_HERO = 80;
/** B counters an enemy blow that lands within this many seconds. */
const COUNTER_WINDOW = 0.45;
/** B pushes the enemies away when the hero was hit this recently (s)... */
const REPEL_WINDOW = 0.6;
/** ...at most once in this many seconds. */
const REPEL_COOLDOWN = 4;
/** The combo counter falls back to zero after this long without a hit. */
const COMBO_SECONDS = 2.5;
/** Animation of each move style (Components.swingStyle). */
const STYLE_CODE = { swing: 1, thrust: 2, spin: 3 } as const;
/** How far ahead of the hero an officer aims his assist (m). */
const ASSIST_AHEAD = 8;

/** Total experience needed to reach `level` (level 1 = 0). */
export function xpForLevel(level: number): number {
  return 50 * level * (level - 1);
}

export interface HeroState {
  readonly id: number;
  readonly team: number;
  readonly name: string;
  /** Lore character (portrait). */
  readonly character: string;
  readonly abilities: readonly AbilityDef[];
  /** Seconds before each ability can be cast again. */
  readonly cooldowns: number[];
  level: number;
  xp: number;
  /** Special points, earned by fighting and spent on abilities, the Smash and the officers' assists. */
  sp: number;
  maxSp: number;
  alive: boolean;
  /** Under the player's direct third-person control (action mode). */
  direct: boolean;
  dodgeCooldown: number;
  repelCooldown: number;
  casting: { slot: number; x: number; z: number; remaining: number } | null;
  /** Move being performed in action mode. */
  move: { def: MoveDef; t: number; struck: boolean; victim: number } | null;
  /** A button pressed during the move, waiting for the moment it can follow it. */
  buffer: { button: Button; x: number; z: number; aim: number } | null;
  /** The player's stick (world space). */
  stickX: number;
  stickZ: number;
  /** Enemies struck by the current string of moves, and seconds since the last one. */
  combo: number;
  comboTime: number;
  /** Last move started, and when (simulation time). */
  lastMove: MoveId | null;
  lastMoveAt: number;
  /** Officers of his troop, by slot (0: X + A, 1: B + Y), null when absent. */
  officers: ({ def: OfficerDef; unit: number } | null)[];
}

export type AssistBlock = 'none' | 'dead' | 'sp' | 'stunned' | null;

interface Buff {
  target: number;
  source: string;
  damage: number;
  haste: number;
  defense: number;
  remaining: number;
}

/**
 * Heroes: SP, abilities (cast time, cooldowns, effects), experience and levels, buffs, frozen and stunned
 * soldiers, and the hero steered by the player in action mode: his moves (weak and strong combos, thrust,
 * special attack and Smash, counter-attack, knockback, dodge roll) and the assist attacks of his officers.
 * Everything goes through commands, like the orders given to troops.
 */
export class HeroSystem implements System {
  readonly name = 'heroes';
  private readonly heroes = new Map<number, HeroState>();
  private buffs: Buff[] = [];
  private readonly buffed = new Set<number>();
  private readonly neighbours = new Int32Array(256);
  private readonly hits: Attack[] = [];

  constructor(
    world: World,
    private readonly damage: DamageSystem,
    private readonly formations: FormationManager,
  ) {
    // Heroes deployed before the simulation was built, then every new one.
    for (let i = 0; i < world.entities.count; i++) {
      const id = world.entities.dense[i];
      if (world.c.auraRadius[id] > 0 && world.c.state[id] !== UnitState.Dying) this.register(world, id);
    }
    world.events.on('unitSpawned', ({ id }) => {
      if (world.c.auraRadius[id] > 0) this.register(world, id);
    });
    world.events.on('unitDied', (e) => this.onDeath(world, e.id, e.killer, e.x, e.z, e.team));
    const q = world.commands;
    q.on('cast', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (h) this.cast(world, h, cmd.slot, cmd.x, cmd.z);
    });
    q.on('heroControl', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (h) this.control(world, h, cmd.direct);
    });
    q.on('heroSteer', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (!h?.direct) return;
      const len = Math.hypot(cmd.x, cmd.z);
      const scale = len > 1 ? 1 / len : 1;
      h.stickX = cmd.x * scale;
      h.stickZ = cmd.z * scale;
      world.c.slotRot[h.id] = cmd.aim;
    });
    q.on('heroButton', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (h) this.press(world, h, cmd.button, cmd.x, cmd.z, cmd.aim);
    });
    q.on('officerAssist', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (h) this.assist(world, h, cmd.slot);
    });
    // SP come from the fight: every blow a hero lands, every enemy he kills (more for a leader or a hero).
    world.events.on('unitHit', ({ attack, killed }) => {
      const h = this.heroes.get(attack.attacker);
      if (!h?.alive) return;
      const t = attack.target;
      let gain = attack.ability === null ? SP_PER_HIT : 0;
      if (killed) gain += world.c.auraRadius[t] > 0 ? SP_PER_HERO : world.c.leader[t] ? SP_PER_LEADER : SP_PER_KILL;
      h.sp = Math.min(h.maxSp, h.sp + gain);
    });
    world.events.on('officerJoined', ({ hero, unit, slot, officer }) => {
      const h = this.heroes.get(hero);
      if (h) h.officers[slot] = { def: officerDef(officer), unit };
    });
  }

  get(id: number): HeroState | undefined {
    return this.heroes.get(id);
  }

  /** Living heroes of a team (all teams when omitted). */
  list(team?: number): HeroState[] {
    return [...this.heroes.values()].filter((h) => h.alive && (team === undefined || h.team === team));
  }

  private own(team: number, id: number): HeroState | null {
    const h = this.heroes.get(id);
    return h && h.alive && h.team === team ? h : null;
  }

  update(world: World, dt: number): void {
    const { entities, c } = world;
    // Statuses of every soldier; new heroes are picked up here (spawned by any scene or building).
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if (!(entities.mask[id] & Comp.Unit)) continue;
      if (c.stun[id] > 0) c.stun[id] = Math.max(0, c.stun[id] - dt);
      if (c.invulnerable[id] > 0) c.invulnerable[id] = Math.max(0, c.invulnerable[id] - dt);
      if (c.frozen[id] > 0) c.frozen[id] = Math.max(0, c.frozen[id] - dt);
      if (c.auraRadius[id] > 0 && !this.heroes.has(id) && c.state[id] !== UnitState.Dying) this.register(world, id);
    }

    for (const h of this.heroes.values()) {
      if (!h.alive) continue;
      const id = h.id;
      for (let k = 0; k < h.cooldowns.length; k++) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt);
      h.dodgeCooldown = Math.max(0, h.dodgeCooldown - dt);
      h.repelCooldown = Math.max(0, h.repelCooldown - dt);
      h.comboTime += dt;
      if (h.comboTime > COMBO_SECONDS) h.combo = 0;
      // Someone gave the hero an ordinary order: no longer steered.
      if (h.direct && c.order[id] !== Order.Direct) this.stopMove(world, h);
      if (h.direct && c.order[id] !== Order.Direct) h.direct = false;
      if (h.move) this.updateMove(world, h, dt);
      if (h.direct) {
        // Rooted while he strikes (only the lunge of the move carries him), else where the stick points.
        c.steerX[id] = h.move ? 0 : h.stickX;
        c.steerZ[id] = h.move ? 0 : h.stickZ;
      }
      if (h.casting) {
        if (c.stun[id] > 0) {
          // Interrupted: the SP are lost, the cooldown already runs.
          h.casting = null;
          continue;
        }
        h.casting.remaining -= dt;
        if (h.casting.remaining <= 0) {
          const { slot, x, z } = h.casting;
          h.casting = null;
          this.release(world, h, h.abilities[slot], x, z);
        }
      }
    }

    this.updateBuffs(world, dt);
    for (const hit of this.hits) if (c.state[hit.target] !== UnitState.Dying) this.damage.apply(world, hit);
    this.hits.length = 0;
  }

  private register(world: World, id: number): void {
    const def = UNIT_DEFS[world.c.unitType[id]];
    if (!def.hero) return;
    const abilities = def.hero.abilities.map(ability);
    this.heroes.set(id, {
      id,
      team: world.c.team[id],
      name: def.name,
      character: def.hero.character,
      abilities,
      cooldowns: abilities.map(() => 0),
      level: 1,
      xp: 0,
      sp: Math.round(def.hero.sp * SP_START),
      maxSp: def.hero.sp,
      alive: true,
      direct: false,
      dodgeCooldown: 0,
      repelCooldown: 0,
      casting: null,
      move: null,
      buffer: null,
      stickX: 0,
      stickZ: 0,
      combo: 0,
      comboTime: 0,
      lastMove: null,
      lastMoveAt: -Infinity,
      officers: [null, null],
    });
  }

  /** Why an ability cannot be cast now, or null when it can. */
  blocked(world: World, h: HeroState, slot: number): 'dead' | 'casting' | 'stunned' | 'cooldown' | 'sp' | null {
    const a = h.abilities[slot];
    if (!h.alive || !a) return 'dead';
    if (h.casting) return 'casting';
    if (world.c.stun[h.id] > 0) return 'stunned';
    if (h.cooldowns[slot] > 0) return 'cooldown';
    if (h.sp < a.spCost) return 'sp';
    return null;
  }

  /** Why the officer in `slot` cannot assist now, or null when he can. */
  assistBlocked(world: World, h: HeroState, slot: number): AssistBlock {
    const o = h.officers[slot];
    if (!o) return 'none';
    if (!h.alive || !this.alive(world, o.unit)) return 'dead';
    if (world.c.stun[h.id] > 0) return 'stunned';
    if (h.sp < ASSIST_SP) return 'sp';
    return null;
  }

  private alive(world: World, id: number): boolean {
    return world.entities.has(id, Comp.Unit) && world.c.state[id] !== UnitState.Dying;
  }

  // --- Action mode -------------------------------------------------------------------------------------

  /** A button of the pad: starts a move, follows the chain of the current one, or (B) defends. */
  private press(world: World, h: HeroState, button: Button, x: number, z: number, aim: number): void {
    if (!h.direct || h.casting || world.c.stun[h.id] > 0) return;
    if (button === 'B') {
      this.defend(world, h, x, z, aim);
      return;
    }
    if (h.move) {
      // Kept until the move can be followed (combo) or is over.
      h.buffer = { button, x, z, aim };
      return;
    }
    this.chain(world, h, null, button, x, z, aim);
  }

  /** Starts the move a button gives after `current` (or alone); false when it gives none or SP lack. */
  private chain(world: World, h: HeroState, current: MoveDef | null, button: Button, x: number, z: number, aim: number): boolean {
    const id = nextMove(current, button, Math.hypot(x, z));
    if (!id) return false;
    const def = move(id);
    if (def.sp > h.sp) return false;
    // The thrust goes where the stick points (towards the enemy), the rest where the hero looks.
    const facing = id === 'thrust' && Math.hypot(x, z) > 0.1 ? Math.atan2(x, z) : aim;
    this.startMove(world, h, def, facing, NO_ENTITY);
    return true;
  }

  private startMove(world: World, h: HeroState, def: MoveDef, facing: number, victim: number): void {
    const { c } = world;
    const id = h.id;
    h.sp -= def.sp;
    h.move = { def, t: 0, struck: false, victim };
    h.lastMove = def.id;
    h.lastMoveAt = world.time.elapsed;
    c.rot[id] = facing;
    c.swing[id] = 0;
    c.swingDuration[id] = def.duration;
    c.swingKind[id] = SwingKind.Move;
    c.swingStyle[id] = STYLE_CODE[def.style];
    if (def.invulnerable > 0) c.invulnerable[id] = Math.max(c.invulnerable[id], def.invulnerable);
    c.vx[id] = c.vz[id] = 0;
    c.lunge[id] = 0;
  }

  private stopMove(world: World, h: HeroState): void {
    const { c } = world;
    if (h.move) c.swing[h.id] = -1;
    h.move = null;
    h.buffer = null;
    c.lunge[h.id] = 0;
  }

  /** Time of the current move: lunge, blow at the impact, the next move of the chain, the end. */
  private updateMove(world: World, h: HeroState, dt: number): void {
    const { c } = world;
    const id = h.id;
    const m = h.move!;
    if (c.stun[id] > 0 || !h.direct) {
      this.stopMove(world, h);
      return;
    }
    const def = m.def;
    m.t += dt;
    const impact = def.duration * def.impact;
    if (def.lunge > 0 && m.t < impact) {
      c.vx[id] = Math.sin(c.rot[id]) * def.lunge;
      c.vz[id] = Math.cos(c.rot[id]) * def.lunge;
      c.lunge[id] = impact - m.t;
    } else {
      c.lunge[id] = 0;
    }
    if (!m.struck && m.t >= impact) {
      m.struck = true;
      this.strike(world, h, def, m.victim);
    }
    c.swing[id] = Math.min(m.t, def.duration * 0.999);
    const b = h.buffer;
    if (b && m.t >= def.duration * def.cancel && def.next[b.button] !== undefined) {
      h.buffer = null;
      if (this.chain(world, h, def, b.button, b.x, b.z, b.aim)) return;
    }
    if (m.t >= def.duration) {
      h.move = null;
      c.swing[id] = -1;
      // A button that does not follow this move starts afresh once it is over.
      const next = h.buffer;
      h.buffer = null;
      if (next) this.chain(world, h, null, next.button, next.x, next.z, next.aim);
    }
  }

  /** The blow of a move: the nearest enemies within its reach and arc (its victim first). */
  private strike(world: World, h: HeroState, def: MoveDef, victim: number): void {
    const { c, entities, spatial } = world;
    const id = h.id;
    const reach = c.radius[id] + c.reach[id] + def.reach;
    const n = spatial.query(c.x[id], c.z[id], reach + 1.6, c.x, c.z, this.neighbours);
    const fx = Math.sin(c.rot[id]);
    const fz = Math.cos(c.rot[id]);
    const found: { e: number; d: number }[] = [];
    for (let k = 0; k < n; k++) {
      const e = this.neighbours[k];
      if (!(entities.mask[e] & Comp.Unit) || c.state[e] === UnitState.Dying || c.team[e] === h.team) continue;
      const dx = c.x[e] - c.x[id];
      const dz = c.z[e] - c.z[id];
      const d = Math.hypot(dx, dz);
      if (d - c.radius[e] > reach + 0.3) continue;
      if (def.arc > -1 && d > 0.05 && (dx * fx + dz * fz) / d < def.arc) continue;
      found.push({ e, d: e === victim ? -1 : d });
    }
    found.sort((a, b) => a.d - b.d);
    const hits = Math.min(def.targets, found.length);
    const damage = c.attack[id] * c.damageMul[id] * def.damage;
    for (let k = 0; k < hits; k++) {
      const e = found[k].e;
      this.hit(world, id, e, damage, DAMAGE_TYPES[c.damageType[id]], null, c.x[id], c.z[id], c.critChance[id]);
      if (def.knockback > 0) {
        const dx = c.x[e] - c.x[id];
        const dz = c.z[e] - c.z[id];
        const len = Math.hypot(dx, dz) || 1;
        const push = (def.knockback * 90) / Math.max(90, c.mass[e]);
        c.vx[e] += (dx / len) * push;
        c.vz[e] += (dz / len) * push;
      }
      if (def.stun > 0) {
        c.stun[e] = Math.max(c.stun[e], def.stun);
        c.swing[e] = -1;
      }
    }
    if (hits > 0) {
      h.combo += hits;
      h.comboTime = 0;
    }
    world.events.emit('heroMove', { hero: id, move: def.id, x: c.x[id], z: c.z[id], hits });
  }

  /**
   * B: counter-attack an enemy about to strike the hero, else push back the enemies that just hit him,
   * else dodge (towards the stick, backwards when it rests).
   */
  private defend(world: World, h: HeroState, x: number, z: number, aim: number): void {
    const { c } = world;
    const id = h.id;
    const current = h.move?.def.id;
    if (current === 'counter' || current === 'repel') return;
    const attacker = this.attackerOf(world, id);
    if (attacker >= 0) {
      // The enemy's blow is parried; the riposte strikes him first.
      c.swing[attacker] = -1;
      c.attackTimer[attacker] = Math.max(c.attackTimer[attacker], 1);
      this.stopMove(world, h);
      this.startMove(world, h, move('counter'), Math.atan2(c.x[attacker] - c.x[id], c.z[attacker] - c.z[id]), attacker);
      return;
    }
    if (c.lastHit[id] < REPEL_WINDOW && h.repelCooldown <= 0) {
      this.stopMove(world, h);
      h.repelCooldown = REPEL_COOLDOWN;
      this.startMove(world, h, move('repel'), c.rot[id], NO_ENTITY);
      return;
    }
    if (h.dodgeCooldown > 0) return;
    let dx = x;
    let dz = z;
    let len = Math.hypot(dx, dz);
    if (len < 0.1) {
      dx = -Math.sin(aim);
      dz = -Math.cos(aim);
      len = 1;
    }
    this.stopMove(world, h);
    c.vx[id] = (dx / len) * DODGE_SPEED;
    c.vz[id] = (dz / len) * DODGE_SPEED;
    c.invulnerable[id] = Math.max(c.invulnerable[id], DODGE_SECONDS);
    h.dodgeCooldown = DODGE_COOLDOWN;
    world.events.emit('heroDodged', { id });
  }

  /** The enemy whose blow at the hero lands soonest, within the counter window; -1 when none. */
  private attackerOf(world: World, hero: number): number {
    const { c, entities, spatial } = world;
    const n = spatial.query(c.x[hero], c.z[hero], c.radius[hero] + 4, c.x, c.z, this.neighbours);
    let best = NO_ENTITY;
    let soonest = COUNTER_WINDOW;
    for (let k = 0; k < n; k++) {
      const e = this.neighbours[k];
      if (!(entities.mask[e] & Comp.Unit) || c.team[e] === c.team[hero] || c.state[e] === UnitState.Dying) continue;
      if (c.target[e] !== hero || c.swing[e] < 0 || c.swingKind[e] !== SwingKind.Blow) continue;
      const left = c.swingDuration[e] * IMPACT_FRACTION - c.swing[e];
      const reach = Math.hypot(c.x[e] - c.x[hero], c.z[e] - c.z[hero]) - c.radius[e] - c.radius[hero];
      if (left >= 0 && left <= soonest && reach <= c.reach[e] + 0.8) {
        soonest = left;
        best = e;
      }
    }
    return best;
  }

  /** The officer in `slot` performs his assist: aimed ahead of the hero, or around himself. */
  private assist(world: World, h: HeroState, slot: number): void {
    if (this.assistBlocked(world, h, slot)) return;
    const { c } = world;
    const o = h.officers[slot]!;
    const a = o.def.assist;
    const caster = o.unit;
    h.sp -= ASSIST_SP;
    let x = c.x[caster];
    let z = c.z[caster];
    if (a.targeting === 'point') {
      // From the officer, through the point the hero faces, as far as the assist reaches.
      const ax = c.x[h.id] + Math.sin(c.rot[h.id]) * ASSIST_AHEAD - x;
      const az = c.z[h.id] + Math.cos(c.rot[h.id]) * ASSIST_AHEAD - z;
      const len = Math.hypot(ax, az) || 1;
      x += (ax / len) * a.range;
      z += (az / len) * a.range;
      if (len > 0.1) c.rot[caster] = Math.atan2(ax, az);
    }
    const power = 1 + 0.08 * (h.level - 1);
    let radius = 2;
    for (const e of a.effects) {
      this.applyEffect(world, caster, h.team, a.id, e, x, z, power);
      if ('radius' in e && e.kind !== 'missile') radius = Math.max(radius, e.radius);
    }
    world.events.emit('assistCast', { hero: h.id, officer: caster, assist: a.id, x, z, color: a.color, radius });
  }

  private cast(world: World, h: HeroState, slot: number, x: number, z: number): boolean {
    if (this.blocked(world, h, slot)) return false;
    const { c } = world;
    const a = h.abilities[slot];
    const id = h.id;
    if (a.targeting === 'self') {
      x = c.x[id];
      z = c.z[id];
    } else {
      // Beyond range: aimed at the farthest point in that direction.
      const d = Math.hypot(x - c.x[id], z - c.z[id]);
      if (d > a.range) {
        x = c.x[id] + ((x - c.x[id]) / d) * a.range;
        z = c.z[id] + ((z - c.z[id]) / d) * a.range;
      }
      if (d > 0.1) c.rot[id] = Math.atan2(x - c.x[id], z - c.z[id]);
    }
    h.sp -= a.spCost;
    h.cooldowns[slot] = a.cooldown;
    h.casting = { slot, x, z, remaining: a.castTime };
    // The casting gesture: a swing that strikes nothing, rooting the hero until its "impact".
    c.swing[id] = 0;
    c.swingDuration[id] = Math.max(0.15, a.castTime) / IMPACT_FRACTION;
    c.swingKind[id] = SwingKind.Cast;
    world.events.emit('abilityStarted', { hero: id, ability: a.id, x, z });
    if (a.castTime <= 0) {
      h.casting = null;
      this.release(world, h, a, x, z);
    }
    return true;
  }

  /** The effects of an ability happen at (x, z); spell damage grows 8 % per hero level. */
  private release(world: World, h: HeroState, a: AbilityDef, x: number, z: number): void {
    const power = 1 + 0.08 * (h.level - 1);
    for (const effect of a.effects) this.applyEffect(world, h.id, h.team, a.id, effect, x, z, power);
    world.events.emit('abilityCast', { hero: h.id, ability: a.id, x, z, color: a.color });
  }

  /** One effect of an ability or an assist cast by `id` (a hero or an officer) of `team`. */
  private applyEffect(world: World, id: number, team: number, source: string, e: Effect, x: number, z: number, power: number): void {
    const { c } = world;
    switch (e.kind) {
      case 'damage':
        this.forEach(world, x, z, e.radius, (u) => {
          if (c.team[u] === team) return;
          this.hit(world, id, u, e.amount * power, e.damageType, source, x, z);
          if (e.knockback > 0) {
            const dx = c.x[u] - x;
            const dz = c.z[u] - z;
            const len = Math.hypot(dx, dz) || 1;
            const push = (e.knockback * 90) / Math.max(90, c.mass[u]);
            c.vx[u] += (dx / len) * push;
            c.vz[u] += (dz / len) * push;
          }
          if (e.stun > 0) c.stun[u] = Math.max(c.stun[u], e.stun);
          if (e.stun > 0 && e.damageType === 'ICE') c.frozen[u] = Math.max(c.frozen[u], e.stun);
        });
        break;
      case 'dash': {
        // Along the line to the point, stopping before cliffs and rocks.
        const sx = c.x[id];
        const sz = c.z[id];
        const d = Math.hypot(x - sx, z - sz);
        const steps = Math.ceil(d / 0.5);
        let ex = sx;
        let ez = sz;
        for (let s = 1; s <= steps; s++) {
          const px = sx + ((x - sx) * s) / steps;
          const pz = sz + ((z - sz) * s) / steps;
          if (world.nav.isBlockedAt(px, pz)) break;
          ex = px;
          ez = pz;
        }
        const len = Math.hypot(ex - sx, ez - sz);
        if (len > 0.1) {
          const ux = (ex - sx) / len;
          const uz = (ez - sz) / len;
          this.forEach(world, (sx + ex) / 2, (sz + ez) / 2, len / 2 + e.width + 1, (u) => {
            if (c.team[u] === team) return;
            // Distance to the swept segment.
            const along = Math.max(0, Math.min(len, (c.x[u] - sx) * ux + (c.z[u] - sz) * uz));
            const off = Math.hypot(c.x[u] - (sx + ux * along), c.z[u] - (sz + uz * along));
            if (off - c.radius[u] <= e.width && e.damage > 0) this.hit(world, id, u, e.damage * power, e.damageType, source, sx, sz);
          });
          c.x[id] = ex;
          c.z[id] = ez;
          c.rot[id] = Math.atan2(ux, uz);
          c.vx[id] = ux * c.maxSpeed[id];
          c.vz[id] = uz * c.maxSpeed[id];
        }
        break;
      }
      case 'missile':
        launchSpell(world, id, x, z, { ...e, damage: e.damage * power }, source);
        break;
      case 'buff':
        this.forEach(world, c.x[id], c.z[id], e.radius, (u) => {
          if (c.team[u] !== team) return;
          // The same buff refreshes instead of stacking.
          this.buffs = this.buffs.filter((b) => !(b.target === u && b.source === source));
          this.buffs.push({ target: u, source, damage: e.damage, haste: e.haste, defense: e.defense, remaining: e.duration });
        });
        break;
      case 'morale':
        this.forEach(world, c.x[id], c.z[id], e.radius, (u) => {
          if (c.team[u] === team) c.morale[u] = Math.min(100, c.morale[u] + e.allies);
          else c.morale[u] = Math.max(0, c.morale[u] - e.enemies * (1 - c.discipline[u] * 0.6));
        });
        break;
      case 'heal': {
        // The wounded of the caster's own troop (of his side when he has none).
        const troop = c.troop[id];
        this.forEach(world, c.x[id], c.z[id], e.radius, (u) => {
          if (c.team[u] !== team || (troop !== NO_ENTITY && c.troop[u] !== troop)) return;
          c.hp[u] = Math.min(c.maxHp[u], c.hp[u] + c.maxHp[u] * e.amount);
        });
        break;
      }
    }
  }

  /** Every living soldier within `radius` (m, measured to its edge) of (x, z). */
  private forEach(world: World, x: number, z: number, radius: number, fn: (id: number) => void): void {
    const { c, entities, spatial } = world;
    const n = spatial.query(x, z, radius + 1.5, c.x, c.z, this.neighbours);
    for (let k = 0; k < n; k++) {
      const u = this.neighbours[k];
      if (!(entities.mask[u] & Comp.Unit) || c.state[u] === UnitState.Dying) continue;
      if (Math.hypot(c.x[u] - x, c.z[u] - z) - c.radius[u] <= radius) fn(u);
    }
  }

  private hit(world: World, attacker: number, target: number, damage: number, damageType: Attack['damageType'], source: string | null, x: number, z: number, criticalChance = 0): void {
    this.hits.push({
      attacker,
      target,
      damage,
      damageType,
      timestamp: world.time.elapsed,
      x,
      z,
      ability: source,
      missile: false,
      criticalChance,
    });
  }

  private updateBuffs(world: World, dt: number): void {
    const { c } = world;
    for (const id of this.buffed) {
      c.damageMul[id] = 1;
      c.hasteMul[id] = 1;
      c.defenseBonus[id] = 0;
    }
    this.buffed.clear();
    this.buffs = this.buffs.filter((b) => (b.remaining -= dt) > 0 && world.entities.isAlive(b.target) && c.state[b.target] !== UnitState.Dying);
    for (const b of this.buffs) {
      c.damageMul[b.target] *= b.damage;
      c.hasteMul[b.target] *= b.haste;
      c.defenseBonus[b.target] += b.defense;
      this.buffed.add(b.target);
    }
  }

  /** Takes or gives back direct control: the hero leaves its formation and waits for steering commands. */
  private control(world: World, h: HeroState, direct: boolean): void {
    const { c } = world;
    const id = h.id;
    if (direct === h.direct) return;
    this.stopMove(world, h);
    h.direct = direct;
    h.stickX = h.stickZ = 0;
    c.steerX[id] = c.steerZ[id] = 0;
    if (direct) {
      this.formations.detach(id);
      c.order[id] = Order.Direct;
      c.target[id] = NO_ENTITY;
      c.slotRot[id] = c.rot[id];
      c.state[id] = UnitState.Idle;
    } else {
      // Back to the army: it stands and defends where the player left it.
      c.order[id] = Order.Defend;
      c.slotX[id] = c.x[id];
      c.slotZ[id] = c.z[id];
      c.slotRot[id] = c.rot[id];
    }
    world.events.emit('heroControl', { id, direct });
  }

  /** Experience: the killer hero gets the whole of it, allied heroes nearby a share. */
  private onDeath(world: World, victim: number, killer: number, x: number, z: number, team: number): void {
    const dead = this.heroes.get(victim);
    if (dead) {
      dead.alive = false;
      dead.direct = false;
      dead.casting = null;
      dead.move = null;
      dead.buffer = null;
    }
    const worth = world.c.maxHp[victim] / 4;
    for (const h of this.heroes.values()) {
      if (!h.alive || h.team === team) continue;
      const share = h.id === killer ? 1 : Math.hypot(world.c.x[h.id] - x, world.c.z[h.id] - z) <= ARMY_XP_RADIUS ? ARMY_XP_SHARE : 0;
      if (share > 0) this.gainXp(world, h, worth * share);
    }
  }

  gainXp(world: World, h: HeroState, amount: number): void {
    const { c } = world;
    h.xp += amount;
    while (h.level < MAX_LEVEL && h.xp >= xpForLevel(h.level + 1)) {
      h.level++;
      const gain = c.maxHp[h.id] * 0.08;
      c.maxHp[h.id] += gain;
      c.hp[h.id] += gain;
      c.attack[h.id] *= 1.06;
      c.defense[h.id] += 1;
      h.maxSp += 20;
      h.sp += 20;
      world.events.emit('heroLevelUp', { id: h.id, level: h.level });
    }
  }
}

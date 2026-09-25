import type { CombatSystem } from '../combat/CombatSystem';
import type { Attack, DamageSystem } from '../combat/DamageSystem';
import { launchSpell } from '../combat/Projectiles';
import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { ability } from '../data/abilities';
import { UNIT_DEFS } from '../data/units';
import { Comp, NO_ENTITY, Order, SwingKind, UnitState } from '../entities/Components';
import type { FormationManager } from '../formations/FormationManager';
import { IMPACT_FRACTION } from '../units/Unit';
import type { AbilityDef, Effect } from './Ability';

export const MAX_LEVEL = 10;
/** Share of the experience of a kill given to allied heroes nearby who did not strike it. */
const ARMY_XP_SHARE = 0.4;
const ARMY_XP_RADIUS = 25;
const DODGE_SPEED = 10;
const DODGE_SECONDS = 0.32;
const DODGE_COOLDOWN = 1.2;

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
  mana: number;
  maxMana: number;
  manaRegen: number;
  alive: boolean;
  /** Under the player's direct third-person control. */
  direct: boolean;
  dodgeCooldown: number;
  casting: { slot: number; x: number; z: number; remaining: number } | null;
}

interface Buff {
  target: number;
  source: string;
  damage: number;
  haste: number;
  defense: number;
  remaining: number;
}

/**
 * Heroes: mana, abilities (cast time, cooldowns, effects), experience and levels, buffs, frozen and stunned
 * soldiers, and the direct control of a hero by the player (steering, free blows, dodge rolls). Everything
 * goes through commands, like the orders given to troops.
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
    private readonly combat: CombatSystem,
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
      world.c.steerX[h.id] = cmd.x * scale;
      world.c.steerZ[h.id] = cmd.z * scale;
      world.c.slotRot[h.id] = cmd.aim;
    });
    q.on('heroStrike', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      if (!h?.direct || h.casting) return;
      const c = world.c;
      const facing = c.rot[h.id];
      c.rot[h.id] = c.slotRot[h.id];
      if (!this.combat.freeStrike(world, h.id, cmd.heavy)) c.rot[h.id] = facing;
    });
    q.on('heroDodge', (cmd) => {
      const h = this.own(cmd.team, cmd.hero);
      const c = world.c;
      if (!h?.direct || h.dodgeCooldown > 0 || c.stun[h.id] > 0 || h.casting) return;
      const len = Math.hypot(cmd.x, cmd.z);
      if (len < 1e-3) return;
      c.vx[h.id] = (cmd.x / len) * DODGE_SPEED;
      c.vz[h.id] = (cmd.z / len) * DODGE_SPEED;
      c.invulnerable[h.id] = DODGE_SECONDS;
      c.swing[h.id] = -1;
      h.dodgeCooldown = DODGE_COOLDOWN;
      world.events.emit('heroDodged', { id: h.id });
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
      h.mana = Math.min(h.maxMana, h.mana + h.manaRegen * dt);
      for (let k = 0; k < h.cooldowns.length; k++) h.cooldowns[k] = Math.max(0, h.cooldowns[k] - dt);
      h.dodgeCooldown = Math.max(0, h.dodgeCooldown - dt);
      // Someone gave the hero an ordinary order (it was selected with its troops): no longer steered.
      if (h.direct && c.order[id] !== Order.Direct) h.direct = false;
      if (h.casting) {
        if (c.stun[id] > 0) {
          // Interrupted: the mana is lost, the cooldown already runs.
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
      mana: def.hero.mana,
      maxMana: def.hero.mana,
      manaRegen: def.hero.manaRegen,
      alive: true,
      direct: false,
      dodgeCooldown: 0,
      casting: null,
    });
  }

  /** Why an ability cannot be cast now, or null when it can. */
  blocked(world: World, h: HeroState, slot: number): 'dead' | 'casting' | 'stunned' | 'cooldown' | 'mana' | null {
    const a = h.abilities[slot];
    if (!h.alive || !a) return 'dead';
    if (h.casting) return 'casting';
    if (world.c.stun[h.id] > 0) return 'stunned';
    if (h.cooldowns[slot] > 0) return 'cooldown';
    if (h.mana < a.manaCost) return 'mana';
    return null;
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
    h.mana -= a.manaCost;
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
    for (const effect of a.effects) this.applyEffect(world, h, a, effect, x, z, power);
    world.events.emit('abilityCast', { hero: h.id, ability: a.id, x, z, color: a.color });
  }

  private applyEffect(world: World, h: HeroState, a: AbilityDef, e: Effect, x: number, z: number, power: number): void {
    const { c } = world;
    const id = h.id;
    switch (e.kind) {
      case 'damage':
        this.forEach(world, x, z, e.radius, (u) => {
          if (c.team[u] === h.team) return;
          this.hit(world, id, u, e.amount * power, e.damageType, a.id, x, z);
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
            if (c.team[u] === h.team) return;
            // Distance to the swept segment.
            const along = Math.max(0, Math.min(len, (c.x[u] - sx) * ux + (c.z[u] - sz) * uz));
            const off = Math.hypot(c.x[u] - (sx + ux * along), c.z[u] - (sz + uz * along));
            if (off - c.radius[u] <= e.width && e.damage > 0) this.hit(world, id, u, e.damage * power, e.damageType, a.id, sx, sz);
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
        launchSpell(world, id, x, z, { ...e, damage: e.damage * power }, a.id);
        break;
      case 'buff':
        this.forEach(world, c.x[id], c.z[id], e.radius, (u) => {
          if (c.team[u] !== h.team) return;
          // The same buff refreshes instead of stacking.
          this.buffs = this.buffs.filter((b) => !(b.target === u && b.source === a.id));
          this.buffs.push({ target: u, source: a.id, damage: e.damage, haste: e.haste, defense: e.defense, remaining: e.duration });
        });
        break;
      case 'morale':
        this.forEach(world, c.x[id], c.z[id], e.radius, (u) => {
          if (c.team[u] === h.team) c.morale[u] = Math.min(100, c.morale[u] + e.allies);
          else c.morale[u] = Math.max(0, c.morale[u] - e.enemies * (1 - c.discipline[u] * 0.6));
        });
        break;
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

  private hit(world: World, attacker: number, target: number, damage: number, damageType: Attack['damageType'], source: string, x: number, z: number): void {
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
      criticalChance: 0,
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
    h.direct = direct;
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
      h.maxMana += 10;
      h.mana += 10;
      world.events.emit('heroLevelUp', { id: h.id, level: h.level });
    }
  }
}

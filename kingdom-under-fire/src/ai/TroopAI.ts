import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import type { AbilityDef } from '../heroes/Ability';
import type { HeroSystem } from '../heroes/HeroSystem';
import type { Troop, TroopSystem } from '../troops/TroopSystem';
import { AIKnowledge } from './AIKnowledge';
import { chooseCast } from './HeroAI';

/** What a troop does while it knows no enemy close enough to engage. */
export type TroopStance = { kind: 'hold' } | { kind: 'advance'; x: number; z: number; after: number };

export interface TroopAIOptions {
  team: number;
  /** Known enemies closer than this to a troop's leader (m) are engaged. */
  engageRadius?: number;
  /** Seconds between two decisions. */
  thinkInterval?: number;
  /** Default stance of the team's troops (a mission can give each troop its own). */
  stance?: TroopStance;
}

const DEFAULT_ENGAGE_RADIUS = 55;

/**
 * Commander of an AI side made of troops. Every second it refreshes what its soldiers see (AIKnowledge:
 * it never reads the enemy positions directly); each troop then attacks the troop of the nearest known
 * enemy within reach, or keeps its stance: hold its ground, or advance on a point after a delay. Its heroes
 * cast their abilities where they hit the most enemies. It issues the same commands as the player.
 */
export class TroopAI implements System {
  readonly name = 'ai';
  readonly knowledge: AIKnowledge;
  private next = 0;
  private readonly stances = new Map<number, TroopStance>();
  /** Enemy troop each of ours was last sent against, and the point it was last sent to. */
  private readonly orders = new Map<number, { target: number } | { x: number; z: number }>();
  enabled = true;
  heroes: HeroSystem | null = null;
  troops: TroopSystem | null = null;
  /** Stance of the troops that were given none of their own. */
  stance: TroopStance;

  constructor(
    world: World,
    private readonly options: TroopAIOptions,
  ) {
    this.knowledge = new AIKnowledge(world, options.team);
    this.stance = options.stance ?? { kind: 'hold' };
  }

  /** Gives one troop its own stance (mission scripts). */
  setStance(troop: number, stance: TroopStance): void {
    this.stances.set(troop, stance);
    this.orders.delete(troop);
  }

  update(world: World): void {
    if (!this.enabled || !this.troops || world.time.elapsed < this.next) return;
    this.next = world.time.elapsed + (this.options.thinkInterval ?? 1);
    this.knowledge.update();
    const { team } = this.options;
    if (this.heroes) {
      for (const h of this.heroes.list(team)) {
        if (h.direct || h.casting) continue;
        const cast = chooseCast(world, this.heroes, h);
        if (cast) world.commands.push({ kind: 'cast', team, hero: h.id, slot: cast.slot, x: cast.x, z: cast.z });
      }
    }
    for (const troop of this.troops.list(team, true)) {
      this.useSkills(world, troop);
      this.decide(world, troop);
    }
  }

  /** A skill of the troop when it is worth it: heal the wounded, boost a fight, burn, trap, smite. */
  private useSkills(world: World, troop: Troop): void {
    const troops = this.troops!;
    if (troop.casting) return;
    for (let slot = 0; slot < troop.skills.length; slot++) {
      if (troops.skillBlocked(troop, slot)) continue;
      const target = this.skillTarget(world, troop, troop.skills[slot]);
      if (!target) continue;
      world.commands.push({ kind: 'troopSkill', team: this.options.team, troop: troop.id, slot, x: target.x, z: target.z });
      return;
    }
  }

  private skillTarget(world: World, troop: Troop, a: AbilityDef): { x: number; z: number } | null {
    const { c, fire } = world;
    const lx = c.x[troop.leader];
    const lz = c.z[troop.leader];
    const seen: { x: number; z: number }[] = [];
    for (const s of this.knowledge.enemies.values()) if (s.visible && Math.hypot(s.x - lx, s.z - lz) <= Math.max(a.range, 1)) seen.push(s);
    for (const e of a.effects) {
      if (e.kind === 'heal') {
        let wounded = 0;
        for (const id of troop.members) if (c.hp[id] < c.maxHp[id] * 0.55) wounded++;
        if (wounded >= Math.max(2, troop.members.length * 0.35)) return { x: lx, z: lz };
      } else if (e.kind === 'buff' || e.kind === 'morale') {
        if (troop.status === 'fighting') return { x: lx, z: lz };
      } else if (e.kind === 'ignite') {
        // An enemy standing in woods that can still burn.
        const inWood = seen.find((s) => fire.canBurn(fire.cellAt(s.x, s.z)));
        if (inWood) return inWood;
      } else if (e.kind === 'trap') {
        // Across the path of the nearest enemy coming at the troop.
        let best: { x: number; z: number } | null = null;
        let nearest = 35;
        for (const s of this.knowledge.enemies.values()) {
          const d = Math.hypot(s.x - lx, s.z - lz);
          if (s.visible && d < nearest && d > 8) {
            nearest = d;
            const k = Math.min(a.range, d * 0.5) / d;
            best = { x: lx + (s.x - lx) * k, z: lz + (s.z - lz) * k };
          }
        }
        if (best && !world.traps.some((t) => t.team === troop.team && Math.hypot(t.x - best!.x, t.z - best!.z) < 6)) return best;
      } else if (e.kind === 'damage' && a.targeting === 'point') {
        // The densest group in reach, if it is a group.
        let best: { x: number; z: number; n: number } | null = null;
        for (const s of seen) {
          const n = seen.filter((o) => Math.hypot(o.x - s.x, o.z - s.z) <= e.radius).length;
          if (!best || n > best.n) best = { x: s.x, z: s.z, n };
        }
        if (best && best.n >= 4) return best;
      }
    }
    return null;
  }

  private decide(world: World, troop: Troop): void {
    const { c } = world;
    const { team } = this.options;
    const radius = this.options.engageRadius ?? DEFAULT_ENGAGE_RADIUS;
    const x = c.x[troop.leader];
    const z = c.z[troop.leader];
    // The troop of the nearest enemy soldier it knows of.
    let target: Troop | undefined;
    let nearest = radius;
    for (const [unit, s] of this.knowledge.enemies) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (d >= nearest) continue;
      const other = this.troops!.of(unit);
      if (!other || other.status === 'defeated' || other.status === 'routing') continue;
      nearest = d;
      target = other;
    }
    const last = this.orders.get(troop.id);
    if (target) {
      if (last && 'target' in last && last.target === target.id) return;
      this.orders.set(troop.id, { target: target.id });
      world.commands.push({ kind: 'troopAttack', team, troop: troop.id, target: target.id });
      return;
    }
    const stance = this.stances.get(troop.id) ?? this.stance;
    if (stance.kind === 'advance' && world.time.elapsed >= stance.after) {
      if (last && 'x' in last && last.x === stance.x && last.z === stance.z) return;
      this.orders.set(troop.id, { x: stance.x, z: stance.z });
      world.commands.push({ kind: 'troopMove', team, troop: troop.id, x: stance.x, z: stance.z, queue: false });
    } else if (last) {
      // The enemy it hunted is gone: it stands where it is.
      this.orders.delete(troop.id);
      world.commands.push({ kind: 'troopHold', team, troop: troop.id });
    }
  }
}

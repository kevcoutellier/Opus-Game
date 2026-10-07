import type { Random } from '../core/Random';
import type { World } from '../core/World';
import { NO_ENTITY, UnitState } from '../entities/Components';
import { ARMOR_TYPES, DAMAGE_TYPES, type ArmorType, type DamageType } from '../units/UnitStats';

/** One blow, spell or projectile hit, as it reaches the damage resolution. */
export interface Attack {
  attacker: number;
  target: number;
  damage: number;
  damageType: DamageType;
  /** Simulation time (s) of the impact. */
  timestamp: number;
  /** Where the blow came from (knockback direction, effects). */
  x: number;
  z: number;
  /** Ability id, null for a basic attack. */
  ability: string | null;
  /** True for an arrow or another missile (no clash of steel). */
  missile: boolean;
  criticalChance: number;
}

export interface DamageResult {
  damage: number;
  critical: boolean;
  killed: boolean;
  flank: FlankId;
}

/** Side of the victim a blow comes from, relative to where it faces. */
export const Flank = { Front: 0, Side: 1, Rear: 2 } as const;
export type FlankId = (typeof Flank)[keyof typeof Flank];
/** Damage and morale shock of a blow by flank: a soldier cannot parry what he does not see. */
export const FLANK_DAMAGE = [1, 1.25, 1.5] as const;
export const FLANK_MORALE = [1, 1.6, 2.5] as const;

/** Flank of a unit facing `rot` at (x, z) hit from (fromX, fromZ): front within ±60°, rear beyond ±120°. */
export function flankOf(rot: number, x: number, z: number, fromX: number, fromZ: number): FlankId {
  const dx = fromX - x;
  const dz = fromZ - z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return Flank.Front;
  const dot = (Math.sin(rot) * dx + Math.cos(rot) * dz) / len;
  return dot > 0.5 ? Flank.Front : dot > -0.5 ? Flank.Side : Flank.Rear;
}

/** Damage multiplier of a damage type against an armour type. */
export const DAMAGE_VS_ARMOR: Record<DamageType, Record<ArmorType, number>> = {
  PHYSICAL: { LIGHT: 1, MEDIUM: 1, HEAVY: 1, MOUNTED: 1, STRUCTURE: 0.5 },
  SLASH: { LIGHT: 1.15, MEDIUM: 1, HEAVY: 0.75, MOUNTED: 0.9, STRUCTURE: 0.3 },
  PIERCING: { LIGHT: 1, MEDIUM: 1, HEAVY: 0.85, MOUNTED: 1.35, STRUCTURE: 0.2 },
  BLUNT: { LIGHT: 0.95, MEDIUM: 1, HEAVY: 1.2, MOUNTED: 1, STRUCTURE: 0.8 },
  MAGICAL: { LIGHT: 1.1, MEDIUM: 1.1, HEAVY: 1.1, MOUNTED: 1.1, STRUCTURE: 0.6 },
  FIRE: { LIGHT: 1.1, MEDIUM: 1, HEAVY: 0.9, MOUNTED: 1, STRUCTURE: 1.4 },
  ICE: { LIGHT: 1, MEDIUM: 1, HEAVY: 1, MOUNTED: 1, STRUCTURE: 0.5 },
  LIGHTNING: { LIGHT: 1, MEDIUM: 1.05, HEAVY: 1.25, MOUNTED: 1.05, STRUCTURE: 0.6 },
};

export const CRITICAL_MULTIPLIER = 1.75;
/** Each point of defence removes ~4 % of the incoming damage, with diminishing returns. */
const DEFENSE_WEIGHT = 4;

/** Pure damage formula (tested in isolation). */
export function computeDamage(
  attack: Pick<Attack, 'damage' | 'damageType' | 'criticalChance'>,
  defense: number,
  armor: ArmorType,
  rng: Random,
): { damage: number; critical: boolean } {
  const spread = rng.range(0.85, 1.15);
  const critical = rng.chance(attack.criticalChance);
  // Magic goes half through armour.
  const effectiveDefense = attack.damageType === 'MAGICAL' ? defense * 0.5 : defense;
  const mitigation = 100 / (100 + effectiveDefense * DEFENSE_WEIGHT);
  const raw = attack.damage * spread * DAMAGE_VS_ARMOR[attack.damageType][armor] * (critical ? CRITICAL_MULTIPLIER : 1);
  return { damage: Math.max(1, raw * mitigation), critical };
}

/**
 * Applies attacks: flank (side and rear blows hurt more and shake more, shields stop frontal missiles),
 * health, hit flash, knockback, morale shock of the victim, death. Every hit and death is published on
 * the event bus (effects, sounds, statistics).
 */
export class DamageSystem {
  apply(world: World, attack: Attack): DamageResult {
    const { c } = world;
    const t = attack.target;
    // Mid-dodge: the blow finds nothing.
    if (c.invulnerable[t] > 0) return { damage: 0, critical: false, killed: false, flank: Flank.Front };
    const flank = flankOf(c.rot[t], c.x[t], c.z[t], attack.x, attack.z);
    // Shields stop arrows, not the burst of a spell.
    const shield = attack.missile && attack.ability === null && flank === Flank.Front ? 1 - c.shield[t] : 1;
    const hit = computeDamage(attack, c.defense[t] + c.defenseBonus[t], ARMOR_TYPES[c.armorType[t]], world.rng);
    const damage = Math.max(1, hit.damage * FLANK_DAMAGE[flank] * shield);
    const critical = hit.critical;
    c.hp[t] -= damage;
    c.lastHit[t] = 0;
    // Knockback along the blow, heavier units budge less.
    const dx = c.x[t] - attack.x;
    const dz = c.z[t] - attack.z;
    const len = Math.hypot(dx, dz) || 1;
    const impulse = Math.min(1.8, (damage / c.mass[t]) * 4 * (critical ? 1.6 : 1));
    c.vx[t] += (dx / len) * impulse;
    c.vz[t] += (dz / len) * impulse;
    // Being hurt shakes a soldier; discipline absorbs part of it.
    const shock = (damage / c.maxHp[t]) * 14 * FLANK_MORALE[flank];
    c.morale[t] = Math.max(0, c.morale[t] - shock * (1 - c.discipline[t] * 0.5));
    const killed = c.hp[t] <= 0;
    world.events.emit('unitHit', { attack, damage, critical, killed, flank });
    if (killed) kill(world, t, attack.attacker);
    return { damage, critical, killed, flank };
  }
}

export function kill(world: World, id: number, killer: number): void {
  const { c } = world;
  c.hp[id] = 0;
  c.state[id] = UnitState.Dying;
  c.stateTime[id] = 0;
  c.target[id] = NO_ENTITY;
  c.swing[id] = -1;
  c.vx[id] = 0;
  c.vz[id] = 0;
  world.events.emit('unitDied', { id, team: c.team[id], x: c.x[id], z: c.z[id], killer });
}

export const DAMAGE_TYPE_OF = (index: number): DamageType => DAMAGE_TYPES[index];

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
 * Applies attacks: health, hit flash, knockback, morale shock of the victim, death. Every hit and death is
 * published on the event bus (effects, sounds, statistics).
 */
export class DamageSystem {
  apply(world: World, attack: Attack): DamageResult {
    const { c } = world;
    const t = attack.target;
    const { damage, critical } = computeDamage(attack, c.defense[t], ARMOR_TYPES[c.armorType[t]], world.rng);
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
    c.morale[t] = Math.max(0, c.morale[t] - (damage / c.maxHp[t]) * 14 * (1 - c.discipline[t] * 0.5));
    const killed = c.hp[t] <= 0;
    world.events.emit('unitHit', { attack, damage, critical, killed });
    if (killed) kill(world, t, attack.attacker);
    return { damage, critical, killed };
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

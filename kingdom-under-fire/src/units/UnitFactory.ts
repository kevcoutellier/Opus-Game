import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, MoraleState, NO_ENTITY, Order, UnitState } from '../entities/Components';
import { ARMOR_TYPES, DAMAGE_TYPES } from './UnitStats';

export const UNIT_MASK =
  Comp.Transform | Comp.Movement | Comp.Health | Comp.Combat | Comp.Morale | Comp.FormationSlot | Comp.Faction | Comp.Unit | Comp.Selectable;

/** Creates a unit entity from its data definition. */
export function spawnUnit(world: World, type: number, team: number, x: number, z: number, rot = 0): number {
  const def = UNIT_DEFS[type];
  if (!def) throw new Error(`Unknown unit type index ${type}`);
  const id = world.entities.create(UNIT_MASK);
  const c = world.c;
  c.x[id] = c.prevX[id] = c.slotX[id] = x;
  c.z[id] = c.prevZ[id] = c.slotZ[id] = z;
  c.rot[id] = c.prevRot[id] = c.slotRot[id] = rot;
  c.vx[id] = c.vz[id] = 0;
  c.maxSpeed[id] = def.speed;
  c.radius[id] = def.radius;
  c.mass[id] = def.mass;
  c.hp[id] = c.maxHp[id] = def.health;
  c.attack[id] = def.attack;
  c.defense[id] = def.defense;
  c.reach[id] = def.reach;
  c.attackPeriod[id] = def.attackPeriod;
  c.attackWindup[id] = def.attackWindup;
  // Units of a line do not all swing in sync.
  c.attackTimer[id] = world.rng.range(0, def.attackPeriod);
  c.swing[id] = -1;
  c.target[id] = NO_ENTITY;
  c.damageType[id] = DAMAGE_TYPES.indexOf(def.damageType);
  c.armorType[id] = ARMOR_TYPES.indexOf(def.armorType);
  c.critChance[id] = def.criticalChance;
  c.aggroRange[id] = def.aggroRange;
  c.lastHit[id] = 99;
  c.range[id] = def.ranged?.range ?? 0;
  c.rangedAttack[id] = def.ranged?.damage ?? 0;
  c.rangedPeriod[id] = def.ranged?.period ?? 0;
  c.rangedWindup[id] = def.ranged?.windup ?? 0;
  c.cleave[id] = def.cleave;
  c.shield[id] = def.shield;
  c.brace[id] = def.brace;
  c.chargePower[id] = def.charge?.damage ?? 0;
  c.chargeState[id] = 0;
  c.chargeTime[id] = 0;
  c.chargeCooldown[id] = 0;
  c.speedBoost[id] = 1;
  c.morale[id] = def.morale;
  c.moraleState[id] = MoraleState.Normal;
  c.discipline[id] = def.discipline;
  c.formation[id] = NO_ENTITY;
  c.slot[id] = NO_ENTITY;
  c.team[id] = team;
  c.unitType[id] = type;
  c.state[id] = UnitState.Idle;
  c.stateTime[id] = 0;
  c.order[id] = Order.Defend;
  world.events.emit('unitSpawned', { id });
  return id;
}

/** Spawns `count` units in a block of `columns`, centred on (x, z), facing `rot`. Returns their ids. */
export function spawnBlock(
  world: World,
  type: number,
  team: number,
  count: number,
  columns: number,
  x: number,
  z: number,
  rot: number,
  spacing = 1.6,
): number[] {
  const ids: number[] = [];
  const rows = Math.ceil(count / columns);
  const sin = Math.sin(rot);
  const cos = Math.cos(rot);
  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const lateral = (col - (columns - 1) / 2) * spacing;
    const depth = ((rows - 1) / 2 - row) * spacing;
    // Local lateral axis = (cos, -sin), forward axis = (sin, cos).
    ids.push(spawnUnit(world, type, team, x + lateral * cos + depth * sin, z - lateral * sin + depth * cos, rot));
  }
  return ids;
}

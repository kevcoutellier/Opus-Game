/**
 * Component storage, structure-of-arrays: one typed array per field, indexed by entity id. Systems iterate
 * over contiguous memory and the renderer copies positions straight into GPU instance buffers.
 * An entity "has" a component when its bit is set in EntityManager.mask.
 */
export const Comp = {
  Transform: 1 << 0,
  Movement: 1 << 1,
  Health: 1 << 2,
  Combat: 1 << 3,
  Morale: 1 << 4,
  FormationSlot: 1 << 5,
  Faction: 1 << 6,
  Unit: 1 << 7,
  Selectable: 1 << 8,
} as const;

/** Behaviour state of a unit, driven by the simulation systems. */
export const UnitState = {
  Idle: 0,
  Moving: 1,
  Engaging: 2,
  Attacking: 3,
  Routing: 4,
  Dying: 5,
} as const;
export type UnitStateId = (typeof UnitState)[keyof typeof UnitState];

export const MoraleState = {
  Normal: 0,
  Shaken: 1,
  Panicked: 2,
  Routing: 3,
  Recovering: 4,
} as const;
export type MoraleStateId = (typeof MoraleState)[keyof typeof MoraleState];
export const MORALE_STATE_NAMES = ['NORMAL', 'SHAKEN', 'PANICKED', 'ROUTING', 'RECOVERING'] as const;

/** Standing order of a unit (copied from its formation). */
export const Order = {
  Move: 0,
  AttackMove: 1,
  Attack: 2,
  Hold: 3,
  Defend: 4,
} as const;
export type OrderId = (typeof Order)[keyof typeof Order];

export const NO_ENTITY = -1;

export class Components {
  // Transform (metres, radians; prev* = state of the previous tick, for render interpolation)
  readonly x: Float32Array;
  readonly z: Float32Array;
  readonly prevX: Float32Array;
  readonly prevZ: Float32Array;
  readonly rot: Float32Array;
  readonly prevRot: Float32Array;

  // Movement
  readonly vx: Float32Array;
  readonly vz: Float32Array;
  readonly maxSpeed: Float32Array;
  readonly radius: Float32Array;
  readonly mass: Float32Array;

  // Health
  readonly hp: Float32Array;
  readonly maxHp: Float32Array;

  // Combat
  readonly attack: Float32Array;
  readonly defense: Float32Array;
  readonly reach: Float32Array;
  readonly attackPeriod: Float32Array;
  readonly attackWindup: Float32Array;
  /** Seconds before the next swing can start. */
  readonly attackTimer: Float32Array;
  /** Seconds since the current swing started, -1 when not swinging. */
  readonly swing: Float32Array;
  readonly target: Int32Array;
  readonly damageType: Uint8Array;
  readonly armorType: Uint8Array;
  readonly critChance: Float32Array;
  readonly aggroRange: Float32Array;
  /** Seconds since the unit was last hit (drives the hit flash and the health bar). */
  readonly lastHit: Float32Array;

  // Morale
  readonly morale: Float32Array;
  readonly moraleState: Uint8Array;
  readonly discipline: Float32Array;

  // Formation slot
  readonly formation: Int32Array;
  readonly slot: Int32Array;
  readonly slotX: Float32Array;
  readonly slotZ: Float32Array;
  readonly slotRot: Float32Array;
  /** Key (goal cell) of the flow field the unit follows when its slot is out of sight, -1 = none. */
  readonly flow: Int32Array;

  // Faction
  readonly team: Uint8Array;

  // Unit
  readonly unitType: Uint16Array;
  readonly state: Uint8Array;
  readonly stateTime: Float32Array;
  readonly order: Uint8Array;

  constructor(readonly capacity: number) {
    const f32 = () => new Float32Array(capacity);
    this.x = f32();
    this.z = f32();
    this.prevX = f32();
    this.prevZ = f32();
    this.rot = f32();
    this.prevRot = f32();
    this.vx = f32();
    this.vz = f32();
    this.maxSpeed = f32();
    this.radius = f32();
    this.mass = f32();
    this.hp = f32();
    this.maxHp = f32();
    this.attack = f32();
    this.defense = f32();
    this.reach = f32();
    this.attackPeriod = f32();
    this.attackWindup = f32();
    this.attackTimer = f32();
    this.swing = f32();
    this.target = new Int32Array(capacity).fill(NO_ENTITY);
    this.damageType = new Uint8Array(capacity);
    this.armorType = new Uint8Array(capacity);
    this.critChance = f32();
    this.aggroRange = f32();
    this.lastHit = f32();
    this.morale = f32();
    this.moraleState = new Uint8Array(capacity);
    this.discipline = f32();
    this.formation = new Int32Array(capacity).fill(NO_ENTITY);
    this.slot = new Int32Array(capacity).fill(NO_ENTITY);
    this.slotX = f32();
    this.slotZ = f32();
    this.slotRot = f32();
    this.flow = new Int32Array(capacity).fill(NO_ENTITY);
    this.team = new Uint8Array(capacity);
    this.unitType = new Uint16Array(capacity);
    this.state = new Uint8Array(capacity);
    this.stateTime = f32();
    this.order = new Uint8Array(capacity);
  }
}

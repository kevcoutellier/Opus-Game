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
  /** A hero steered by the player in third person (HeroSystem): no slot, no automatic fighting. */
  Direct: 5,
} as const;
export type OrderId = (typeof Order)[keyof typeof Order];

/** What the current swing does when it lands. */
export const SwingKind = {
  /** A blow at the target. */
  Blow: 0,
  /** A missile loosed at the target (bow animation). */
  Shot: 1,
  /** A free blow hitting every enemy in an arc in front (hero under direct control). */
  Arc: 2,
  /** A spell being cast: no blow, the HeroSystem releases the ability. */
  Cast: 3,
} as const;
export type SwingKindId = (typeof SwingKind)[keyof typeof SwingKind];

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
  /** Total duration of the current swing or shot (animation). */
  readonly swingDuration: Float32Array;
  /** SwingKind of the current swing. */
  readonly swingKind: Uint8Array;
  readonly target: Int32Array;
  readonly damageType: Uint8Array;
  readonly armorType: Uint8Array;
  readonly critChance: Float32Array;
  readonly aggroRange: Float32Array;
  /** Seconds since the unit was last hit (drives the hit flash and the health bar). */
  readonly lastHit: Float32Array;
  /** Missile range (m), 0 for melee-only units; the other missile stats follow. */
  readonly range: Float32Array;
  readonly rangedAttack: Float32Array;
  readonly rangedPeriod: Float32Array;
  readonly rangedWindup: Float32Array;
  /** Distance to its target at which an engaging unit stops closing in (set by the combat system). */
  readonly engageDist: Float32Array;
  /** Extra enemies hit by each melee blow. */
  readonly cleave: Uint8Array;
  /** Fraction of frontal missile damage stopped by the shield. */
  readonly shield: Float32Array;
  /** Counter-charge multiplier of spears set against cavalry, 0 = cannot brace. */
  readonly brace: Float32Array;

  // Cavalry charge (ChargeSystem)
  /** Impact damage at full gallop, 0 for units that cannot charge. */
  readonly chargePower: Float32Array;
  readonly chargeState: Uint8Array;
  /** Seconds in the current charge state. */
  readonly chargeTime: Float32Array;
  /** Seconds before the next charge. */
  readonly chargeCooldown: Float32Array;
  /** Multiplier of the maximum speed (gallop of a charge). */
  readonly speedBoost: Float32Array;

  // Abilities and heroes
  /** Seconds left frozen or stunned: no movement, no blow. */
  readonly stun: Float32Array;
  /** Seconds left encased in ice (a stun that shows). */
  readonly frozen: Float32Array;
  /** Seconds left untouchable (dodge roll). */
  readonly invulnerable: Float32Array;
  /** Buffs: damage multiplier, attack-rate multiplier, flat defence bonus. */
  readonly damageMul: Float32Array;
  readonly hasteMul: Float32Array;
  readonly defenseBonus: Float32Array;
  /** Morale aura of a hero: radius (m, 0 = none) and morale points per second given to allies. */
  readonly auraRadius: Float32Array;
  readonly auraMorale: Float32Array;
  /** Desired velocity direction of a directly controlled hero (unit vector or zero). */
  readonly steerX: Float32Array;
  readonly steerZ: Float32Array;
  /** Damage multiplier of the current swing (heavy blow). */
  readonly swingPower: Float32Array;

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
    this.swingDuration = new Float32Array(capacity).fill(1);
    this.swingKind = new Uint8Array(capacity);
    this.target = new Int32Array(capacity).fill(NO_ENTITY);
    this.damageType = new Uint8Array(capacity);
    this.armorType = new Uint8Array(capacity);
    this.critChance = f32();
    this.aggroRange = f32();
    this.lastHit = f32();
    this.range = f32();
    this.rangedAttack = f32();
    this.rangedPeriod = f32();
    this.rangedWindup = f32();
    this.engageDist = f32();
    this.cleave = new Uint8Array(capacity);
    this.shield = f32();
    this.brace = f32();
    this.chargePower = f32();
    this.chargeState = new Uint8Array(capacity);
    this.chargeTime = f32();
    this.chargeCooldown = f32();
    this.speedBoost = new Float32Array(capacity).fill(1);
    this.stun = f32();
    this.invulnerable = f32();
    this.frozen = f32();
    this.damageMul = new Float32Array(capacity).fill(1);
    this.hasteMul = new Float32Array(capacity).fill(1);
    this.defenseBonus = f32();
    this.auraRadius = f32();
    this.auraMorale = f32();
    this.steerX = f32();
    this.steerZ = f32();
    this.swingPower = new Float32Array(capacity).fill(1);
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

import * as THREE from 'three';
import type { UnitModel } from '../units/UnitStats';
import { merge, paint, tag } from './GeometryUtils';

/**
 * Procedural low-poly units of the Human Alliance and of the Dark Legion (~1.8 m before the per-type scale,
 * facing +Z). Every vertex carries:
 *  - `aBone`: 0 body, 1 left leg, 2 right leg, 3 weapon arm, 4 shield/bow arm, 5 weapon (wrist-mounted),
 *    6-9 horse legs (front-left, front-right, back-left, back-right), 10 horse body; animated in the
 *    vertex shader (see UnitRenderer);
 *  - `aTeam`: 1 where the faction colour replaces the painted colour (tabard, shield face, caparison);
 *  - `aMount`: 1 for a rider, built standing on the infantry skeleton and lifted onto the saddle by the shader.
 * Pivots used by the shader: hips y = 0.92, shoulders (±0.27, 1.42, 0), weapon hand (0.29, 0.93, 0.05),
 * horse legs (±0.2, 1.05, ±0.61), horse body (0, 1.2, 0).
 */
export const BONE = {
  Body: 0,
  LeftLeg: 1,
  RightLeg: 2,
  WeaponArm: 3,
  ShieldArm: 4,
  Weapon: 5,
  HorseFrontLeft: 6,
  HorseFrontRight: 7,
  HorseBackLeft: 8,
  HorseBackRight: 9,
  HorseBody: 10,
} as const;

const SHOULDER_L = new THREE.Vector3(-0.27, 1.42, 0);
/** Bow-arm angle at full aim: the bow is modelled in that pose, then counter-rotated to rest. */
export const BOW_AIM = -1.5;

const SKIN = 0xc79a74;
const METAL = 0x9a9ea6;
const PLATE = 0xb8bcc4;
const DARK_METAL = 0x5d6068;
const LEATHER = 0x5e4630;
const CLOTH = 0x3a332b;
const WOOD = 0x6b4a2b;
const STEEL = 0xd7dbe2;
const TEAM = 0xffffff;
const GOLD = 0xd9c89a;
const ORC_SKIN = 0x5d7a38;
const OGRE_SKIN = 0x8a7456;
const ELF_SKIN = 0x9d93ad;
const TUSK = 0xe9e1c6;
const IRON = 0x47443f;
const FUR = 0x6b5640;
const RAGS = 0x3b2f23;

type Part = { geometry: THREE.BufferGeometry; color: number; bone: number; team?: boolean; mount?: boolean };

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function build(parts: Part[]): THREE.BufferGeometry {
  const pieces = parts.map((p) => {
    const g = paint(p.geometry, p.color);
    tag(g, 'aBone', p.bone);
    tag(g, 'aTeam', p.team ? 1 : 0);
    tag(g, 'aMount', p.mount ? 1 : 0);
    return g;
  });
  const geometry = merge(pieces);
  geometry.computeVertexNormals();
  return geometry;
}

/** Marks parts as belonging to a rider. */
const mounted = (parts: Part[]): Part[] => parts.map((p) => ({ ...p, mount: true }));

// ------------------------------------------------------------------ humanoid

type Head = 'human' | 'orc' | 'elf' | 'ogre';
type Helmet = 'greathelm' | 'kettle' | 'hood' | 'hornedcap' | 'templar' | 'bighorns' | 'headband' | 'none';
type Torso = 'tabard' | 'bare' | 'plate' | 'leather' | 'elf';

interface Body {
  skin: number;
  head: Head;
  helmet: Helmet;
  torso: Torso;
  armour?: number;
  cloth?: number;
  boots?: number;
  /** Arm thickness (orcs and ogres are bulkier). */
  arm?: number;
  seated?: boolean;
}

function legs(cloth: number, boots: number, width: number): Part[] {
  const parts: Part[] = [];
  for (const [side, bone] of [
    [-1, BONE.LeftLeg],
    [1, BONE.RightLeg],
  ] as const) {
    parts.push({ geometry: box(width, 0.62, 0.17, side * 0.11, 0.62, 0), color: cloth, bone });
    parts.push({ geometry: box(width + 0.01, 0.3, 0.24, side * 0.11, 0.15, 0.03), color: boots, bone });
  }
  return parts;
}

/** Rider's legs astride the saddle (static, on the body bone). */
function seatedLegs(cloth: number, boots: number): Part[] {
  const parts: Part[] = [];
  for (const side of [-1, 1]) {
    parts.push({ geometry: box(0.15, 0.15, 0.45, side * 0.3, 0.9, 0.12), color: cloth, bone: BONE.Body });
    parts.push({ geometry: box(0.14, 0.5, 0.15, side * 0.36, 0.62, 0.3), color: boots, bone: BONE.Body });
  }
  return parts;
}

function head(kind: Head, skin: number): Part[] {
  switch (kind) {
    case 'orc':
      return [
        { geometry: new THREE.IcosahedronGeometry(0.15, 1).scale(1, 0.95, 1.05).translate(0, 1.6, 0.07), color: skin, bone: BONE.Body },
        { geometry: box(0.2, 0.08, 0.14, 0, 1.52, 0.13), color: skin, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.018, 0.07, 4).translate(-0.06, 1.58, 0.2), color: TUSK, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.018, 0.07, 4).translate(0.06, 1.58, 0.2), color: TUSK, bone: BONE.Body },
      ];
    case 'ogre':
      return [
        { geometry: new THREE.IcosahedronGeometry(0.14, 1).scale(1.1, 0.9, 1).translate(0, 1.58, 0.1), color: skin, bone: BONE.Body },
        { geometry: box(0.24, 0.1, 0.16, 0, 1.5, 0.17), color: skin, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.022, 0.06, 4).translate(-0.07, 1.56, 0.25), color: TUSK, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.022, 0.06, 4).translate(0.07, 1.56, 0.25), color: TUSK, bone: BONE.Body },
      ];
    case 'elf':
      return [
        { geometry: new THREE.IcosahedronGeometry(0.12, 1).scale(0.9, 1.1, 1).translate(0, 1.67, 0.01), color: skin, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.03, 0.16, 4).rotateZ(Math.PI / 2 + 0.3).translate(-0.14, 1.7, 0), color: skin, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.03, 0.16, 4).rotateZ(-Math.PI / 2 - 0.3).translate(0.14, 1.7, 0), color: skin, bone: BONE.Body },
        { geometry: box(0.2, 0.36, 0.08, 0, 1.6, -0.1), color: 0xe8e6ee, bone: BONE.Body },
      ];
    default:
      return [{ geometry: new THREE.IcosahedronGeometry(0.13, 1).translate(0, 1.66, 0.01), color: skin, bone: BONE.Body }];
  }
}

function helmet(kind: Helmet): Part[] {
  switch (kind) {
    case 'greathelm':
      return [
        { geometry: new THREE.CylinderGeometry(0.155, 0.16, 0.26, 8).translate(0, 1.72, 0), color: METAL, bone: BONE.Body },
        { geometry: box(0.24, 0.03, 0.02, 0, 1.72, 0.155), color: 0x1d1d20, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.05, 0.14, 6).translate(0, 1.91, 0), color: TEAM, bone: BONE.Body, team: true },
      ];
    case 'templar':
      return [
        { geometry: new THREE.CylinderGeometry(0.16, 0.165, 0.3, 8).translate(0, 1.72, 0), color: PLATE, bone: BONE.Body },
        { geometry: box(0.26, 0.03, 0.02, 0, 1.74, 0.16), color: 0x1d1d20, bone: BONE.Body },
        { geometry: box(0.03, 0.18, 0.02, 0, 1.7, 0.165), color: GOLD, bone: BONE.Body },
      ];
    case 'kettle':
      return [
        { geometry: new THREE.CylinderGeometry(0.1, 0.28, 0.07, 10).translate(0, 1.76, 0), color: METAL, bone: BONE.Body },
        { geometry: new THREE.ConeGeometry(0.15, 0.2, 10).translate(0, 1.87, 0), color: METAL, bone: BONE.Body },
      ];
    case 'hood':
      return [
        { geometry: new THREE.ConeGeometry(0.17, 0.34, 8).translate(0, 1.8, -0.02), color: 0x3d4a30, bone: BONE.Body },
        { geometry: box(0.3, 0.2, 0.08, 0, 1.52, -0.12), color: 0x3d4a30, bone: BONE.Body },
      ];
    case 'hornedcap': {
      const horn = (side: number) => new THREE.ConeGeometry(0.045, 0.22, 6).rotateZ(-side * 1.05).translate(side * 0.19, 1.8, 0.02);
      return [
        { geometry: new THREE.SphereGeometry(0.165, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.66, 0.05), color: IRON, bone: BONE.Body },
        { geometry: horn(-1), color: TUSK, bone: BONE.Body },
        { geometry: horn(1), color: TUSK, bone: BONE.Body },
      ];
    }
    case 'bighorns': {
      const horn = (side: number) =>
        new THREE.ConeGeometry(0.07, 0.5, 6).rotateZ(-side * 0.8).rotateX(-0.3).translate(side * 0.3, 1.85, 0.05);
      return [
        { geometry: new THREE.SphereGeometry(0.17, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.64, 0.08), color: IRON, bone: BONE.Body },
        { geometry: box(0.36, 0.05, 0.36, 0, 1.64, 0.08), color: 0x2a2724, bone: BONE.Body },
        { geometry: horn(-1), color: TUSK, bone: BONE.Body },
        { geometry: horn(1), color: TUSK, bone: BONE.Body },
      ];
    }
    case 'headband':
      return [
        { geometry: new THREE.SphereGeometry(0.14, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.68, -0.01), color: 0x3a2618, bone: BONE.Body },
        { geometry: new THREE.CylinderGeometry(0.137, 0.137, 0.035, 10).translate(0, 1.72, 0.01), color: TEAM, bone: BONE.Body, team: true },
      ];
    default:
      return [];
  }
}

function torso(kind: Torso, skin: number, armour: number): Part[] {
  const shoulders = (w: number, color: number): Part[] => [
    { geometry: box(0.5 + w, 0.12, 0.3, 0, 1.47, 0), color, bone: BONE.Body },
    { geometry: box(0.16, 0.12, 0.3, -0.27 - w / 2, 1.43, 0), color, bone: BONE.Body },
    { geometry: box(0.16, 0.12, 0.3, 0.27 + w / 2, 1.43, 0), color, bone: BONE.Body },
  ];
  switch (kind) {
    case 'bare': {
      const spike = (side: number) => new THREE.ConeGeometry(0.05, 0.16, 5).translate(side * 0.3, 1.58, 0);
      return [
        { geometry: box(0.5, 0.56, 0.3, 0, 1.2, 0), color: skin, bone: BONE.Body },
        { geometry: box(0.52, 0.2, 0.32, 0, 1.08, 0), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.08, 0.5, 0.33, 0.12, 1.25, 0), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.54, 0.14, 0.33, 0, 0.93, 0), color: FUR, bone: BONE.Body },
        { geometry: box(0.2, 0.14, 0.34, -0.3, 1.45, 0), color: IRON, bone: BONE.Body },
        { geometry: box(0.2, 0.14, 0.34, 0.3, 1.45, 0), color: IRON, bone: BONE.Body },
        { geometry: spike(-1), color: IRON, bone: BONE.Body },
        { geometry: spike(1), color: IRON, bone: BONE.Body },
      ];
    }
    case 'plate':
      return [
        { geometry: box(0.46, 0.6, 0.28, 0, 1.2, 0), color: PLATE, bone: BONE.Body },
        { geometry: box(0.36, 0.62, 0.02, 0, 1.12, 0.15), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.36, 0.62, 0.02, 0, 1.12, -0.15), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.06, 0.34, 0.025, 0, 1.2, 0.165), color: GOLD, bone: BONE.Body },
        { geometry: box(0.22, 0.06, 0.025, 0, 1.28, 0.165), color: GOLD, bone: BONE.Body },
        { geometry: box(0.48, 0.12, 0.3, 0, 0.93, 0), color: LEATHER, bone: BONE.Body },
        ...shoulders(0.06, PLATE),
      ];
    case 'leather':
      return [
        { geometry: box(0.42, 0.56, 0.25, 0, 1.2, 0), color: LEATHER, bone: BONE.Body },
        { geometry: box(0.3, 0.46, 0.02, 0, 1.1, 0.135), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.44, 0.12, 0.27, 0, 0.94, 0), color: 0x3b2c1e, bone: BONE.Body },
        // Quiver on the back.
        { geometry: new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6).rotateZ(0.35).translate(0.08, 1.3, -0.18), color: 0x4a3322, bone: BONE.Body },
        { geometry: box(0.1, 0.1, 0.06, 0.18, 1.6, -0.18), color: 0xcfc7b0, bone: BONE.Body },
      ];
    case 'elf':
      return [
        { geometry: box(0.36, 0.56, 0.22, 0, 1.2, 0), color: 0x2a2530, bone: BONE.Body },
        { geometry: box(0.08, 0.6, 0.24, -0.08, 1.2, 0.005), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.38, 0.1, 0.24, 0, 0.94, 0), color: 0x1d1a22, bone: BONE.Body },
        { geometry: box(0.44, 0.1, 0.26, 0, 1.46, 0), color: 0x3b3444, bone: BONE.Body },
        { geometry: new THREE.CylinderGeometry(0.055, 0.055, 0.55, 6).rotateZ(-0.35).translate(-0.08, 1.3, -0.17), color: 0x1d1a22, bone: BONE.Body },
      ];
    default:
      return [
        { geometry: box(0.44, 0.58, 0.26, 0, 1.2, 0), color: TEAM, bone: BONE.Body, team: true },
        { geometry: box(0.46, 0.14, 0.28, 0, 0.94, 0), color: LEATHER, bone: BONE.Body },
        ...shoulders(0, armour),
      ];
  }
}

function arms(colour: number, skin: number, thickness: number): Part[] {
  const arm = (side: -1 | 1, bone: number): Part[] => [
    { geometry: box(thickness, 0.48, thickness + 0.01, side * 0.29, 1.19, 0), color: colour, bone },
    { geometry: box(0.1, 0.1, 0.1, side * 0.29, 0.93, 0.02), color: skin, bone },
  ];
  return [...arm(1, BONE.WeaponArm), ...arm(-1, BONE.ShieldArm)];
}

function humanoid(b: Body): Part[] {
  const cloth = b.cloth ?? CLOTH;
  const boots = b.boots ?? LEATHER;
  const bulky = b.torso === 'bare';
  const sleeves = { bare: b.skin, elf: 0x2a2530, leather: LEATHER, plate: PLATE, tabard: b.armour ?? METAL }[b.torso];
  return [
    ...(b.seated ? seatedLegs(cloth, boots) : legs(cloth, boots, bulky ? 0.17 : 0.15)),
    ...torso(b.torso, b.skin, b.armour ?? METAL),
    ...head(b.head, b.skin),
    ...helmet(b.helmet),
    ...arms(sleeves, b.skin, b.arm ?? (bulky ? 0.14 : 0.11)),
  ];
}

// ------------------------------------------------------------------ weapons and shields

/** A weapon modelled along +Y from the hand, tilted forward into the grip. */
function inHand(geometry: THREE.BufferGeometry): THREE.BufferGeometry {
  return geometry.rotateX(1.05).translate(0.29, 0.93, 0.05);
}

const sword = (length = 0.8, colour = STEEL): Part[] => [
  { geometry: inHand(new THREE.BoxGeometry(0.06, length, 0.02).translate(0, 0.06 + length / 2, 0)), color: colour, bone: BONE.Weapon },
  { geometry: inHand(new THREE.BoxGeometry(0.22, 0.04, 0.05).translate(0, 0.05, 0)), color: DARK_METAL, bone: BONE.Weapon },
];

const curvedBlade = (): Part[] => [
  { geometry: inHand(new THREE.BoxGeometry(0.05, 0.45, 0.02).translate(0, 0.28, 0)), color: 0xc9c3d6, bone: BONE.Weapon },
  { geometry: inHand(new THREE.BoxGeometry(0.05, 0.35, 0.02).rotateX(0.35).translate(0, 0.62, 0.06)), color: 0xc9c3d6, bone: BONE.Weapon },
];

const axe = (): Part[] => [
  { geometry: inHand(new THREE.CylinderGeometry(0.025, 0.03, 0.95, 5).translate(0, 0.42, 0)), color: WOOD, bone: BONE.Weapon },
  { geometry: inHand(new THREE.BoxGeometry(0.04, 0.3, 0.26).translate(0, 0.8, 0.1)), color: 0x8d8f93, bone: BONE.Weapon },
];

const club = (size = 1): Part[] => [
  { geometry: inHand(new THREE.CylinderGeometry(0.1 * size, 0.035, 1.0 * size, 6).translate(0, 0.5 * size, 0)), color: 0x5a4028, bone: BONE.Weapon },
  { geometry: inHand(new THREE.ConeGeometry(0.035, 0.1, 4).rotateZ(Math.PI / 2).translate(0.1 * size, 0.85 * size, 0)), color: IRON, bone: BONE.Weapon },
  { geometry: inHand(new THREE.ConeGeometry(0.035, 0.1, 4).rotateZ(-Math.PI / 2).translate(-0.1 * size, 0.75 * size, 0)), color: IRON, bone: BONE.Weapon },
];

const mace = (): Part[] => [
  { geometry: inHand(new THREE.CylinderGeometry(0.025, 0.025, 0.7, 5).translate(0, 0.35, 0)), color: 0x3b2c1e, bone: BONE.Weapon },
  { geometry: inHand(new THREE.IcosahedronGeometry(0.09, 0).translate(0, 0.72, 0)), color: METAL, bone: BONE.Weapon },
];

/** Spear or lance held low and forward (thrust style), `lift` radians above the horizontal. */
function polearm(length: number, lift: number, shaftColour: number, tipColour: number, tipLength = 0.28): Part[] {
  const tilt = Math.PI / 2 - lift;
  const grip = (g: THREE.BufferGeometry) => g.rotateX(tilt).translate(0.29, 0.95, 0.05);
  const tipY = length / 3 + length / 2 + tipLength / 2 - 0.02;
  return [
    { geometry: grip(new THREE.CylinderGeometry(0.022, 0.03, length, 5).translate(0, length / 3, 0)), color: shaftColour, bone: BONE.Weapon },
    { geometry: grip(new THREE.ConeGeometry(0.05, tipLength, 5).translate(0, tipY, 0)), color: tipColour, bone: BONE.Weapon },
  ];
}

const heater = (w = 0.5, h = 0.64): Part[] => [
  { geometry: box(w, h, 0.05, -0.33, 1.08, 0.2), color: DARK_METAL, bone: BONE.ShieldArm },
  { geometry: box(w - 0.08, h - 0.08, 0.02, -0.33, 1.09, 0.235), color: TEAM, bone: BONE.ShieldArm, team: true },
  { geometry: box(0.08, h * 0.62, 0.025, -0.33, 1.1, 0.25), color: GOLD, bone: BONE.ShieldArm },
];

const roundShield = (r: number, rim: number): Part[] => [
  { geometry: new THREE.CylinderGeometry(r, r, 0.05, 12).rotateX(Math.PI / 2).translate(-0.33, 1.1, 0.2), color: rim, bone: BONE.ShieldArm },
  {
    geometry: new THREE.CylinderGeometry(r - 0.05, r - 0.05, 0.02, 12).rotateX(Math.PI / 2).translate(-0.33, 1.1, 0.232),
    color: TEAM,
    bone: BONE.ShieldArm,
    team: true,
  },
];

/** Longbow, modelled vertical at full aim then counter-rotated so the shader's aiming pose restores it. */
function bow(colour: number): Part[] {
  const hand = new THREE.Vector3(-0.29, 1.405, 0.49);
  const rest = (g: THREE.BufferGeometry) =>
    g.translate(-SHOULDER_L.x, -SHOULDER_L.y, -SHOULDER_L.z).rotateX(-BOW_AIM).translate(SHOULDER_L.x, SHOULDER_L.y, SHOULDER_L.z);
  const parts: Part[] = [];
  const segments = 6;
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments - 0.5;
    const t1 = (i + 1) / segments - 0.5;
    const y0 = t0 * 1.3;
    const y1 = t1 * 1.3;
    // The limbs bend back towards the archer.
    const z0 = -Math.pow(Math.abs(t0) * 2, 2) * 0.16;
    const z1 = -Math.pow(Math.abs(t1) * 2, 2) * 0.16;
    const limb = new THREE.BoxGeometry(0.035, Math.hypot(y1 - y0, z1 - z0), 0.035)
      .rotateX(Math.atan2(z1 - z0, y1 - y0))
      .translate(hand.x, hand.y + (y0 + y1) / 2, hand.z + (z0 + z1) / 2);
    parts.push({ geometry: rest(limb), color: colour, bone: BONE.ShieldArm });
  }
  parts.push({ geometry: rest(new THREE.BoxGeometry(0.008, 1.26, 0.008).translate(hand.x, hand.y, hand.z - 0.16)), color: 0xe8e2d0, bone: BONE.ShieldArm });
  return parts;
}

const cape = (): Part[] => [{ geometry: box(0.5, 1.0, 0.04, 0, 1.0, -0.18), color: TEAM, bone: BONE.Body, team: true }];

const banner = (): Part[] => [
  { geometry: new THREE.CylinderGeometry(0.02, 0.02, 1.6, 5).translate(0.12, 1.9, -0.2), color: WOOD, bone: BONE.Body },
  { geometry: box(0.02, 0.5, 0.36, 0.12, 2.45, -0.02), color: TEAM, bone: BONE.Body, team: true },
  { geometry: new THREE.ConeGeometry(0.04, 0.12, 4).translate(0.12, 2.76, -0.2), color: TUSK, bone: BONE.Body },
];

// ------------------------------------------------------------------ horse

function horse(coat: number, mane: number): Part[] {
  const leg = (x: number, z: number, bone: number): Part[] => [
    { geometry: box(0.13, 0.9, 0.15, x, 0.6, z), color: coat, bone },
    { geometry: box(0.15, 0.14, 0.18, x, 0.08, z + 0.01), color: 0x2a2420, bone },
  ];
  return [
    { geometry: box(0.6, 0.62, 1.6, 0, 1.22, 0), color: coat, bone: BONE.HorseBody },
    { geometry: box(0.3, 0.7, 0.34, 0, 1.62, 0.82), color: coat, bone: BONE.HorseBody },
    { geometry: box(0.24, 0.26, 0.6, 0, 1.92, 1.1), color: coat, bone: BONE.HorseBody },
    { geometry: box(0.08, 0.5, 0.3, 0, 1.78, 0.72), color: mane, bone: BONE.HorseBody },
    { geometry: box(0.1, 0.55, 0.1, 0, 1.1, -0.86), color: mane, bone: BONE.HorseBody },
    // Faction caparison and saddle.
    { geometry: box(0.68, 0.42, 1.66, 0, 1.14, 0), color: TEAM, bone: BONE.HorseBody, team: true },
    { geometry: box(0.5, 0.1, 0.5, 0, 1.57, -0.08), color: LEATHER, bone: BONE.HorseBody },
    ...leg(-0.2, 0.61, BONE.HorseFrontLeft),
    ...leg(0.2, 0.61, BONE.HorseFrontRight),
    ...leg(-0.2, -0.61, BONE.HorseBackLeft),
    ...leg(0.2, -0.61, BONE.HorseBackRight),
  ];
}

// ------------------------------------------------------------------ models

function createParts(model: UnitModel): Part[] {
  switch (model) {
    case 'human_footman':
      return [...humanoid({ skin: SKIN, head: 'human', helmet: 'greathelm', torso: 'tabard' }), ...sword(), ...heater()];
    case 'human_spearman':
      return [
        ...humanoid({ skin: SKIN, head: 'human', helmet: 'kettle', torso: 'tabard', armour: LEATHER }),
        ...polearm(2.7, 0.21, WOOD, STEEL),
        ...roundShield(0.3, DARK_METAL),
      ];
    case 'human_archer':
      return [...humanoid({ skin: SKIN, head: 'human', helmet: 'hood', torso: 'leather' }), ...bow(0x6b4a2b)];
    case 'human_templar':
      return [
        ...humanoid({ skin: SKIN, head: 'human', helmet: 'templar', torso: 'plate', cloth: 0x8e9299, boots: 0x6a6e76 }),
        ...mace(),
        ...heater(0.56, 0.76),
      ];
    case 'human_knight':
      return [
        ...horse(0xd8d4cc, 0x8a8278),
        ...mounted([
          ...humanoid({ skin: SKIN, head: 'human', helmet: 'greathelm', torso: 'plate', seated: true }),
          ...polearm(3.4, 0.05, 0xe6e0d0, STEEL, 0.35),
          ...heater(0.44, 0.56),
        ]),
      ];
    case 'hero_curian':
      return [
        ...humanoid({ skin: SKIN, head: 'human', helmet: 'headband', torso: 'tabard', armour: 0xc9b27a }),
        ...cape(),
        ...sword(0.95, 0xeaf2ff),
        ...roundShield(0.22, 0xc9b27a),
      ];
    case 'orc_warrior':
      return [
        ...humanoid({ skin: ORC_SKIN, head: 'orc', helmet: 'hornedcap', torso: 'bare', cloth: RAGS, boots: FUR }),
        ...axe(),
        ...roundShield(0.32, WOOD),
        { geometry: new THREE.ConeGeometry(0.07, 0.12, 6).rotateX(Math.PI / 2).translate(-0.33, 1.1, 0.29), color: IRON, bone: BONE.ShieldArm },
      ];
    case 'orc_spearman':
      return [
        ...humanoid({ skin: ORC_SKIN, head: 'orc', helmet: 'hornedcap', torso: 'bare', cloth: RAGS, boots: FUR }),
        ...polearm(2.8, 0.24, 0x55391f, 0x7d7f83, 0.38),
        { geometry: box(0.36, 0.44, 0.05, -0.35, 1.1, 0.2), color: FUR, bone: BONE.ShieldArm },
        { geometry: box(0.1, 0.36, 0.02, -0.35, 1.1, 0.235), color: TEAM, bone: BONE.ShieldArm, team: true },
      ];
    case 'dark_elf_archer':
      return [...humanoid({ skin: ELF_SKIN, head: 'elf', helmet: 'none', torso: 'elf', cloth: 0x1d1a22, boots: 0x15131a }), ...bow(0x2a2226)];
    case 'dark_elf_rider':
      return [
        ...horse(0x1e1b1f, 0x0f0d10),
        ...mounted([...humanoid({ skin: ELF_SKIN, head: 'elf', helmet: 'none', torso: 'elf', cloth: 0x1d1a22, boots: 0x15131a, seated: true }), ...curvedBlade()]),
      ];
    case 'ogre':
      return [...humanoid({ skin: OGRE_SKIN, head: 'ogre', helmet: 'none', torso: 'bare', cloth: RAGS, boots: FUR, arm: 0.16 }), ...club()];
    case 'hero_likuku':
      return [
        ...humanoid({ skin: OGRE_SKIN, head: 'ogre', helmet: 'bighorns', torso: 'bare', cloth: RAGS, boots: FUR, arm: 0.17 }),
        ...club(1.25),
        ...banner(),
      ];
  }
}

export function createUnitGeometry(model: UnitModel): THREE.BufferGeometry {
  return build(createParts(model));
}

/** Melee animation style per model: 0 = overhead swing, 1 = thrust. Ranged shots use BOW_STYLE. */
export const ATTACK_STYLE: Record<UnitModel, number> = {
  human_footman: 0,
  human_spearman: 1,
  human_archer: 0,
  human_knight: 1,
  human_templar: 0,
  hero_curian: 0,
  orc_warrior: 0,
  orc_spearman: 1,
  dark_elf_archer: 0,
  dark_elf_rider: 0,
  ogre: 0,
  hero_likuku: 0,
};
export const BOW_STYLE = 2;

/** Models with a horse (the rider sits on the saddle, the horse gallops). */
export const MOUNTED_MODELS: ReadonlySet<UnitModel> = new Set(['human_knight', 'dark_elf_rider']);

/** Walk-cycle radians per metre travelled (a horse's stride is much longer than a man's). */
export const STRIDE: Record<UnitModel, number> = {
  human_footman: 3.3,
  human_spearman: 3.3,
  human_archer: 3.3,
  human_knight: 1.25,
  human_templar: 3.1,
  hero_curian: 3.3,
  orc_warrior: 3.1,
  orc_spearman: 3.1,
  dark_elf_archer: 3.4,
  dark_elf_rider: 1.25,
  ogre: 2.1,
  hero_likuku: 1.9,
};

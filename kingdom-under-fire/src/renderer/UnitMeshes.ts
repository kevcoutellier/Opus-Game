import * as THREE from 'three';
import type { UnitModel } from '../units/UnitStats';
import { merge, paint, tag } from './GeometryUtils';

/**
 * Procedural low-poly soldiers of the Human Alliance and orcs of the Dark Legion (~1.8 m before the
 * per-type scale, facing +Z). Every vertex carries:
 *  - `aBone`: 0 body, 1 left leg, 2 right leg, 3 weapon arm, 4 shield arm, 5 weapon (wrist-mounted),
 *    animated in the vertex shader;
 *  - `aTeam`: 1 where the faction colour replaces the painted colour (tabard, shield face, plume).
 * Pivots used by the shader: hips at y = 0.92, shoulders at (±0.27, 1.42, 0), weapon hand at (0.29, 0.93, 0.05).
 */
export const BONE = { Body: 0, LeftLeg: 1, RightLeg: 2, WeaponArm: 3, ShieldArm: 4, Weapon: 5 } as const;

const SKIN = 0xc79a74;
const METAL = 0x9a9ea6;
const DARK_METAL = 0x5d6068;
const LEATHER = 0x5e4630;
const CLOTH = 0x3a332b;
const WOOD = 0x6b4a2b;
const TEAM = 0xffffff;
const ORC_SKIN = 0x5d7a38;
const TUSK = 0xe9e1c6;
const IRON = 0x47443f;
const FUR = 0x6b5640;
const RAGS = 0x3b2f23;

type Part = { geometry: THREE.BufferGeometry; color: number; bone: number; team?: boolean };

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

function build(parts: Part[]): THREE.BufferGeometry {
  const pieces = parts.map((p) => {
    const g = paint(p.geometry, p.color);
    tag(g, 'aBone', p.bone);
    tag(g, 'aTeam', p.team ? 1 : 0);
    return g;
  });
  const geometry = merge(pieces);
  geometry.computeVertexNormals();
  return geometry;
}

function legs(cloth = CLOTH, boots = LEATHER, width = 0.15): Part[] {
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

function torso(tabardTeam: boolean, armour: number): Part[] {
  return [
    { geometry: box(0.44, 0.58, 0.26, 0, 1.2, 0), color: TEAM, bone: BONE.Body, team: tabardTeam },
    { geometry: box(0.46, 0.14, 0.28, 0, 0.94, 0), color: LEATHER, bone: BONE.Body },
    { geometry: box(0.5, 0.12, 0.3, 0, 1.47, 0), color: armour, bone: BONE.Body },
    { geometry: box(0.16, 0.12, 0.3, -0.27, 1.43, 0), color: armour, bone: BONE.Body },
    { geometry: box(0.16, 0.12, 0.3, 0.27, 1.43, 0), color: armour, bone: BONE.Body },
    { geometry: new THREE.IcosahedronGeometry(0.13, 1).translate(0, 1.66, 0.01), color: SKIN, bone: BONE.Body },
  ];
}

function arm(side: -1 | 1, bone: number, colour: number, skin = SKIN, thickness = 0.11): Part[] {
  return [
    { geometry: box(thickness, 0.48, thickness + 0.01, side * 0.29, 1.19, 0), color: colour, bone },
    { geometry: box(0.1, 0.1, 0.1, side * 0.29, 0.93, 0.02), color: skin, bone },
  ];
}

/** Orc of Hexter: green hide, hunched tusked head, iron cap with horns, spiked pauldrons. */
function orcBody(): Part[] {
  const horn = (side: number) =>
    new THREE.ConeGeometry(0.045, 0.22, 6).rotateZ(-side * 1.05).translate(side * 0.19, 1.8, 0.02);
  const spike = (side: number) => new THREE.ConeGeometry(0.05, 0.16, 5).translate(side * 0.3, 1.58, 0);
  return [
    ...legs(RAGS, FUR, 0.17),
    // Bare green chest under a faction-coloured war harness.
    { geometry: box(0.5, 0.56, 0.3, 0, 1.2, 0), color: ORC_SKIN, bone: BONE.Body },
    { geometry: box(0.52, 0.2, 0.32, 0, 1.08, 0), color: TEAM, bone: BONE.Body, team: true },
    { geometry: box(0.08, 0.5, 0.33, 0.12, 1.25, 0), color: TEAM, bone: BONE.Body, team: true },
    { geometry: box(0.54, 0.14, 0.33, 0, 0.93, 0), color: FUR, bone: BONE.Body },
    { geometry: box(0.2, 0.14, 0.34, -0.3, 1.45, 0), color: IRON, bone: BONE.Body },
    { geometry: box(0.2, 0.14, 0.34, 0.3, 1.45, 0), color: IRON, bone: BONE.Body },
    { geometry: spike(-1), color: IRON, bone: BONE.Body },
    { geometry: spike(1), color: IRON, bone: BONE.Body },
    // Head thrust forward, heavy jaw and tusks.
    { geometry: new THREE.IcosahedronGeometry(0.15, 1).scale(1, 0.95, 1.05).translate(0, 1.6, 0.07), color: ORC_SKIN, bone: BONE.Body },
    { geometry: box(0.2, 0.08, 0.14, 0, 1.52, 0.13), color: ORC_SKIN, bone: BONE.Body },
    { geometry: new THREE.ConeGeometry(0.018, 0.07, 4).translate(-0.06, 1.58, 0.2), color: TUSK, bone: BONE.Body },
    { geometry: new THREE.ConeGeometry(0.018, 0.07, 4).translate(0.06, 1.58, 0.2), color: TUSK, bone: BONE.Body },
    { geometry: new THREE.SphereGeometry(0.165, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 1.66, 0.05), color: IRON, bone: BONE.Body },
    { geometry: horn(-1), color: TUSK, bone: BONE.Body },
    { geometry: horn(1), color: TUSK, bone: BONE.Body },
  ];
}

function orcWarrior(): THREE.BufferGeometry {
  // War axe: haft along the swing direction, a broad bearded blade at its end.
  const haft = new THREE.CylinderGeometry(0.025, 0.03, 0.95, 5).translate(0, 0.42, 0).rotateX(1.05).translate(0.29, 0.93, 0.05);
  const head = new THREE.BoxGeometry(0.04, 0.3, 0.26).translate(0, 0.8, 0.1).rotateX(1.05).translate(0.29, 0.93, 0.05);
  return build([
    ...orcBody(),
    ...arm(1, BONE.WeaponArm, ORC_SKIN, ORC_SKIN, 0.14),
    { geometry: haft, color: WOOD, bone: BONE.Weapon },
    { geometry: head, color: 0x8d8f93, bone: BONE.Weapon },
    ...arm(-1, BONE.ShieldArm, ORC_SKIN, ORC_SKIN, 0.14),
    // Rough plank shield with a painted face and an iron boss.
    {
      geometry: new THREE.CylinderGeometry(0.32, 0.32, 0.06, 9).rotateX(Math.PI / 2).translate(-0.35, 1.08, 0.21),
      color: WOOD,
      bone: BONE.ShieldArm,
    },
    {
      geometry: new THREE.CylinderGeometry(0.24, 0.24, 0.02, 9).rotateX(Math.PI / 2).translate(-0.35, 1.08, 0.25),
      color: TEAM,
      bone: BONE.ShieldArm,
      team: true,
    },
    { geometry: new THREE.ConeGeometry(0.07, 0.12, 6).rotateX(Math.PI / 2).translate(-0.35, 1.08, 0.3), color: IRON, bone: BONE.ShieldArm },
  ]);
}

function orcSpearman(): THREE.BufferGeometry {
  const tilt = -Math.PI / 2 + 0.24;
  const shaft = new THREE.CylinderGeometry(0.026, 0.03, 2.8, 5).translate(0, 0.9, 0).rotateX(-tilt).translate(0.29, 0.95, 0.05);
  // Barbed, crudely forged head.
  const tip = new THREE.ConeGeometry(0.075, 0.38, 4).translate(0, 2.44, 0).rotateX(-tilt).translate(0.29, 0.95, 0.05);
  const barb = new THREE.BoxGeometry(0.2, 0.04, 0.03).translate(0, 2.28, 0).rotateX(-tilt).translate(0.29, 0.95, 0.05);
  return build([
    ...orcBody(),
    ...arm(1, BONE.WeaponArm, ORC_SKIN, ORC_SKIN, 0.14),
    { geometry: shaft, color: 0x55391f, bone: BONE.Weapon },
    { geometry: tip, color: 0x7d7f83, bone: BONE.Weapon },
    { geometry: barb, color: 0x7d7f83, bone: BONE.Weapon },
    ...arm(-1, BONE.ShieldArm, ORC_SKIN, ORC_SKIN, 0.14),
    // Hide buckler stretched on a frame.
    { geometry: box(0.36, 0.44, 0.05, -0.35, 1.1, 0.2), color: FUR, bone: BONE.ShieldArm },
    { geometry: box(0.1, 0.36, 0.02, -0.35, 1.1, 0.235), color: TEAM, bone: BONE.ShieldArm, team: true },
  ]);
}

function swordsman(): THREE.BufferGeometry {
  const blade = new THREE.BoxGeometry(0.06, 0.8, 0.02).translate(0, 0.46, 0).rotateX(1.05).translate(0.29, 0.93, 0.05);
  const guard = new THREE.BoxGeometry(0.22, 0.04, 0.05).rotateX(1.05).translate(0.29, 0.97, 0.08);
  return build([
    ...legs(),
    ...torso(true, METAL),
    // Great helm with a visor slit.
    { geometry: new THREE.CylinderGeometry(0.155, 0.16, 0.26, 8).translate(0, 1.72, 0), color: METAL, bone: BONE.Body },
    { geometry: box(0.24, 0.03, 0.02, 0, 1.72, 0.155), color: 0x1d1d20, bone: BONE.Body },
    { geometry: new THREE.ConeGeometry(0.05, 0.14, 6).translate(0, 1.91, 0), color: TEAM, bone: BONE.Body, team: true },
    ...arm(1, BONE.WeaponArm, METAL),
    { geometry: blade, color: 0xd7dbe2, bone: BONE.Weapon },
    { geometry: guard, color: DARK_METAL, bone: BONE.Weapon },
    ...arm(-1, BONE.ShieldArm, METAL),
    // Heater shield: metal rim behind a faction-coloured face.
    { geometry: box(0.5, 0.64, 0.05, -0.33, 1.08, 0.2), color: DARK_METAL, bone: BONE.ShieldArm },
    { geometry: box(0.42, 0.56, 0.02, -0.33, 1.09, 0.235), color: TEAM, bone: BONE.ShieldArm, team: true },
    { geometry: box(0.08, 0.4, 0.025, -0.33, 1.1, 0.25), color: 0xd9c89a, bone: BONE.ShieldArm },
  ]);
}

function spearman(): THREE.BufferGeometry {
  // Spear held low and forward, tilted 12° up.
  const tilt = -Math.PI / 2 + 0.21;
  const shaft = new THREE.CylinderGeometry(0.022, 0.026, 2.7, 5).translate(0, 0.9, 0).rotateX(-tilt).translate(0.29, 0.95, 0.05);
  const tip = new THREE.ConeGeometry(0.05, 0.28, 5).translate(0, 2.37, 0).rotateX(-tilt).translate(0.29, 0.95, 0.05);
  return build([
    ...legs(),
    ...torso(true, LEATHER),
    // Kettle hat.
    { geometry: new THREE.CylinderGeometry(0.1, 0.28, 0.07, 10).translate(0, 1.76, 0), color: METAL, bone: BONE.Body },
    { geometry: new THREE.ConeGeometry(0.15, 0.2, 10).translate(0, 1.87, 0), color: METAL, bone: BONE.Body },
    ...arm(1, BONE.WeaponArm, LEATHER),
    { geometry: shaft, color: WOOD, bone: BONE.Weapon },
    { geometry: tip, color: 0xd7dbe2, bone: BONE.Weapon },
    ...arm(-1, BONE.ShieldArm, LEATHER),
    // Round shield strapped to the forearm.
    {
      geometry: new THREE.CylinderGeometry(0.3, 0.3, 0.05, 12).rotateX(Math.PI / 2).translate(-0.33, 1.1, 0.2),
      color: DARK_METAL,
      bone: BONE.ShieldArm,
    },
    {
      geometry: new THREE.CylinderGeometry(0.25, 0.25, 0.02, 12).rotateX(Math.PI / 2).translate(-0.33, 1.1, 0.232),
      color: TEAM,
      bone: BONE.ShieldArm,
      team: true,
    },
  ]);
}

export function createUnitGeometry(model: UnitModel): THREE.BufferGeometry {
  switch (model) {
    case 'human_footman':
      return swordsman();
    case 'human_spearman':
      return spearman();
    case 'orc_warrior':
      return orcWarrior();
    case 'orc_spearman':
      return orcSpearman();
  }
}

/** Attack animation style per model: 0 = overhead swing, 1 = thrust. */
export const ATTACK_STYLE: Record<UnitModel, number> = { human_footman: 0, human_spearman: 1, orc_warrior: 0, orc_spearman: 1 };

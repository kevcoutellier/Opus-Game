import * as THREE from 'three';
import type { UnitModel } from '../units/UnitStats';
import { merge, paint, tag } from './GeometryUtils';

/**
 * Procedural low-poly soldiers (~1.8 m, facing +Z). Every vertex carries:
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

function legs(): Part[] {
  const parts: Part[] = [];
  for (const [side, bone] of [
    [-1, BONE.LeftLeg],
    [1, BONE.RightLeg],
  ] as const) {
    parts.push({ geometry: box(0.15, 0.62, 0.17, side * 0.11, 0.62, 0), color: CLOTH, bone });
    parts.push({ geometry: box(0.16, 0.3, 0.24, side * 0.11, 0.15, 0.03), color: LEATHER, bone });
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

function arm(side: -1 | 1, bone: number, colour: number): Part[] {
  return [
    { geometry: box(0.11, 0.48, 0.12, side * 0.29, 1.19, 0), color: colour, bone },
    { geometry: box(0.1, 0.1, 0.1, side * 0.29, 0.93, 0.02), color: SKIN, bone },
  ];
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
    case 'swordsman':
      return swordsman();
    case 'spearman':
      return spearman();
  }
}

/** Attack animation style per model: 0 = overhead swing, 1 = thrust. */
export const ATTACK_STYLE: Record<UnitModel, number> = { swordsman: 0, spearman: 1 };

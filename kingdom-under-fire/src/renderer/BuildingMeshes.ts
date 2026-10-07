import * as THREE from 'three';
import type { BuildingDef } from '../buildings/Building';
import { merge, paint } from './GeometryUtils';

/** Team colour placeholder, replaced per team when the geometry is built. */
const TEAM = -1;

const HUMAN = { stone: 0xb7ae9c, darkStone: 0x8f877a, timber: 0x6b4a2b, plaster: 0xd9ceb4, roof: 0x7c3526, slate: 0x4f5560, straw: 0xc9a85a, field: 0x6f8a3a };
const ORC = { wood: 0x4b3423, darkWood: 0x33241a, hide: 0x8d6b45, bone: 0xdcd2b4, iron: 0x3a3a3a, thatch: 0x6e5a33, rock: 0x6c645a, field: 0x6b5a33 };

type Piece = { geometry: THREE.BufferGeometry; color: number };

const box = (w: number, h: number, d: number, x: number, y: number, z: number, color: number, ry = 0): Piece => ({
  geometry: new THREE.BoxGeometry(w, h, d).rotateY(ry).translate(x, y + h / 2, z),
  color,
});
const cylinder = (r: number, h: number, x: number, y: number, z: number, color: number, segments = 8, rTop = r): Piece => ({
  geometry: new THREE.CylinderGeometry(rTop, r, h, segments).translate(x, y + h / 2, z),
  color,
});
const cone = (r: number, h: number, x: number, y: number, z: number, color: number, segments = 8): Piece => ({
  geometry: new THREE.ConeGeometry(r, h, segments).translate(x, y + h / 2, z),
  color,
});
/** Gable roof: a triangular prism along x, `w` long, `d` deep, `h` high, eaves at height y. */
const gable = (w: number, d: number, h: number, x: number, y: number, z: number, color: number, alongZ = false): Piece => {
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, h)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }).translate(0, 0, -w / 2);
  // The prism runs along z after extrusion; turn it along x unless asked otherwise.
  if (!alongZ) g.rotateY(Math.PI / 2);
  return { geometry: g.translate(x, y, z), color };
};
const banner = (x: number, y: number, z: number, height = 3.5): Piece[] => [
  cylinder(0.07, height, x, y, z, 0x3b2a1a, 5),
  box(0.05, 1.1, 0.8, x, y + height - 1.3, z + 0.42, TEAM),
];

function humanKeep(w: number, d: number): Piece[] {
  const c = HUMAN;
  const pieces: Piece[] = [];
  const hw = w / 2 - 0.9;
  const hd = d / 2 - 0.9;
  // Curtain walls with a gate facing +z.
  pieces.push(box(w - 1.8, 3.6, 0.9, 0, 0, -hd, c.stone), box(0.9, 3.6, d - 1.8, -hw, 0, 0, c.stone), box(0.9, 3.6, d - 1.8, hw, 0, 0, c.stone));
  pieces.push(box((w - 1.8) / 2 - 1.6, 3.6, 0.9, -(w - 1.8) / 4 - 0.8, 0, hd, c.stone), box((w - 1.8) / 2 - 1.6, 3.6, 0.9, (w - 1.8) / 4 + 0.8, 0, hd, c.stone));
  pieces.push(box(3.2, 1, 1, 0, 3, hd, c.darkStone), box(3, 3, 0.2, 0, 0, hd + 0.3, c.timber));
  for (let i = -2; i <= 2; i++) pieces.push(box(0.5, 0.6, 0.5, i * 2, 3.6, -hd, c.darkStone), box(0.5, 0.6, 0.5, -hw, 3.6, i * 2, c.darkStone), box(0.5, 0.6, 0.5, hw, 3.6, i * 2, c.darkStone));
  // Keep and corner towers.
  pieces.push(box(5.2, 9, 5.2, 0, 0, -1, c.stone), gable(5.6, 5.6, 2.4, 0, 9, -1, c.slate));
  for (const [x, z] of [[-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]]) {
    pieces.push(cylinder(1.4, 6.5, x, 0, z, c.stone, 10), cone(1.7, 2.6, x, 6.5, z, c.roof, 10));
  }
  pieces.push(...banner(0, 11.4, -1, 3), ...banner(-hw, 9.1, hd, 2), ...banner(hw, 9.1, hd, 2));
  return pieces;
}

function orcStronghold(w: number, d: number): Piece[] {
  const c = ORC;
  const pieces: Piece[] = [];
  const hw = w / 2 - 0.4;
  const hd = d / 2 - 0.4;
  // Palisade of sharpened stakes, open towards +z.
  const stake = (x: number, z: number) => pieces.push(cylinder(0.28, 3.4, x, 0, z, c.wood, 6), cone(0.28, 0.8, x, 3.4, z, c.bone, 6));
  for (let t = -hw; t <= hw + 0.01; t += 0.75) {
    stake(t, -hd);
    if (Math.abs(t) > 2) stake(t, hd);
  }
  for (let t = -hd + 0.75; t < hd; t += 0.75) {
    stake(-hw, t);
    stake(hw, t);
  }
  // Great hall under hides, a watchtower, skull totems.
  pieces.push(box(6.5, 3.6, 5, 0, 0, -1.2, c.darkWood), gable(7.2, 5.8, 3.2, 0, 3.6, -1.2, c.hide));
  pieces.push(cylinder(0.25, 7, -3.6, 0, 2.6, c.wood, 5), cylinder(0.25, 7, -2.2, 0, 2.6, c.wood, 5), box(2.2, 0.3, 1.8, -2.9, 7, 2.6, c.wood), cone(1.6, 1.6, -2.9, 7.3, 2.6, c.thatch, 6));
  for (const x of [-2.2, 2.2]) pieces.push(cylinder(0.18, 3.8, x, 0, hd + 0.2, c.wood, 5), box(0.6, 0.6, 0.6, x, 3.8, hd + 0.2, c.bone));
  pieces.push(...banner(2.8, 7.2, -1.2, 3.2));
  return pieces;
}

function house(w: number, d: number, wallH: number, walls: number, roof: number, trim: number, roofH = 2.2): Piece[] {
  return [box(w, wallH, d, 0, 0, 0, walls), box(w + 0.1, 0.35, d + 0.1, 0, wallH - 0.35, 0, trim), gable(w + 0.5, d + 0.6, roofH, 0, wallH, 0, roof), box(1.4, 2, 0.2, 0, 0, d / 2 + 0.05, trim)];
}

function modelPieces(def: BuildingDef): Piece[] {
  const { width: w, depth: d } = def;
  const human = def.style === 'human';
  const c = human ? HUMAN : ORC;
  const walls = human ? HUMAN.plaster : ORC.darkWood;
  const roof = human ? HUMAN.roof : ORC.hide;
  const trim = human ? HUMAN.timber : ORC.wood;
  switch (def.kind) {
    case 'hq':
      return human ? humanKeep(w, d) : orcStronghold(w, d);
    case 'barracks':
      return [...house(w - 1, d - 1.5, 3.2, walls, roof, trim, 2.6), box(w - 0.4, 0.3, 1.2, 0, 0, d / 2 - 0.6, human ? HUMAN.darkStone : ORC.rock), ...banner(w / 2 - 0.8, 0, d / 2 - 0.8, 4.5)];
    case 'archery': {
      const pieces: Piece[] = [];
      for (const x of [-w / 2 + 0.8, w / 2 - 0.8]) for (const z of [-d / 2 + 0.8, 0.5]) pieces.push(cylinder(0.14, 3, x, 0, z, trim, 5));
      pieces.push(gable(w - 0.6, d / 2 + 1.8, 1.6, 0, 3, -d / 4 + 0.35, roof));
      // Straw targets on stands.
      for (const x of [-2.5, 0, 2.5]) {
        pieces.push(box(0.12, 0.9, 0.12, x, 0, d / 2 - 1, trim));
        pieces.push({ geometry: new THREE.CylinderGeometry(0.55, 0.55, 0.12, 12).rotateX(Math.PI / 2).translate(x, 1.3, d / 2 - 0.9), color: 0xd9d0b8 });
        pieces.push({ geometry: new THREE.CylinderGeometry(0.22, 0.22, 0.14, 12).rotateX(Math.PI / 2).translate(x, 1.3, d / 2 - 0.84), color: 0xa12b22 });
      }
      pieces.push(...banner(-w / 2 + 0.8, 3, 0.5, 2));
      return pieces;
    }
    case 'stable': {
      const pieces = [...house(w - 1.5, d / 2 + 0.5, 2.6, walls, roof, trim, 1.8).map((p) => ({ ...p, geometry: p.geometry.translate(0, 0, -d / 4 + 0.2) }))];
      // Paddock fence in front.
      for (let x = -w / 2 + 0.5; x <= w / 2 - 0.5; x += 1.5) pieces.push(cylinder(0.08, 1.1, x, 0, d / 2 - 0.4, trim, 4));
      pieces.push(box(w - 1, 0.1, 0.1, 0, 0.9, d / 2 - 0.4, trim), box(w - 1, 0.1, 0.1, 0, 0.5, d / 2 - 0.4, trim));
      pieces.push(box(1.4, 0.8, 0.9, w / 2 - 1.4, 0, 1.4, human ? HUMAN.straw : ORC.thatch), ...banner(-w / 2 + 0.9, 0, d / 2 - 0.4, 3.2));
      return pieces;
    }
    case 'farm': {
      const pieces = [box(w - 0.4, 0.08, d / 2, 0, 0, d / 4 - 0.2, c.field)];
      for (let x = -w / 2 + 0.8; x < w / 2 - 0.4; x += 0.9) pieces.push(box(0.35, 0.3, d / 2 - 0.4, x, 0.08, d / 4 - 0.2, human ? 0xb9a44a : 0x5d4a2c));
      pieces.push(...house(4, 3.2, 2.2, walls, human ? HUMAN.straw : ORC.thatch, trim, 1.6).map((p) => ({ ...p, geometry: p.geometry.translate(-w / 4 + 0.4, 0, -d / 4) })));
      pieces.push(cylinder(0.9, 1.4, w / 4 + 0.6, 0, -d / 4, human ? HUMAN.straw : ORC.hide, 8), cone(0.9, 0.7, w / 4 + 0.6, 1.4, -d / 4, human ? HUMAN.straw : ORC.hide, 8));
      return pieces;
    }
    case 'sawmill': {
      const pieces = [...house(w / 2 + 0.8, d - 2, 2.4, walls, roof, trim, 1.6).map((p) => ({ ...p, geometry: p.geometry.translate(-w / 4 + 0.2, 0, -0.6) }))];
      for (let row = 0; row < 3; row++) {
        for (let k = 0; k < 3 - row; k++) {
          pieces.push({ geometry: new THREE.CylinderGeometry(0.3, 0.3, 3.2, 7).rotateX(Math.PI / 2).translate(w / 4 + (k - (2 - row) / 2) * 0.62, 0.3 + row * 0.52, 0.2), color: 0x8a6440 });
        }
      }
      pieces.push({ geometry: new THREE.CylinderGeometry(0.9, 0.9, 0.08, 16).rotateZ(Math.PI / 2).translate(-w / 4 + 0.2, 1.4, d / 2 - 0.7), color: 0x9aa0a6 });
      return pieces;
    }
    case 'temple': {
      if (!human) {
        // The ogre den: a mound of rock with a gaping mouth, bones scattered around.
        const mound = new THREE.DodecahedronGeometry(3.4, 0).scale(1.1, 0.8, 1).translate(0, 1.6, -0.4);
        return [
          { geometry: mound, color: ORC.rock },
          box(2.2, 2.2, 0.4, 0, 0, 2.6, 0x151210),
          box(0.4, 0.3, 1.6, -2.4, 0, 2.6, ORC.bone, 0.5),
          box(0.3, 0.3, 1.2, 2.2, 0, 2.2, ORC.bone, -0.3),
          ...banner(2.8, 0, 2.4, 4),
        ];
      }
      const pieces = [box(w - 1, 0.6, d - 1, 0, 0, 0, HUMAN.darkStone), box(w - 3, 3.6, d - 3, 0, 0.6, -0.4, HUMAN.stone)];
      for (const x of [-(w - 2.2) / 2, (w - 2.2) / 2]) for (const z of [(d - 2.2) / 2 - 0.2, -(d - 2.2) / 2]) pieces.push(cylinder(0.3, 3.6, x, 0.6, z, HUMAN.plaster, 8));
      pieces.push(gable(w - 1.4, d - 1.2, 1.8, 0, 4.2, 0, HUMAN.slate, true), cylinder(0.7, 3.2, 0, 4.4, -0.4, HUMAN.stone, 8), cone(0.8, 2.6, 0, 7.6, -0.4, HUMAN.slate, 8));
      pieces.push(box(0.12, 1, 0.12, 0, 10.2, -0.4, 0xe8c864), box(0.6, 0.12, 0.12, 0, 10.6, -0.4, 0xe8c864));
      return pieces;
    }
  }
}

/** Height (m) of a building's model, for its health bar. */
export function buildingHeight(def: BuildingDef): number {
  switch (def.kind) {
    case 'hq':
      return def.style === 'human' ? 13 : 10;
    case 'temple':
      return def.style === 'human' ? 11 : 6;
    case 'barracks':
      return 7;
    default:
      return 5.5;
  }
}

/** Merged, vertex-coloured model of a building (facing +z), team parts in `team` colour. */
export function createBuildingGeometry(def: BuildingDef, team: number): THREE.BufferGeometry {
  // A plinth under the footprint fills the slope between the lowest and the highest corner.
  const plinth = box(def.width, 1.8, def.depth, 0, -1.6, 0, def.style === 'human' ? HUMAN.darkStone : ORC.rock);
  return merge([plinth, ...modelPieces(def)].map((p) => paint(p.geometry, p.color === TEAM ? team : p.color)));
}

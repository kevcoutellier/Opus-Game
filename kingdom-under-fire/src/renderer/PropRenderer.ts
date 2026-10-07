import * as THREE from 'three';
import { FIRE_CELL } from '../combat/FireSystem';
import { insideProp, PROP_SHAPES, type Prop, type PropKind } from '../maps/Props';
import { merge, paint } from './GeometryUtils';

const PLASTER = 0xc9b998;
const TIMBER = 0x5a3e26;
const THATCH = 0x8a7148;
const STONE = 0x8d8a82;
const DARK_STONE = 0x6c6a64;
const CANVAS = 0xd8cfb4;
const LOG = 0x6b4a2b;

const box = (w: number, h: number, d: number, x: number, y: number, z: number, hex: number) => paint(new THREE.BoxGeometry(w, h, d).translate(x, y, z), hex);

/** Geometry of a prop, in its own axes (x along its width, y up, z along its depth), standing on y = 0. */
function propGeometry(p: Prop): THREE.BufferGeometry {
  const shape = PROP_SHAPES[p.kind];
  const w = shape.width(p);
  const d = shape.depth;
  const h = shape.height;
  switch (p.kind as PropKind) {
    case 'house': {
      const roof = new THREE.CylinderGeometry(0, 1, 1, 4).rotateY(Math.PI / 4).scale(w * 0.78, 2.2, d * 0.78).translate(0, h + 1.1, 0);
      return merge([
        box(w, h, d, 0, h / 2, 0, PLASTER),
        box(w + 0.1, 0.25, d + 0.1, 0, h - 0.1, 0, TIMBER),
        box(0.25, h, 0.25, w / 2 - 0.1, h / 2, d / 2 - 0.1, TIMBER),
        box(0.25, h, 0.25, -w / 2 + 0.1, h / 2, d / 2 - 0.1, TIMBER),
        box(1, 1.8, 0.1, 0.8, 0.9, d / 2 + 0.03, TIMBER),
        paint(roof, THATCH),
      ]);
    }
    case 'hut':
      return merge([
        box(w, h, d, 0, h / 2, 0, PLASTER),
        paint(new THREE.ConeGeometry(w * 0.82, 2, 6).translate(0, h + 1, 0), THATCH),
      ]);
    case 'tent':
      return merge([paint(new THREE.ConeGeometry(w / 2, h, 6).translate(0, h / 2, 0), CANVAS), box(0.08, h + 0.4, 0.08, 0, (h + 0.4) / 2, 0, LOG)]);
    case 'tower': {
      const pieces = [
        paint(new THREE.CylinderGeometry(2.3, 2.6, h, 8).translate(0, h / 2, 0), STONE),
        paint(new THREE.CylinderGeometry(2.7, 2.7, 0.6, 8).translate(0, h + 0.3, 0), DARK_STONE),
        paint(new THREE.ConeGeometry(2.6, 3, 8).translate(0, h + 2.1, 0), 0x5b3a2a),
      ];
      return merge(pieces);
    }
    case 'wall': {
      const pieces = [box(w, h, d, 0, h / 2, 0, STONE), box(w, 0.3, d + 0.3, 0, h - 0.15, 0, DARK_STONE)];
      // Merlons along the top.
      for (let x = -w / 2 + 0.6; x <= w / 2 - 0.5; x += 1.6) pieces.push(box(0.8, 0.8, d * 0.45, x, h + 0.4, d * 0.27, STONE));
      return merge(pieces);
    }
    case 'palisade': {
      const pieces: THREE.BufferGeometry[] = [];
      for (let x = -w / 2 + 0.2; x <= w / 2 - 0.2; x += 0.42) {
        const tall = h * (0.9 + ((x * 7.3) % 1) * 0.15);
        pieces.push(paint(new THREE.CylinderGeometry(0.2, 0.22, tall, 6).translate(x, tall / 2, 0), LOG));
        pieces.push(paint(new THREE.ConeGeometry(0.2, 0.4, 6).translate(x, tall + 0.2, 0), LOG));
      }
      return merge(pieces);
    }
  }
}

interface Shown {
  prop: Prop;
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  /** Fire cells it stands on. */
  cells: Set<number>;
  burning: number;
  burnt: number;
}

/**
 * Buildings and fortifications of a mission: houses, huts, tents and palisades (they burn: they glow while
 * the fire eats them, then stand charred), stone walls and towers. Also the dwarven airship that flies
 * over the battlefield when a mission says so.
 */
export class PropRenderer {
  readonly group = new THREE.Group();
  private readonly shown: Shown[] = [];
  private readonly byCell = new Map<number, Shown[]>();
  private readonly airship: THREE.Group;
  private flight: { fromX: number; fromZ: number; toX: number; toZ: number; seconds: number; t: number } | null = null;

  constructor(
    props: readonly Prop[],
    private readonly heightAt: (x: number, z: number) => number,
    fireCols: number,
  ) {
    for (const p of props) {
      const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.92 });
      const mesh = new THREE.Mesh(propGeometry(p), material);
      mesh.position.set(p.x, heightAt(p.x, p.z) - 0.1, p.z);
      mesh.rotation.y = p.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
      const shown: Shown = { prop: p, mesh, material, cells: new Set(), burning: 0, burnt: 0 };
      if (PROP_SHAPES[p.kind].flammable) {
        const reach = Math.hypot(PROP_SHAPES[p.kind].width(p), PROP_SHAPES[p.kind].depth) / 2 + 1;
        for (let dz = -reach; dz <= reach; dz += 1) {
          for (let dx = -reach; dx <= reach; dx += 1) {
            if (!insideProp(p, p.x + dx, p.z + dz)) continue;
            const cell = Math.floor((p.z + dz) / FIRE_CELL) * fireCols + Math.floor((p.x + dx) / FIRE_CELL);
            shown.cells.add(cell);
          }
        }
        for (const cell of shown.cells) {
          const list = this.byCell.get(cell) ?? [];
          list.push(shown);
          this.byCell.set(cell, list);
        }
      }
      this.shown.push(shown);
    }
    this.airship = this.createAirship();
    this.airship.visible = false;
    this.group.add(this.airship);
  }

  /** A fire cell caught fire or burnt out: the buildings on it glow, then stand charred. */
  burnCell(cell: number, burning: boolean): void {
    for (const s of this.byCell.get(cell) ?? []) {
      if (burning) s.burning++;
      else {
        s.burning = Math.max(0, s.burning - 1);
        s.burnt++;
      }
      if (s.burning > 0) s.material.color.setRGB(1.5, 0.7, 0.4);
      else if (s.burnt > 0) s.material.color.setRGB(0.18, 0.16, 0.15);
    }
  }

  /** The dwarven airship crosses the sky from one point to another. */
  flyover(fromX: number, fromZ: number, toX: number, toZ: number, seconds: number): void {
    this.flight = { fromX, fromZ, toX, toZ, seconds, t: 0 };
    this.airship.visible = true;
    this.airship.rotation.y = Math.atan2(toX - fromX, toZ - fromZ);
  }

  update(dt: number): void {
    const f = this.flight;
    if (!f) return;
    f.t += dt;
    const u = Math.min(1, f.t / f.seconds);
    const x = f.fromX + (f.toX - f.fromX) * u;
    const z = f.fromZ + (f.toZ - f.fromZ) * u;
    this.airship.position.set(x, this.heightAt(x, z) + 26 + Math.sin(f.t * 0.8) * 0.6, z);
    if (u >= 1) {
      this.flight = null;
      this.airship.visible = false;
    }
  }

  private createAirship(): THREE.Group {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.8 });
    const hull = paint(new THREE.SphereGeometry(1, 12, 8).scale(3, 3, 9), 0x8a7a62);
    const pieces = [
      hull,
      box(1.6, 1.1, 5, 0, -3.6, 0, 0x5a3e26),
      box(0.12, 2.6, 0.12, 0.7, -2.2, 1.6, 0x3a2a1a),
      box(0.12, 2.6, 0.12, -0.7, -2.2, -1.6, 0x3a2a1a),
      box(0.2, 2.4, 1.6, 0, 1.6, -8.2, 0x6a5a42),
      box(2.4, 0.2, 1.6, 0, 0, -8.2, 0x6a5a42),
      paint(new THREE.CylinderGeometry(0.15, 0.15, 3.2, 6).rotateZ(Math.PI / 2).translate(0, -3.6, -2.8), 0x3a2a1a),
    ];
    const mesh = new THREE.Mesh(merge(pieces), material);
    mesh.castShadow = true;
    group.add(mesh);
    return group;
  }
}

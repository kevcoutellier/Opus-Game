import * as THREE from 'three';
import type { BuildingSystem } from '../buildings/BuildingSystem';
import type { World } from '../core/World';
import { BUILDING_DEFS } from '../data/buildings';
import { buildingHeight, createBuildingGeometry } from './BuildingMeshes';
import type { EffectsRenderer } from './EffectsRenderer';

interface Shown {
  mesh: THREE.Mesh;
  material: THREE.MeshLambertMaterial;
  ground: number;
  smoke: number;
}

/** Seconds a ruin takes to sink (the BuildingSystem frees it a little later). */
const COLLAPSE_SECONDS = 3;

/**
 * Buildings: one mesh each (a few dozen at most, each a single merged geometry shared by the buildings
 * of the same type and team). Foundations rise with the construction, damaged buildings smoke, destroyed
 * ones collapse and sink. Also the ghost of a building being placed, green or red.
 */
export class BuildingRenderer {
  readonly group = new THREE.Group();
  private readonly shown = new Map<number, Shown>();
  private readonly geometries = new Map<string, THREE.BufferGeometry>();
  private readonly ghostMaterial = new THREE.MeshBasicMaterial({ color: 0x7fe07f, transparent: true, opacity: 0.45, depthWrite: false });
  private ghost: THREE.Mesh | null = null;
  private ghostType = -1;
  private time = 0;

  constructor(
    private readonly buildings: BuildingSystem,
    private readonly teamColors: THREE.Color[],
    private readonly heightAt: (x: number, z: number) => number,
    private readonly effects: EffectsRenderer,
  ) {}

  private geometry(type: number, team: number): THREE.BufferGeometry {
    const key = `${type}:${team}`;
    let g = this.geometries.get(key);
    if (!g) {
      g = createBuildingGeometry(BUILDING_DEFS[type], (this.teamColors[team] ?? this.teamColors[0]).getHex());
      this.geometries.set(key, g);
    }
    return g;
  }

  /** Lowest ground under the footprint: the plinth of the model fills the slope above it. */
  private groundUnder(x: number, z: number, hw: number, hd: number): number {
    let low = Infinity;
    for (const [dx, dz] of [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]]) low = Math.min(low, this.heightAt(x + dx * hw, z + dz * hd));
    return low;
  }

  update(world: World, dt: number): void {
    this.time += dt;
    const { c } = world;
    // New buildings, gone ruins.
    for (const b of this.buildings.list()) {
      if (this.shown.has(b.id)) continue;
      const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
      const mesh = new THREE.Mesh(this.geometry(b.type, b.team), material);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.rotation.y = c.rot[b.id];
      const ground = this.groundUnder(c.x[b.id], c.z[b.id], c.halfW[b.id], c.halfD[b.id]);
      mesh.position.set(c.x[b.id], ground, c.z[b.id]);
      this.group.add(mesh);
      this.shown.set(b.id, { mesh, material, ground, smoke: 0 });
    }
    for (const [id, s] of this.shown) {
      const b = this.buildings.get(id);
      if (!b) {
        this.group.remove(s.mesh);
        s.material.dispose();
        this.shown.delete(id);
        continue;
      }
      if (b.destroyed) {
        // Collapse: sink and blacken.
        const t = Math.min(1, b.ruinTime / COLLAPSE_SECONDS);
        s.mesh.scale.y = 1 - 0.75 * t;
        s.mesh.position.y = s.ground - 0.6 * t;
        s.material.color.setScalar(1 - 0.65 * t);
        continue;
      }
      // Rising from its foundations.
      s.mesh.scale.y = b.complete ? 1 : 0.1 + 0.9 * b.progress;
      s.material.color.setScalar(b.complete ? 1 : 0.8 + 0.2 * b.progress);
      // Smoke from a damaged building, thicker as it burns down.
      const damage = 1 - c.hp[id] / c.maxHp[id];
      if (b.complete && damage > 0.4) {
        s.smoke += dt * (damage - 0.3) * 14;
        while (s.smoke >= 1) {
          s.smoke -= 1;
          const top = buildingHeight(b.def) * 0.7;
          this.effects.smoke(c.x[id] + (Math.random() - 0.5) * c.halfW[id], s.ground + top, c.z[id] + (Math.random() - 0.5) * c.halfD[id]);
        }
      }
    }
  }

  /** Shows the ghost of a building of `type` at (x, z) turned by `rot`, green if it can be laid there. */
  showGhost(type: number, x: number, z: number, rot: number, valid: boolean): void {
    if (!this.ghost || this.ghostType !== type) {
      if (this.ghost) this.group.remove(this.ghost);
      this.ghost = new THREE.Mesh(this.geometry(type, 0), this.ghostMaterial);
      this.ghost.renderOrder = 6;
      this.ghostType = type;
      this.group.add(this.ghost);
    }
    const def = BUILDING_DEFS[type];
    const odd = Math.round(rot / (Math.PI / 2)) % 2 !== 0;
    const hw = (odd ? def.depth : def.width) / 2;
    const hd = (odd ? def.width : def.depth) / 2;
    this.ghost.visible = true;
    this.ghost.position.set(x, this.groundUnder(x, z, hw, hd), z);
    this.ghost.rotation.y = rot;
    this.ghostMaterial.color.setHex(valid ? 0x7fe07f : 0xe0604f);
  }

  hideGhost(): void {
    if (this.ghost) this.ghost.visible = false;
  }
}

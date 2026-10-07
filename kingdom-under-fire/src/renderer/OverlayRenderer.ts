import * as THREE from 'three';
import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, UnitState } from '../entities/Components';

const MAX_RINGS = 2048;
const MAX_MARKERS = 12;
const MAX_PREVIEW = 1024;
const MAX_BARS = 2048;
/** Seconds a health bar stays visible after a hit. */
const BAR_SECONDS = 4;
const BAR_OWN = new THREE.Color(0x7fc85a);
const BAR_ENEMY = new THREE.Color(0xe0483c);
const MARKER_SECONDS = 0.9;
const MOVE = new THREE.Color(0x9be36a);
const OWN = new THREE.Color(0x9be36a);
const ENEMY = new THREE.Color(0xff5a4a);

/** Interpolated render position of an entity (same formula as the unit renderer). */
export function renderPosition(world: World, id: number, alpha: number, out: { x: number; z: number }): void {
  const c = world.c;
  out.x = c.prevX[id] + (c.x[id] - c.prevX[id]) * alpha;
  out.z = c.prevZ[id] + (c.z[id] - c.prevZ[id]) * alpha;
}

interface Marker {
  x: number;
  z: number;
  age: number;
  color: THREE.Color;
}

/**
 * Ground decals: selection rings (one InstancedMesh, one draw call for any selection size) and order
 * markers (expanding, fading rings where an order was given).
 */
export class OverlayRenderer {
  readonly group = new THREE.Group();
  private readonly rings: THREE.InstancedMesh;
  private readonly markerMesh: THREE.InstancedMesh;
  private readonly markers: Marker[] = [];
  private readonly previewMesh: THREE.InstancedMesh;
  /** Aiming an ability: its area under the cursor and the reach of the hero. */
  private readonly area: THREE.Mesh;
  private readonly areaFill: THREE.Mesh;
  private readonly reach: THREE.Mesh;
  private readonly bars: THREE.InstancedMesh;
  private readonly barFill: THREE.InstancedBufferAttribute;
  private readonly barColor: THREE.InstancedBufferAttribute;
  private readonly selectedSet = new Set<number>();
  private readonly tint = new THREE.Color();
  private readonly pos = { x: 0, z: 0 };
  private readonly matrix = new THREE.Matrix4();

  constructor(private readonly heightAt: (x: number, z: number) => number) {
    const geometry = new THREE.RingGeometry(0.55, 0.7, 20).rotateX(-Math.PI / 2);
    const material = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, fog: false });
    this.rings = new THREE.InstancedMesh(geometry, material, MAX_RINGS);
    this.rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.rings.frustumCulled = false;
    this.rings.renderOrder = 2;
    this.rings.count = 0;
    this.group.add(this.rings);

    const markerMaterial = new THREE.MeshBasicMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
    });
    this.markerMesh = new THREE.InstancedMesh(new THREE.RingGeometry(0.8, 1.05, 32).rotateX(-Math.PI / 2), markerMaterial, MAX_MARKERS);
    this.markerMesh.frustumCulled = false;
    this.markerMesh.renderOrder = 3;
    this.markerMesh.count = 0;
    this.group.add(this.markerMesh);

    const previewMaterial = new THREE.MeshBasicMaterial({ color: 0xc8f59a, transparent: true, opacity: 0.55, depthWrite: false, fog: false });
    this.previewMesh = new THREE.InstancedMesh(new THREE.CircleGeometry(0.34, 12).rotateX(-Math.PI / 2), previewMaterial, MAX_PREVIEW);
    this.previewMesh.frustumCulled = false;
    this.previewMesh.renderOrder = 3;
    this.previewMesh.count = 0;
    this.group.add(this.previewMesh);

    const aim = (inner: number, segments: number, opacity: number) => {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(inner, 1, segments).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xbfe3ff, transparent: true, opacity, depthWrite: false, depthTest: false, fog: false }),
      );
      mesh.renderOrder = 5;
      mesh.visible = false;
      this.group.add(mesh);
      return mesh;
    };
    this.area = aim(0.9, 48, 0.85);
    this.areaFill = aim(0, 48, 0.16);
    this.reach = aim(0.985, 96, 0.35);

    // Health bars: camera-facing quads computed in the vertex shader, one draw call.
    const barGeometry = new THREE.PlaneGeometry(0.95, 0.12);
    this.barFill = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS), 1);
    this.barColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_BARS * 3), 3);
    this.barFill.setUsage(THREE.DynamicDrawUsage);
    this.barColor.setUsage(THREE.DynamicDrawUsage);
    barGeometry.setAttribute('iFill', this.barFill);
    barGeometry.setAttribute('iColor', this.barColor);
    const barMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float iFill;
        attribute vec3 iColor;
        varying float vFill;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          mv.xy += position.xy;
          gl_Position = projectionMatrix * mv;
          vFill = iFill;
          vColor = iColor;
          vUv = uv;
        }`,
      fragmentShader: /* glsl */ `
        varying float vFill;
        varying vec3 vColor;
        varying vec2 vUv;
        void main() {
          bool edge = vUv.x < 0.025 || vUv.x > 0.975 || vUv.y < 0.14 || vUv.y > 0.86;
          vec3 col = edge ? vec3(0.02) : (vUv.x < vFill ? vColor : vec3(0.1, 0.09, 0.08));
          gl_FragColor = vec4(col, 0.92);
          #include <colorspace_fragment>
        }`,
    });
    this.bars = new THREE.InstancedMesh(barGeometry, barMaterial, MAX_BARS);
    this.bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bars.frustumCulled = false;
    this.bars.renderOrder = 4;
    this.bars.count = 0;
    this.group.add(this.bars);
  }

  /** Bars over selected units and over units hit in the last seconds. */
  private updateBars(world: World, alpha: number, selected: readonly number[], ownTeam: number): void {
    const { entities, c } = world;
    this.selectedSet.clear();
    for (const id of selected) this.selectedSet.add(id);
    const fill = this.barFill.array as Float32Array;
    const color = this.barColor.array as Float32Array;
    let n = 0;
    for (let i = 0; i < entities.count && n < MAX_BARS; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0 || c.state[id] === UnitState.Dying) continue;
      if (c.lastHit[id] > BAR_SECONDS && !this.selectedSet.has(id)) continue;
      renderPosition(world, id, alpha, this.pos);
      const top = 2.25 * UNIT_DEFS[c.unitType[id]].scale;
      this.matrix.makeTranslation(this.pos.x, this.heightAt(this.pos.x, this.pos.z) + top, this.pos.z);
      this.bars.setMatrixAt(n, this.matrix);
      const ratio = Math.max(0, c.hp[id] / c.maxHp[id]);
      fill[n] = ratio;
      const base = c.team[id] === ownTeam ? BAR_OWN : BAR_ENEMY;
      const dim = 0.55 + ratio * 0.45;
      color[n * 3] = base.r * dim;
      color[n * 3 + 1] = base.g * dim;
      color[n * 3 + 2] = base.b * dim;
      n++;
    }
    this.bars.count = n;
    this.bars.instanceMatrix.needsUpdate = true;
    this.barFill.needsUpdate = true;
    this.barColor.needsUpdate = true;
  }

  /** Ghost slots of the formation being drawn with a right-drag (null hides them). */
  preview(points: ArrayLike<number> | null): void {
    const n = points ? Math.min(MAX_PREVIEW, points.length / 2) : 0;
    for (let i = 0; i < n; i++) {
      const x = points![i * 2];
      const z = points![i * 2 + 1];
      this.matrix.makeTranslation(x, this.heightAt(x, z) + 0.07, z);
      this.previewMesh.setMatrixAt(i, this.matrix);
    }
    this.previewMesh.count = n;
    this.previewMesh.instanceMatrix.needsUpdate = true;
  }

  /** Shows the area of an ability being aimed and the reach of its hero, or hides them (null). */
  target(t: { x: number; z: number; radius: number; heroX: number; heroZ: number; range: number } | null): void {
    this.area.visible = this.areaFill.visible = this.reach.visible = t !== null;
    if (!t) return;
    const y = this.heightAt(t.x, t.z) + 0.15;
    for (const m of [this.area, this.areaFill]) {
      m.position.set(t.x, y, t.z);
      m.scale.set(t.radius, 1, t.radius);
    }
    this.reach.position.set(t.heroX, this.heightAt(t.heroX, t.heroZ) + 0.15, t.heroZ);
    this.reach.scale.set(t.range, 1, t.range);
    this.reach.visible = t.range > 0;
  }

  marker(x: number, z: number, attack: boolean): void {
    if (this.markers.length >= MAX_MARKERS) this.markers.shift();
    this.markers.push({ x, z, age: 0, color: attack ? ENEMY : MOVE });
  }

  private updateMarkers(dt: number): void {
    let n = 0;
    for (const m of this.markers) {
      m.age += dt;
      const t = m.age / MARKER_SECONDS;
      if (t >= 1) continue;
      const scale = 0.6 + t * 1.6;
      this.matrix.makeScale(scale, 1, scale).setPosition(m.x, this.heightAt(m.x, m.z) + 0.08, m.z);
      this.markerMesh.setMatrixAt(n, this.matrix);
      this.markerMesh.setColorAt(n, this.tint.copy(m.color).multiplyScalar(1.4 * (1 - t)));
      n++;
    }
    while (this.markers.length && this.markers[0].age >= MARKER_SECONDS) this.markers.shift();
    this.markerMesh.count = n;
    this.markerMesh.instanceMatrix.needsUpdate = true;
    if (this.markerMesh.instanceColor) this.markerMesh.instanceColor.needsUpdate = true;
  }

  update(world: World, alpha: number, dt: number, selected: readonly number[], ownTeam: number): void {
    this.updateMarkers(dt);
    this.updateBars(world, alpha, selected, ownTeam);
    let n = 0;
    for (const id of selected) {
      if (n >= MAX_RINGS || !world.entities.isAlive(id)) continue;
      renderPosition(world, id, alpha, this.pos);
      const r = world.c.radius[id] / 0.42;
      this.matrix.makeScale(r, 1, r).setPosition(this.pos.x, this.heightAt(this.pos.x, this.pos.z) + 0.06, this.pos.z);
      this.rings.setMatrixAt(n, this.matrix);
      this.rings.setColorAt(n, world.c.team[id] === ownTeam ? OWN : ENEMY);
      n++;
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
  }
}

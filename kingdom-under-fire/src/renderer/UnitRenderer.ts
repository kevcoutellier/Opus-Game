import * as THREE from 'three';
import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, MoraleState, SwingKind, UnitState } from '../entities/Components';
import { CORPSE_SECONDS, HIT_FLASH_SECONDS } from '../units/Unit';
import { UNIT_MODELS, type UnitModel } from '../units/UnitStats';
import { ATTACK_STYLE, BOW_AIM, BOW_STYLE, createUnitGeometry, MOUNTED_MODELS, STRIDE } from './UnitMeshes';

/**
 * GPU-animated instanced soldiers. One InstancedMesh per model (a whole army type = one draw call, plus
 * its shadow pass). The CPU writes, per visible unit, a Y-rotation matrix and two vec4 of animation state;
 * the vertex shader poses the bones (legs, arms, weapon), the body lean, the death fall and the sinking.
 * No AnimationMixer, no skinning: the cost per unit is a handful of floats.
 */
const ANIMATION_GLSL = /* glsl */ `
attribute float aBone;
attribute float aTeam;
attribute float aMount;
attribute vec4 iAnim;  // x walk phase (rad), y walk amount 0..1, z attack progress 0..1 (0 = none), w seconds dead (0 = alive)
attribute vec4 iState; // x hit flash 0..1 (negative: frozen), y routing, z attack style (0 swing, 1 thrust, 2 bow) + 10 if mounted, w idle phase
attribute vec3 iTeam;
uniform float uTime;
uniform float uCorpse;
varying float vFlash;

mat3 kRotX(float a) { float c = cos(a); float s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 kRotY(float a) { float c = cos(a); float s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 kRotZ(float a) { float c = cos(a); float s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void kRotate(inout vec3 p, inout vec3 n, mat3 r, vec3 pivot) {
  p = r * (p - pivot) + pivot;
  n = r * n;
}

void kPose(inout vec3 p, inout vec3 n) {
  float phase = iAnim.x;
  float walk = iAnim.y;
  float atk = iAnim.z;
  float dead = iAnim.w;
  float routing = iState.y;
  float mountedModel = step(9.5, iState.z);
  float style = iState.z - 10.0 * mountedModel;
  float breath = sin(uTime * 1.6 + iState.w) * (1.0 - walk);
  // Riders do not walk: their limbs only follow the gallop a little.
  float limbWalk = mix(walk, walk * 0.15, aMount);
  float bow = step(1.5, style);
  float aim = atk > 0.0 ? bow * smoothstep(0.0, 0.3, atk) * (1.0 - smoothstep(0.75, 1.0, atk)) : 0.0;

  if (aBone > 5.5 && aBone < 9.5) {
    // Horse legs: front/back pairs in opposition, right legs slightly behind (gallop).
    float front = aBone < 7.5 ? 1.0 : -1.0;
    float right = mod(aBone, 2.0) > 0.5 ? 1.0 : 0.0;
    float offset = (front > 0.0 ? 0.0 : 3.14159) + right * 0.55;
    vec3 pivot = vec3(right > 0.5 ? 0.2 : -0.2, 1.05, front * 0.61);
    kRotate(p, n, kRotX(sin(phase + offset) * 0.75 * walk), pivot);
  } else if (aBone > 0.5 && aBone < 2.5) {
    float side = aBone < 1.5 ? 1.0 : -1.0;
    kRotate(p, n, kRotX(sin(phase) * 0.62 * limbWalk * side), vec3(0.0, 0.92, 0.0));
  } else if ((aBone > 2.5 && aBone < 3.5) || (aBone > 4.5 && aBone < 5.5)) {
    // Weapon arm: angle a around the shoulder, wrist angle w around the hand, thrust along +z.
    float a = -sin(phase) * 0.35 * limbWalk + breath * 0.04;
    float w = 0.0;
    float thrust = 0.0;
    if (atk > 0.0) {
      if (style < 0.5) {
        float up = smoothstep(0.0, 0.4, atk);
        float hit = smoothstep(0.4, 0.55, atk);
        float back = smoothstep(0.55, 1.0, atk);
        a = mix(mix(a, -2.6, up), -0.9, hit) * (1.0 - back) + a * back;
        w = mix(mix(0.0, 0.51, up), 1.95, hit) * (1.0 - back);
      } else if (style < 1.5) {
        float draw = smoothstep(0.0, 0.4, atk);
        float hit = smoothstep(0.4, 0.52, atk);
        float back = smoothstep(0.52, 1.0, atk);
        a = mix(mix(0.0, 0.25, draw), -0.35, hit) * (1.0 - back);
        w = -a;
        thrust = mix(mix(0.0, -0.28, draw), 0.55, hit) * (1.0 - back);
      } else {
        // Bow: the string hand comes up to the chin, pulls back, releases at the impact fraction.
        a = mix(a, -1.45, aim);
        thrust = -0.3 * smoothstep(0.15, 0.45, atk) * (1.0 - smoothstep(0.45, 0.5, atk));
      }
    }
    if (routing > 0.5) { a = -0.35; w = 0.6; }
    if (aBone > 4.5) kRotate(p, n, kRotX(w), vec3(0.29, 0.93, 0.05));
    kRotate(p, n, kRotX(a), vec3(0.27, 1.42, 0.0));
    p.z += thrust;
  } else if (aBone > 3.5 && aBone < 4.5) {
    float a = sin(phase) * 0.3 * limbWalk - breath * 0.03;
    if (bow > 0.5) a = mix(-0.25, ${BOW_AIM.toFixed(3)}, aim);
    else if (atk > 0.0) a -= 0.45 * sin(atk * 3.14159);
    kRotate(p, n, kRotX(a), vec3(-0.27, 1.42, 0.0));
  }

  if (aBone < 5.5) {
    // Whole body: lean when running, twist into an overhead blow or side-on to shoot, bob.
    float twist = (atk > 0.0 && style < 0.5) ? sin(atk * 6.2832) * 0.3 : 0.0;
    twist -= 0.45 * aim;
    mat3 body = kRotY(twist) * kRotX(0.1 * limbWalk + routing * 0.15);
    p = body * p;
    n = body * n;
    p.y += abs(sin(phase)) * 0.06 * limbWalk + breath * 0.01;
  }
  if (aMount > 0.5 || aBone > 9.5) {
    // Riders sit on the saddle; horse and rider pitch and bob with the gallop.
    if (aMount > 0.5) p += vec3(0.0, 0.72, -0.12);
    kRotate(p, n, kRotX(sin(phase) * 0.05 * walk), vec3(0.0, 1.2, 0.0));
    p.y += abs(sin(phase)) * 0.1 * walk;
  }

  if (dead > 0.0) {
    float fall = smoothstep(0.0, 0.75, dead);
    mat3 r = mountedModel > 0.5 ? kRotZ(1.45 * fall * fall) : kRotX(-1.52 * fall * fall);
    p = r * p;
    n = r * n;
    p.y += (mountedModel > 0.5 ? 0.3 : 0.15) * fall - smoothstep(uCorpse - 4.0, uCorpse, dead) * 1.2;
  }
}
`;

const pars = (shader: THREE.WebGLProgramParametersWithUniforms, uniforms: Record<string, THREE.IUniform>) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader.replace('#include <common>', `#include <common>\n${ANIMATION_GLSL}`);
};

function createMaterials(uniforms: Record<string, THREE.IUniform>) {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72, metalness: 0.15 });
  material.onBeforeCompile = (shader) => {
    pars(shader, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(normal);\nvec3 kP = vec3(position);\nkPose(kP, objectNormal);')
      .replace('#include <begin_vertex>', 'vec3 transformed = kP;')
      .replace('#include <color_vertex>', '#include <color_vertex>\nvColor.rgb = mix(vColor.rgb, iTeam, aTeam);\nvFlash = iState.x;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.9, 0.12, 0.05) * max(vFlash, 0.0) + vec3(0.3, 0.55, 0.85) * max(-vFlash, 0.0);',
      );
  };
  material.customProgramCacheKey = () => 'unit-anim';

  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = (shader) => {
    pars(shader, uniforms);
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      'vec3 transformed = vec3(position);\nvec3 kN = vec3(0.0, 1.0, 0.0);\nkPose(transformed, kN);',
    );
  };
  depth.customProgramCacheKey = () => 'unit-anim-depth';
  return { material, depth };
}

interface Pool {
  model: UnitModel;
  mesh: THREE.InstancedMesh;
  anim: THREE.InstancedBufferAttribute;
  state: THREE.InstancedBufferAttribute;
  team: THREE.InstancedBufferAttribute;
  capacity: number;
  count: number;
}

const INITIAL_CAPACITY = 256;

export class UnitRenderer {
  readonly group = new THREE.Group();
  private readonly uniforms = { uTime: { value: 0 }, uCorpse: { value: CORPSE_SECONDS } };
  private readonly materials = createMaterials(this.uniforms);
  private readonly pools: Pool[];
  private readonly modelOfType: number[];
  private readonly scaleOfType: number[];
  private readonly strideOfType: number[];
  /** Melee attack style + 10 when the model rides a horse (see the shader). */
  private readonly styleOfType: number[];
  private readonly mountedOfType: boolean[];
  private readonly walkPhase: Float32Array;
  private readonly walkAmount: Float32Array;
  private readonly frustum = new THREE.Frustum();
  private readonly projScreen = new THREE.Matrix4();
  private readonly sphere = new THREE.Sphere(new THREE.Vector3(), 1.6);
  /** Units drawn during the last frame (after frustum culling). */
  visible = 0;

  constructor(
    capacity: number,
    private readonly teamColors: THREE.Color[],
    private readonly heightAt: (x: number, z: number) => number,
  ) {
    this.walkPhase = new Float32Array(capacity);
    this.walkAmount = new Float32Array(capacity);
    this.modelOfType = UNIT_DEFS.map((def) => UNIT_MODELS.indexOf(def.model));
    this.scaleOfType = UNIT_DEFS.map((def) => def.scale);
    this.strideOfType = UNIT_DEFS.map((def) => STRIDE[def.model] / def.scale);
    this.mountedOfType = UNIT_DEFS.map((def) => MOUNTED_MODELS.has(def.model));
    this.styleOfType = UNIT_DEFS.map((def) => ATTACK_STYLE[def.model]);
    this.pools = UNIT_MODELS.map((model) => this.createPool(model, INITIAL_CAPACITY));
  }

  private createPool(model: UnitModel, capacity: number): Pool {
    const geometry = createUnitGeometry(model);
    const anim = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const state = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    const team = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    for (const attr of [anim, state, team]) attr.setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute('iAnim', anim);
    geometry.setAttribute('iState', state);
    geometry.setAttribute('iTeam', team);
    const mesh = new THREE.InstancedMesh(geometry, this.materials.material, capacity);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.customDepthMaterial = this.materials.depth;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Culling is done per unit on the CPU; the mesh itself must never be culled as a whole.
    mesh.frustumCulled = false;
    mesh.count = 0;
    mesh.name = `units:${model}`;
    this.group.add(mesh);
    return { model, mesh, anim, state, team, capacity, count: 0 };
  }

  /** Doubles a pool when an army outgrows it (rare: never happens at a steady unit count). */
  private grow(index: number): Pool {
    const old = this.pools[index];
    this.group.remove(old.mesh);
    old.mesh.geometry.dispose();
    old.mesh.dispose();
    const pool = this.createPool(old.model, old.capacity * 2);
    this.pools[index] = pool;
    return pool;
  }

  update(world: World, alpha: number, frameSeconds: number, camera: THREE.Camera, time: number): void {
    this.uniforms.uTime.value = time;
    this.projScreen.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this.frustum.setFromProjectionMatrix(this.projScreen);
    for (const pool of this.pools) pool.count = 0;

    const { entities, c } = world;
    const stepSeconds = world.time.dt;
    const walkBlend = 1 - Math.exp(-frameSeconds * 8);
    let visible = 0;
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & Comp.Unit) === 0) continue;

      const x = c.prevX[id] + (c.x[id] - c.prevX[id]) * alpha;
      const z = c.prevZ[id] + (c.z[id] - c.prevZ[id]) * alpha;
      const dying = c.state[id] === UnitState.Dying;
      const type = c.unitType[id];
      const speed = dying ? 0 : Math.hypot(c.x[id] - c.prevX[id], c.z[id] - c.prevZ[id]) / stepSeconds;
      const amount = Math.min(1, speed / (this.mountedOfType[type] ? 5 : 2.2));
      this.walkAmount[id] += (amount - this.walkAmount[id]) * walkBlend;
      this.walkPhase[id] = (this.walkPhase[id] + speed * frameSeconds * this.strideOfType[type]) % (Math.PI * 2000);

      const y = this.heightAt(x, z);
      const scale = this.scaleOfType[type];
      this.sphere.center.set(x, y + scale, z);
      this.sphere.radius = 1.6 * scale;
      if (!this.frustum.intersectsSphere(this.sphere)) continue;

      const poolIndex = this.modelOfType[type];
      let pool = this.pools[poolIndex];
      if (pool.count >= pool.capacity) pool = this.grow(poolIndex);
      const k = pool.count++;
      visible++;

      let rot = c.rot[id];
      let delta = rot - c.prevRot[id];
      if (delta > Math.PI) delta -= Math.PI * 2;
      if (delta < -Math.PI) delta += Math.PI * 2;
      rot = c.prevRot[id] + delta * alpha;
      const sin = Math.sin(rot) * scale;
      const cos = Math.cos(rot) * scale;
      const m = pool.mesh.instanceMatrix.array as Float32Array;
      const o = k * 16;
      m[o] = cos; m[o + 1] = 0; m[o + 2] = -sin; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = scale; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = sin; m[o + 9] = 0; m[o + 10] = cos; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;

      const swing = c.swing[id];
      const attack = swing >= 0 && !dying ? Math.max(0.001, Math.min(1, swing / c.swingDuration[id])) : 0;
      const a = pool.anim.array as Float32Array;
      a[k * 4] = this.walkPhase[id];
      a[k * 4 + 1] = this.walkAmount[id];
      a[k * 4 + 2] = attack;
      a[k * 4 + 3] = dying ? c.stateTime[id] + 0.001 : 0;

      const s = pool.state.array as Float32Array;
      const flash = c.lastHit[id] < HIT_FLASH_SECONDS && !dying ? 1 - c.lastHit[id] / HIT_FLASH_SECONDS : 0;
      s[k * 4] = c.frozen[id] > 0 && !dying ? -Math.min(1, c.frozen[id] * 2) : flash;
      s[k * 4 + 1] = c.moraleState[id] === MoraleState.Routing ? 1 : 0;
      s[k * 4 + 2] = (c.swingKind[id] === SwingKind.Shot ? BOW_STYLE : this.styleOfType[type]) + (this.mountedOfType[type] ? 10 : 0);
      s[k * 4 + 3] = (id * 1.618) % 6.283;

      const color = this.teamColors[c.team[id]] ?? this.teamColors[0];
      const t = pool.team.array as Float32Array;
      t[k * 3] = color.r;
      t[k * 3 + 1] = color.g;
      t[k * 3 + 2] = color.b;
    }
    for (const pool of this.pools) {
      pool.mesh.count = pool.count;
      if (!pool.count) continue;
      pool.mesh.instanceMatrix.clearUpdateRanges();
      pool.mesh.instanceMatrix.addUpdateRange(0, pool.count * 16);
      pool.mesh.instanceMatrix.needsUpdate = true;
      for (const [attr, size] of [
        [pool.anim, 4],
        [pool.state, 4],
        [pool.team, 3],
      ] as const) {
        attr.clearUpdateRanges();
        attr.addUpdateRange(0, pool.count * size);
        attr.needsUpdate = true;
      }
    }
    this.visible = visible;
  }
}

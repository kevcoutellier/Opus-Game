import * as THREE from 'three';
import { hash2 } from '../core/Random';
import { fbm, smoothstep } from '../maps/Noise';
import type { Terrain } from '../maps/Terrain';
import { merge, paint } from './GeometryUtils';

const GRASS_DARK = new THREE.Color(0x4f5e34);
const GRASS_LIGHT = new THREE.Color(0x707c45);
const DRY = new THREE.Color(0x857b54);
const DIRT = new THREE.Color(0x6b5b43);
const FOREST_FLOOR = new THREE.Color(0x36422a);
const ROCK = new THREE.Color(0x77736b);
const ASH = new THREE.Color(0x9c9a94);

/**
 * Terrain mesh (vertex-coloured heightmap + tiled detail texture) and its props. Trees and rocks are
 * InstancedMesh: a whole forest costs two draw calls.
 */
export class TerrainRenderer {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;

  constructor(readonly terrain: Terrain) {
    this.mesh = this.createGround();
    this.group.add(this.mesh);
    this.group.add(...this.createTrees(), this.createRocks());
  }

  private createGround(): THREE.Mesh {
    const t = this.terrain;
    const geometry = new THREE.PlaneGeometry(t.size, t.size, t.size, t.size);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(t.size / 2, 0, t.size / 2);
    const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) pos.setY(i, t.heights[i]);
    geometry.computeVertexNormals();

    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = pos.getY(i);
      const slope = t.slopeAt(x, z);
      c.copy(GRASS_DARK).lerp(GRASS_LIGHT, fbm(x * 0.05, z * 0.05, 91));
      c.lerp(DRY, smoothstep(0.55, 0.75, fbm(x * 0.02, z * 0.02, 92)) * 0.7);
      c.lerp(DIRT, smoothstep(0.62, 0.78, fbm(x * 0.035 + 40, z * 0.035, 93)) * 0.8);
      c.lerp(FOREST_FLOOR, Math.min(1, t.forestAt(x, z) * 1.4));
      c.lerp(ROCK, smoothstep(0.45, 0.95, slope));
      c.lerp(ASH, smoothstep(18, 34, y) * 0.8);
      // Cheap ambient occlusion: hollows are darker.
      const hollow = t.heightAt(x, z) - (t.heightAt(x + 4, z) + t.heightAt(x - 4, z) + t.heightAt(x, z + 4) + t.heightAt(x, z - 4)) / 4;
      c.multiplyScalar(THREE.MathUtils.clamp(1 + hollow * 0.12, 0.8, 1.08));
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      map: createDetailTexture(t.size),
      roughness: 0.97,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.name = 'terrain';
    return mesh;
  }

  private createTrees(): THREE.InstancedMesh[] {
    const t = this.terrain;
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const geometries = [pineGeometry(), broadleafGeometry()];
    const counts = [0, 0];
    for (let i = 0; i < t.treeCount; i++) counts[t.trees[i * 5 + 4]]++;
    const meshes = geometries.map((g, v) => {
      const mesh = new THREE.InstancedMesh(g, material, Math.max(1, counts[v]));
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      return mesh;
    });
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const tint = new THREE.Color();
    for (let i = 0; i < t.treeCount; i++) {
      const [x, z, scale, rot, variant] = t.trees.subarray(i * 5, i * 5 + 5);
      const mesh = meshes[variant];
      p.set(x, t.heightAt(x, z) - 0.15, z);
      q.setFromAxisAngle(up, rot);
      s.set(scale, scale * (0.9 + hash2(i, 3) * 0.25), scale);
      m.compose(p, q, s);
      mesh.setMatrixAt(mesh.count, m);
      const shade = 0.82 + hash2(i, 5) * 0.3;
      tint.setRGB(shade, shade * (0.95 + hash2(i, 6) * 0.1), shade * 0.95);
      mesh.setColorAt(mesh.count, tint);
      mesh.count++;
    }
    for (const mesh of meshes) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
    }
    return meshes;
  }

  private createRocks(): THREE.InstancedMesh {
    const t = this.terrain;
    const geometry = rockGeometry();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, t.rockCount));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const tint = new THREE.Color();
    for (let i = 0; i < t.rockCount; i++) {
      const [x, z, radius, rot] = t.rocks.subarray(i * 4, i * 4 + 4);
      e.set(hash2(i, 1) * 0.4, rot, hash2(i, 2) * 0.4);
      q.setFromEuler(e);
      s.set(radius, radius * (0.55 + hash2(i, 4) * 0.35), radius * (0.8 + hash2(i, 7) * 0.4));
      p.set(x, t.heightAt(x, z) - radius * 0.2, z);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      const shade = 0.8 + hash2(i, 8) * 0.35;
      mesh.setColorAt(i, tint.setRGB(shade, shade, shade * 0.97));
    }
    mesh.count = t.rockCount;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

function pineGeometry(): THREE.BufferGeometry {
  const trunk = paint(new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6).translate(0, 1.1, 0), 0x4a3526);
  const tiers = [
    paint(new THREE.ConeGeometry(2.0, 3.2, 7).translate(0, 3.0, 0), 0x2c4529),
    paint(new THREE.ConeGeometry(1.55, 2.8, 7).translate(0, 4.5, 0), 0x31502d),
    paint(new THREE.ConeGeometry(1.05, 2.4, 7).translate(0, 5.9, 0), 0x3a5a33),
  ];
  return merge([trunk, ...tiers]);
}

function broadleafGeometry(): THREE.BufferGeometry {
  const trunk = paint(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 6).translate(0, 1.3, 0), 0x4f3a28);
  const crown = new THREE.IcosahedronGeometry(2.3, 1);
  jitter(crown, 0.35, 11);
  crown.scale(1, 0.85, 1).translate(0, 4.0, 0);
  return merge([trunk, paint(crown, 0x4a5d2c)]);
}

function rockGeometry(): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(1, 1);
  jitter(g, 0.28, 5);
  return merge([paint(g, 0x807b72)]);
}

/** Moves vertices by a noise keyed on their position, so the shared corners of faces stay welded. */
function jitter(geometry: THREE.BufferGeometry, amount: number, seed: number): void {
  const pos = geometry.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const kx = Math.round(v.x * 100);
    const ky = Math.round(v.y * 100);
    const kz = Math.round(v.z * 100);
    const n = hash2(kx * 31 + kz, ky, seed) - 0.5;
    v.multiplyScalar(1 + n * amount * 2);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geometry.computeVertexNormals();
}

/** Value noise whose lattice wraps every `res / cell` cells: seamless when the texture repeats. */
function tileNoise(x: number, y: number, cell: number, seed: number): number {
  const period = 256 / cell;
  const fx = x / cell;
  const fy = y / cell;
  const xi = Math.floor(fx);
  const yi = Math.floor(fy);
  const tx = fx - xi;
  const ty = fy - yi;
  const sx = tx * tx * (3 - 2 * tx);
  const sy = ty * ty * (3 - 2 * ty);
  const h = (i: number, j: number) => hash2(((i % period) + period) % period, ((j % period) + period) % period, seed);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

/** Tiled grayscale grain that breaks the smoothness of the vertex colours up close. */
function createDetailTexture(size: number): THREE.CanvasTexture {
  const res = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = res;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(res, res);
  for (let y = 0; y < res; y++) {
    for (let x = 0; x < res; x++) {
      const n = tileNoise(x, y, 32, 3) * 0.35 + tileNoise(x, y, 16, 4) * 0.25 + hash2(x, y, 9) * 0.4;
      const v = Math.round(200 + (n - 0.5) * 90);
      const i = (y * res + x) * 4;
      img.data[i] = v;
      img.data[i + 1] = v;
      img.data[i + 2] = Math.round(v * 0.97);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(size / 7, size / 7);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

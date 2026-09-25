import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const tmpColor = new THREE.Color();

/** Adds a uniform vertex colour (sRGB hex) and drops the uv set, so pieces can be merged. */
export function paint(geometry: THREE.BufferGeometry, hex: number): THREE.BufferGeometry {
  const g = geometry;
  g.deleteAttribute('uv');
  tmpColor.setHex(hex);
  const count = g.getAttribute('position').count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colors[i * 3] = tmpColor.r;
    colors[i * 3 + 1] = tmpColor.g;
    colors[i * 3 + 2] = tmpColor.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

/** Adds a constant float attribute (e.g. a bone index or a team-colour mask) to every vertex. */
export function tag(geometry: THREE.BufferGeometry, name: string, value: number): THREE.BufferGeometry {
  const count = geometry.getAttribute('position').count;
  geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count).fill(value), 1));
  return geometry;
}

/** Merges pieces that all have the same attribute set; all are converted to non-indexed first. */
export function merge(pieces: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = pieces.map((p) => (p.index ? p.toNonIndexed() : p));
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('mergeGeometries failed: attribute sets differ');
  merged.computeBoundingSphere();
  return merged;
}

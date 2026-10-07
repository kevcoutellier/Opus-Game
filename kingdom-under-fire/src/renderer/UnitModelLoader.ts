import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { UnitModel } from '../units/UnitStats';
import { merge } from './GeometryUtils';
import { BONE } from './UnitMeshes';

/**
 * Unit models made in Blender (tools/blender/models), shipped in public/models. They replace the procedural
 * models of the same name; a model that fails to load keeps its procedural one.
 */
export const UNIT_MODEL_FILES: Partial<Record<UnitModel, string>> = {
  hero_gerald: 'models/hero_gerald.glb',
  human_footman: 'models/human_footman.glb',
};

const BONE_OF_JOINT = new Map<string, number>(Object.entries(BONE));

/**
 * Turns a glTF scene rigged on the engine's skeleton into the renderer's geometry: positions and normals in
 * model space, the material colour as vertex colour, `aBone` from the joint that drives the vertex (bone
 * names = keys of BONE), `aTeam` where the material is named `Team`. The GPU poses the parts afterwards,
 * exactly as it poses the procedural models.
 */
export function unitGeometryFromGltf(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const pieces: THREE.BufferGeometry[] = [];
  const normalMatrix = new THREE.Matrix3();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const source = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
    const position = source.getAttribute('position');
    if (!source.getAttribute('normal')) source.computeVertexNormals();
    const normal = source.getAttribute('normal');
    const count = position.count;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const material = materials[0] as THREE.MeshStandardMaterial;
    const color = material.color ?? new THREE.Color(1, 1, 1);
    const team = material.name.startsWith('Team') ? 1 : 0;

    const bones = new Float32Array(count);
    const skinned = mesh as THREE.SkinnedMesh;
    if (skinned.isSkinnedMesh) {
      const joints = source.getAttribute('skinIndex');
      const weights = source.getAttribute('skinWeight');
      for (let i = 0; i < count; i++) {
        let best = 0;
        for (let k = 1; k < 4; k++) if (weights.getComponent(i, k) > weights.getComponent(i, best)) best = k;
        const joint = skinned.skeleton.bones[joints.getComponent(i, best)];
        const bone = joint && BONE_OF_JOINT.get(joint.name);
        if (bone === undefined) throw new Error(`unit model: joint "${joint?.name}" is not a bone of the engine`);
        bones[i] = bone;
      }
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', position.clone().applyMatrix4(mesh.matrixWorld));
    g.setAttribute('normal', normal.clone().applyNormalMatrix(normalMatrix.getNormalMatrix(mesh.matrixWorld)));
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.setAttribute('aBone', new THREE.BufferAttribute(bones, 1));
    g.setAttribute('aTeam', new THREE.BufferAttribute(new Float32Array(count).fill(team), 1));
    g.setAttribute('aMount', new THREE.BufferAttribute(new Float32Array(count), 1));
    pieces.push(g);
  });
  if (!pieces.length) throw new Error('unit model: no mesh');
  return merge(pieces);
}

/** Parses a .glb already in memory (tests, or a file read elsewhere). */
export function parseUnitModel(data: ArrayBuffer): Promise<THREE.BufferGeometry> {
  return new Promise((resolve, reject) => {
    new GLTFLoader().parse(data, '', (gltf) => {
      try {
        resolve(unitGeometryFromGltf(gltf.scene));
      } catch (e) {
        reject(e);
      }
    }, reject);
  });
}

/**
 * Loads the Blender models and hands each one over as soon as it is ready. Returns the models that loaded;
 * the others keep their procedural geometry (a warning says why).
 */
export async function loadUnitModels(use: (model: UnitModel, geometry: THREE.BufferGeometry) => void, fetcher: typeof fetch = fetch): Promise<UnitModel[]> {
  const entries = Object.entries(UNIT_MODEL_FILES) as [UnitModel, string][];
  const loaded = await Promise.all(
    entries.map(async ([model, url]) => {
      try {
        const res = await fetcher(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        use(model, await parseUnitModel(await res.arrayBuffer()));
        return model;
      } catch (e) {
        console.warn(`unit model ${model} (${url}): ${(e as Error).message}; procedural model kept`);
        return null;
      }
    }),
  );
  return loaded.filter((m): m is UnitModel => m !== null);
}

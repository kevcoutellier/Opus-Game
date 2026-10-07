import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import geraldUrl from '../../public/models/hero_gerald.glb?inline';
import footmanUrl from '../../public/models/human_footman.glb?inline';
import { parseUnitModel, UNIT_MODEL_FILES, unitGeometryFromGltf } from '../../src/renderer/UnitModelLoader';
import { BONE, createUnitGeometry } from '../../src/renderer/UnitMeshes';
import type { UnitModel } from '../../src/units/UnitStats';

/** Triangles per model: soldiers are drawn by the hundred, twice a frame (colour and shadows). */
const BUDGET: Partial<Record<UnitModel, number>> = { hero_gerald: 3000, human_footman: 1000 };

/** The .glb files, inlined by Vite as data URLs (the tests run without a server). */
const FILES: Record<string, string> = { 'models/hero_gerald.glb': geraldUrl, 'models/human_footman.glb': footmanUrl };

const load = (file: string) => {
  const base64 = FILES[file].slice(FILES[file].indexOf(',') + 1);
  const bytes = Uint8Array.from(atob(base64), (ch) => ch.charCodeAt(0));
  return parseUnitModel(bytes.buffer);
};

describe('Blender unit models', () => {
  for (const [model, file] of Object.entries(UNIT_MODEL_FILES) as [UnitModel, string][]) {
    it(`${model}: rigged on the engine's bones, the size of the procedural model, within budget`, async () => {
      const g = await load(file);
      // Same attributes as the procedural geometry: the shader and the pools take either.
      expect(Object.keys(g.attributes).sort()).toEqual(Object.keys(createUnitGeometry(model).attributes).sort());
      const position = g.getAttribute('position');
      const bone = g.getAttribute('aBone');
      expect(position.count / 3).toBeLessThanOrEqual(BUDGET[model]!);

      g.computeBoundingBox();
      const box = g.boundingBox!;
      expect(box.min.y).toBeGreaterThan(-0.02);
      expect(box.max.y).toBeGreaterThan(1.75);
      expect(box.max.y).toBeLessThan(2.0);

      const used = new Set<number>();
      for (let i = 0; i < position.count; i++) {
        const b = bone.getX(i);
        used.add(b);
        const x = position.getX(i);
        const y = position.getY(i);
        const z = position.getZ(i);
        // Feet go with the legs; the left leg is on -x like the procedural models.
        if (y < 0.3) expect(b === BONE.LeftLeg ? x < 0 : b === BONE.RightLeg ? x > 0 : false).toBe(true);
        // The shield arm is on -x; the weapon stays within reach of the hand.
        if (b === BONE.Weapon) expect(Math.hypot(x - 0.29, y - 0.93, z - 0.05)).toBeLessThan(1.15);
        if (b === BONE.ShieldArm) expect(x).toBeLessThan(0);
      }
      expect([...used].sort()).toEqual([BONE.Body, BONE.LeftLeg, BONE.RightLeg, BONE.WeaponArm, BONE.ShieldArm, BONE.Weapon]);
      // The faction colour shows (surcoat, cape, shield): a good share of the surface.
      const a = new THREE.Vector3();
      const b = new THREE.Vector3();
      const c = new THREE.Vector3();
      let area = 0;
      let team = 0;
      for (let i = 0; i < position.count; i += 3) {
        a.fromBufferAttribute(position, i);
        b.fromBufferAttribute(position, i + 1);
        c.fromBufferAttribute(position, i + 2);
        const s = new THREE.Triangle(a, b, c).getArea();
        area += s;
        if (g.getAttribute('aTeam').getX(i) > 0.5) team += s;
      }
      expect(team / area).toBeGreaterThan(0.15);
    });
  }

  it('maps glTF joints to the engine bones and refuses an unknown joint', () => {
    const geometry = new THREE.BoxGeometry(0.2, 0.2, 0.2).translate(0, 1.2, 0);
    const count = geometry.getAttribute('position').count;
    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 1 ? 1 : 0)), 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Array(count * 4).fill(0).map((_, i) => (i % 4 === 1 ? 0.8 : i % 4 === 0 ? 0.2 : 0)), 4));
    const bones = [new THREE.Bone(), new THREE.Bone()];
    bones[0].name = 'Body';
    bones[1].name = 'WeaponArm';
    const material = new THREE.MeshStandardMaterial({ color: 0xff0000, name: 'Team' });
    const mesh = new THREE.SkinnedMesh(geometry, material);
    mesh.bind(new THREE.Skeleton(bones));
    const root = new THREE.Group().add(mesh);
    const g = unitGeometryFromGltf(root);
    expect(g.getAttribute('aBone').getX(0)).toBe(BONE.WeaponArm);
    expect(g.getAttribute('aTeam').getX(0)).toBe(1);
    expect(g.getAttribute('color').getX(0)).toBeCloseTo(1);
    bones[1].name = 'Tail';
    expect(() => unitGeometryFromGltf(root)).toThrow(/Tail/);
  });
});

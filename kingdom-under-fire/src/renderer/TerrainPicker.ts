import * as THREE from 'three';
import type { Terrain } from '../maps/Terrain';

/**
 * Screen → ground picking by ray marching the heightfield (1 m steps, then bisection): far cheaper than a
 * triangle raycast against the 131k-triangle terrain mesh.
 */
export class TerrainPicker {
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();

  constructor(
    private readonly terrain: Terrain,
    private readonly camera: THREE.PerspectiveCamera,
  ) {}

  pick(screenX: number, screenY: number, width: number, height: number): THREE.Vector3 | null {
    this.ndc.set((screenX / width) * 2 - 1, -(screenY / height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const { origin, direction } = this.raycaster.ray;
    const t = this.terrain;
    const above = (d: number) => origin.y + direction.y * d - t.heightAt(origin.x + direction.x * d, origin.z + direction.z * d);
    let prev = 0;
    for (let d = 1; d < 1500; d += 1) {
      if (above(d) <= 0) {
        let lo = prev;
        let hi = d;
        for (let k = 0; k < 12; k++) {
          const mid = (lo + hi) / 2;
          if (above(mid) > 0) lo = mid;
          else hi = mid;
        }
        const x = origin.x + direction.x * hi;
        const z = origin.z + direction.z * hi;
        if (x < 0 || z < 0 || x > t.size || z > t.size) return null;
        return new THREE.Vector3(x, t.heightAt(x, z), z);
      }
      prev = d;
    }
    return null;
  }
}

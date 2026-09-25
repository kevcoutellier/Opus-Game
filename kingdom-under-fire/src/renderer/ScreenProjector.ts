import * as THREE from 'three';
import type { ScreenPoint } from '../selection/SelectionManager';

/** Projects world points to CSS pixels for selection and UI anchoring. */
export class ScreenProjector {
  private readonly v = new THREE.Vector3();
  private readonly out: ScreenPoint = { x: 0, y: 0, visible: false };
  width = 1;
  height = 1;

  constructor(private readonly camera: THREE.Camera) {}

  /** Returns a shared object: copy the values before the next call. */
  project(x: number, y: number, z: number): ScreenPoint {
    const v = this.v.set(x, y, z).project(this.camera);
    this.out.x = (v.x * 0.5 + 0.5) * this.width;
    this.out.y = (-v.y * 0.5 + 0.5) * this.height;
    this.out.visible = v.z < 1 && v.x >= -1.05 && v.x <= 1.05 && v.y >= -1.05 && v.y <= 1.05;
    return this.out;
  }
}

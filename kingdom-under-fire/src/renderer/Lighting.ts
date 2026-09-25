import * as THREE from 'three';

/** Late-afternoon light of an overcast northern sky: cool fill, warm low sun. */
export const SUN_DIRECTION = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();

const SHADOW_EXTENT = 85;
const SHADOW_MAP = 2048;

export class Lighting {
  readonly hemisphere: THREE.HemisphereLight;
  readonly sun: THREE.DirectionalLight;

  constructor(scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(0xc2ccd8, 0x4b4336, 1.05);
    scene.add(this.hemisphere);

    this.sun = new THREE.DirectionalLight(0xffe0b5, 2.6);
    this.sun.castShadow = true;
    const cam = this.sun.shadow.camera;
    cam.left = -SHADOW_EXTENT;
    cam.right = SHADOW_EXTENT;
    cam.top = SHADOW_EXTENT;
    cam.bottom = -SHADOW_EXTENT;
    cam.near = 1;
    cam.far = 420;
    this.sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);
  }

  /** Keeps the shadow frustum centred on what the camera looks at, snapped to shadow texels (no shimmer). */
  follow(x: number, y: number, z: number): void {
    const texel = (SHADOW_EXTENT * 2) / SHADOW_MAP;
    const sx = Math.round(x / texel) * texel;
    const sz = Math.round(z / texel) * texel;
    this.sun.target.position.set(sx, y, sz);
    this.sun.position.set(sx + SUN_DIRECTION.x * 200, y + SUN_DIRECTION.y * 200, sz + SUN_DIRECTION.z * 200);
  }
}

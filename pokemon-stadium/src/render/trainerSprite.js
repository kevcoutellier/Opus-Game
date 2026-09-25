import * as THREE from 'three';
import { assetUrl } from './assets.js';
import { tween } from './tween.js';

const loader = new THREE.TextureLoader();
const cache = new Map();

/** One texture per picture; back pictures are 5 frames stacked vertically. */
function pixelTexture(name) {
  if (!cache.has(name)) {
    const tex = loader.load(assetUrl('trainers', name));
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.userData.frames = name.endsWith('_back') ? 5 : 1;
    tex.repeat.set(1, 1 / tex.userData.frames);
    cache.set(name, tex);
  }
  return cache.get(name);
}

const SIZE = 3.2;

/**
 * A FireRed/LeafGreen trainer picture standing on a trainer box. It turns to
 * the camera (around Y only) and shows its back picture when seen from behind,
 * if it has one. Back pictures hold 5 frames: the Poké Ball throw.
 */
export class TrainerSprite {
  constructor({ facing }) {
    this.facing = facing.clone().normalize();
    this.group = new THREE.Group();
    this.material = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.4, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(SIZE, SIZE), this.material);
    this.mesh.position.y = SIZE / 2;
    this.group.add(this.mesh);
    this.front = null;
    this.back = null;
    this.frame = 0;
    this.showingBack = null;
  }

  setPics(front, back = null) {
    this.front = front;
    this.back = back;
    this.showingBack = null;
  }

  apply(back) {
    const name = back ? this.back : this.front;
    if (!name) return;
    const tex = pixelTexture(name);
    this.material.map = tex;
    this.material.needsUpdate = true;
    this.frames = tex.userData.frames;
    this.showingBack = back;
    this.setFrame(this.frame);
  }

  setFrame(i) {
    this.frame = i;
    const tex = this.material.map;
    if (!tex) return;
    const f = Math.min(i, this.frames - 1);
    // Frames are stacked top to bottom; UV origin is at the bottom.
    tex.offset.set(0, 1 - (f + 1) / this.frames);
  }

  update(camera) {
    const pos = this.group.getWorldPosition(new THREE.Vector3());
    const toCam = camera.position.clone().sub(pos).setY(0);
    this.group.rotation.y = Math.atan2(toCam.x, toCam.z);
    const back = !!this.back && toCam.dot(this.facing) < 0;
    if (back !== this.showingBack) this.apply(back);
  }

  /** Plays the throw frames (only visible on back pictures). */
  throw(duration = 0.45) {
    return tween(duration, (k) => this.setFrame(1 + Math.min(3, Math.floor(k * 4))), (t) => t).then(() => this.setFrame(0));
  }
}

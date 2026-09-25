import * as THREE from 'three';
import { ease, tween } from './tween.js';
import { FIELD_SPOT } from './arena.js';

// Side 0 (player) stands at +z and faces -z; side 1 stands at -z.
export const spotOf = (side) => new THREE.Vector3(0, 0, side === 0 ? FIELD_SPOT : -FIELD_SPOT);
const dirOf = (side) => (side === 0 ? 1 : -1);

/** Moves the camera between named shots with eased transitions and shakes. */
export class Director {
  constructor(stage) {
    this.stage = stage;
    this.camera = stage.camera;
    this.pos = new THREE.Vector3(0, 14, 34);
    this.look = new THREE.Vector3(0, 1, 0);
    this.drift = 0.35;
    this.shakeAmount = 0;
    this.orbit = null;
    this.token = 0;
    stage.onUpdate((dt, time) => this.update(dt, time));
  }

  update(dt, time) {
    if (this.orbit) {
      const o = this.orbit;
      o.angle += dt * o.speed;
      this.pos.set(o.center.x + Math.sin(o.angle) * o.radius, o.height, o.center.z + Math.cos(o.angle) * o.radius);
      this.look.copy(o.center);
    }
    const d = this.drift;
    this.camera.position.set(
      this.pos.x + Math.sin(time * 0.31) * d,
      this.pos.y + Math.sin(time * 0.23) * d * 0.5,
      this.pos.z + Math.cos(time * 0.27) * d,
    );
    if (this.shakeAmount > 0.001) {
      this.camera.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shakeAmount));
      this.shakeAmount *= Math.max(0, 1 - dt * 6);
    }
    this.camera.lookAt(this.look);
  }

  shake(amount = 0.5) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Eased move to a position/target. `duration` 0 = hard cut. */
  moveTo(pos, look, duration = 0.9, easing = ease.inOutCubic) {
    this.orbit = null;
    const token = ++this.token;
    const fromPos = this.pos.clone();
    const fromLook = this.look.clone();
    return tween(duration, (k) => {
      if (token !== this.token) return;
      this.pos.lerpVectors(fromPos, pos, k);
      this.look.lerpVectors(fromLook, look, k);
    }, easing);
  }

  startOrbit({ center = new THREE.Vector3(0, 1.5, 0), radius = 34, height = 13, speed = 0.08, angle } = {}) {
    this.token++;
    this.orbit = { center, radius, height, speed, angle: angle ?? Math.atan2(this.pos.x, this.pos.z) };
  }

  // ------------------------------------------------------------- shots

  /**
   * Default battle view: high behind the player's Pokémon, looking at the foe.
   * Aimed low so the player's Pokémon stays above the command panel.
   */
  battleView(duration = 1.0) {
    return this.moveTo(new THREE.Vector3(7, 6.8, FIELD_SPOT + 10.3), new THREE.Vector3(-0.6, -1, -3.2), duration);
  }

  overview(duration = 1.2) {
    return this.moveTo(new THREE.Vector3(17, 11, 17), new THREE.Vector3(0, 0.5, 0), duration);
  }

  /** Front 3/4 close-up of a Pokémon (send-out, status, faint). */
  focus(side, height = 2, duration = 0.8) {
    const spot = spotOf(side);
    const d = dirOf(side);
    const dist = 3.2 + height * 1.25;
    const pos = new THREE.Vector3(d * dist * 0.75, height * 0.75 + 1.2, spot.z - d * dist);
    return this.moveTo(pos, new THREE.Vector3(0, height * 0.5, spot.z), duration);
  }

  /** Over-the-shoulder shot from the attacker towards its target. */
  attackView(side, height = 2, duration = 0.6) {
    const spot = spotOf(side);
    const d = dirOf(side);
    // Pull back further for big Pokémon so they don't hide their target.
    const pos = new THREE.Vector3(d * (3.4 + height * 1.1), 2.6 + height * 0.95, spot.z + d * (5 + height * 1.5));
    return this.moveTo(pos, new THREE.Vector3(0, 1.2, -spot.z * 0.55), duration);
  }

  /** Side view showing both Pokémon, for moves that travel across the field. */
  sideView(side, duration = 0.5) {
    const d = dirOf(side);
    return this.moveTo(new THREE.Vector3(15 * d, 4.5, d * 2.5), new THREE.Vector3(0, 1.4, -d * 0.5), duration);
  }

  /** Low shot on the trainer box (Poké Ball throw). */
  trainerView(side, duration = 0.8) {
    const d = dirOf(side);
    return this.moveTo(new THREE.Vector3(d * 5, 3.2, d * 18.5), new THREE.Vector3(0, 1.4, d * 8), duration);
  }
}

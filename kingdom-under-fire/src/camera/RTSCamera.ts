import * as THREE from 'three';
import type { KeyboardInput } from '../input/KeyboardInput';
import { MouseButton, type MouseInput } from '../input/MouseInput';

export interface CameraBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const EDGE_PIXELS = 10;
const MIN_DISTANCE = 12;
const MAX_DISTANCE = 190;

const damp = (current: number, goal: number, lambda: number, dt: number) =>
  current + (goal - current) * (1 - Math.exp(-lambda * dt));

/**
 * Strategy camera orbiting a ground target. Pitch follows the zoom (low and cinematic up close, high and
 * readable far away) unless the free camera is on. All motions are damped for a heavy, smooth feel.
 */
export class RTSCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** Point on the ground the camera looks at (current, damped). */
  readonly target = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  distance = 95;
  private goalDistance = 95;
  yaw = 0;
  private goalYaw = 0;
  /** Extra pitch added by the player (radians), on top of the zoom-driven pitch. */
  private tilt = 0;
  private goalTilt = 0;
  freeCamera = false;
  edgeScroll = true;

  constructor(
    private readonly heightAt: (x: number, z: number) => number,
    readonly bounds: CameraBounds,
  ) {
    this.camera = new THREE.PerspectiveCamera(42, 1, 0.5, 2000);
  }

  /** Centres the view on a point, optionally at a given zoom. */
  focus(x: number, z: number, distance?: number, instant = false): void {
    this.goal.set(x, 0, z);
    this.clampGoal();
    if (distance !== undefined) this.goalDistance = THREE.MathUtils.clamp(distance, MIN_DISTANCE, MAX_DISTANCE);
    if (instant) {
      this.target.copy(this.goal);
      this.distance = this.goalDistance;
      this.target.y = this.heightAt(this.target.x, this.target.z);
    }
  }

  pan(right: number, forward: number): void {
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.goal.x += right * cos - forward * sin;
    this.goal.z += -right * sin - forward * cos;
    this.clampGoal();
  }

  zoom(steps: number): void {
    this.goalDistance = THREE.MathUtils.clamp(this.goalDistance * Math.pow(1.13, steps), MIN_DISTANCE, MAX_DISTANCE);
  }

  rotate(radians: number): void {
    this.goalYaw += radians;
  }

  tiltBy(radians: number): void {
    this.goalTilt = THREE.MathUtils.clamp(this.goalTilt + radians, -0.5, 0.5);
  }

  reset(): void {
    this.goalYaw = Math.round(this.goalYaw / (Math.PI * 2)) * Math.PI * 2;
    this.goalTilt = 0;
    this.goalDistance = 95;
  }

  /** Reads the inputs (keyboard pan/rotate, edge scroll, wheel, middle drag) and moves the camera. */
  update(dt: number, keys: KeyboardInput, mouse: MouseInput, viewport: { width: number; height: number }, allowEdge = true): void {
    const speed = (0.45 + this.goalDistance / 70) * 32 * dt * (keys.shift ? 2.2 : 1);
    let right = 0;
    let forward = 0;
    if (keys.isDown('KeyW', 'ArrowUp')) forward += 1;
    if (keys.isDown('KeyS', 'ArrowDown')) forward -= 1;
    if (keys.isDown('KeyD', 'ArrowRight')) right += 1;
    if (keys.isDown('KeyA', 'ArrowLeft')) right -= 1;
    if (this.edgeScroll && allowEdge && mouse.inside && !mouse.isDown(MouseButton.Middle)) {
      if (mouse.x <= EDGE_PIXELS) right -= 1;
      if (mouse.x >= viewport.width - EDGE_PIXELS - 1) right += 1;
      if (mouse.y <= EDGE_PIXELS) forward += 1;
      if (mouse.y >= viewport.height - EDGE_PIXELS - 1) forward -= 1;
    }
    if (right || forward) {
      const len = Math.hypot(right, forward);
      this.pan((right / len) * speed, (forward / len) * speed);
    }
    if (keys.isDown('KeyQ')) this.rotate(1.6 * dt);
    if (keys.isDown('KeyE')) this.rotate(-1.6 * dt);
    if (keys.isDown('PageUp')) this.tiltBy(0.9 * dt);
    if (keys.isDown('PageDown')) this.tiltBy(-0.9 * dt);
    if (keys.isDown('Equal', 'NumpadAdd')) this.zoom(-6 * dt);
    if (keys.isDown('Minus', 'NumpadSubtract')) this.zoom(6 * dt);
    if (mouse.wheel) this.zoom(mouse.wheel);
    if (mouse.isDown(MouseButton.Middle)) {
      this.rotate(-mouse.dx * 0.006);
      this.tiltBy(mouse.dy * 0.004);
    }

    this.target.x = damp(this.target.x, this.goal.x, 10, dt);
    this.target.z = damp(this.target.z, this.goal.z, 10, dt);
    this.target.y = damp(this.target.y, this.heightAt(this.target.x, this.target.z), 6, dt);
    this.distance = damp(this.distance, this.goalDistance, 9, dt);
    this.yaw = damp(this.yaw, this.goalYaw, 10, dt);
    this.tilt = damp(this.tilt, this.goalTilt, 10, dt);
    this.apply();
  }

  /** Pitch above the horizon (radians). */
  get pitch(): number {
    if (this.freeCamera) return THREE.MathUtils.clamp(0.9 + this.tilt * 2.2, 0.12, 1.45);
    const t = (this.distance - MIN_DISTANCE) / (MAX_DISTANCE - MIN_DISTANCE);
    return THREE.MathUtils.clamp(0.42 + Math.sqrt(t) * 0.68 + this.tilt, 0.2, 1.4);
  }

  apply(): void {
    const pitch = this.pitch;
    const d = this.distance;
    const cam = this.camera;
    cam.position.set(
      this.target.x + Math.sin(this.yaw) * Math.cos(pitch) * d,
      this.target.y + Math.sin(pitch) * d,
      this.target.z + Math.cos(this.yaw) * Math.cos(pitch) * d,
    );
    // Never sink below the ground (hills between the camera and the target).
    const ground = this.heightAt(cam.position.x, cam.position.z) + 2.5;
    if (cam.position.y < ground) cam.position.y = ground;
    cam.lookAt(this.target.x, this.target.y + 1, this.target.z);
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  private clampGoal(): void {
    const b = this.bounds;
    this.goal.x = THREE.MathUtils.clamp(this.goal.x, b.minX, b.maxX);
    this.goal.z = THREE.MathUtils.clamp(this.goal.z, b.minZ, b.maxZ);
  }
}

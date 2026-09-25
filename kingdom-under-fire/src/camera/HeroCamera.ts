import * as THREE from 'three';

/** Seconds of the glide between the RTS view and the view over the hero's shoulder. */
const TRANSITION = 0.7;
const MIN_DISTANCE = 3.5;
const MAX_DISTANCE = 13;

const ease = (t: number) => t * t * (3 - 2 * t);
const damp = (from: number, to: number, rate: number, dt: number) => to + (from - to) * Math.exp(-rate * dt);

/**
 * Third-person camera of a hero under direct control: behind and above the hero, turned by the mouse
 * (`yaw`, `pitch`), zoomed by the wheel, never under the ground. It drives the same PerspectiveCamera as
 * the RTS camera and glides from one view to the other when control is taken or given back.
 * Yaw follows the RTS convention: the camera sits at (sin yaw, cos yaw) from what it looks at.
 */
export class HeroCamera {
  yaw = 0;
  pitch = 0.3;
  distance = 7;
  active = false;
  /** 0 → 1 during a transition. */
  private blend = 1;
  private readonly fromPosition = new THREE.Vector3();
  private readonly fromQuaternion = new THREE.Quaternion();
  private readonly look = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly goalQuaternion = new THREE.Quaternion();
  /** A camera, so that lookAt points its -z axis at the target. */
  private readonly helper = new THREE.PerspectiveCamera();
  private smoothX = 0;
  private smoothY = 0;
  private smoothZ = 0;

  constructor(private readonly heightAt: (x: number, z: number) => number) {}

  /** Direction the camera looks at on the ground (unit vector); the hero aims this way. */
  get forwardX(): number {
    return -Math.sin(this.yaw);
  }

  get forwardZ(): number {
    return -Math.cos(this.yaw);
  }

  /** Aim of the hero in simulation convention (facing (sin, cos)). */
  get aim(): number {
    return this.yaw + Math.PI;
  }

  /** Starts following the hero at (x, y, z) facing `rot`, gliding from the camera's current pose. */
  enter(camera: THREE.Camera, x: number, y: number, z: number, rot: number): void {
    this.active = true;
    this.yaw = rot + Math.PI;
    this.smoothX = x;
    this.smoothY = y;
    this.smoothZ = z;
    this.startTransition(camera);
  }

  /** Gives the camera back to the RTS view, gliding from the current pose (see `release`). */
  exit(camera: THREE.Camera): void {
    this.active = false;
    this.startTransition(camera);
  }

  mouseLook(dx: number, dy: number): void {
    this.yaw -= dx * 0.0032;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * 0.0025, -0.05, 1.1);
  }

  zoom(steps: number): void {
    this.distance = THREE.MathUtils.clamp(this.distance * Math.pow(1.12, steps), MIN_DISTANCE, MAX_DISTANCE);
  }

  /** Places the camera behind the hero at (x, y, z) (y = ground height under it). */
  update(camera: THREE.PerspectiveCamera, dt: number, x: number, y: number, z: number): void {
    this.smoothX = damp(this.smoothX, x, 14, dt);
    this.smoothY = damp(this.smoothY, y, 10, dt);
    this.smoothZ = damp(this.smoothZ, z, 14, dt);
    const d = this.distance;
    const horizontal = Math.cos(this.pitch) * d;
    this.position.set(
      this.smoothX + Math.sin(this.yaw) * horizontal,
      this.smoothY + 1.9 + Math.sin(this.pitch) * d,
      this.smoothZ + Math.cos(this.yaw) * horizontal,
    );
    const ground = this.heightAt(this.position.x, this.position.z) + 0.6;
    if (this.position.y < ground) this.position.y = ground;
    // Look a little ahead of the hero, over its shoulder.
    this.look.set(this.smoothX + this.forwardX * 2.5, this.smoothY + 1.6, this.smoothZ + this.forwardZ * 2.5);
    this.helper.position.copy(this.position);
    this.helper.lookAt(this.look);
    this.goalQuaternion.copy(this.helper.quaternion);
    this.blendInto(camera, this.position, this.goalQuaternion, dt);
  }

  /** While gliding back to the RTS view: call after the RTS camera has placed the camera. */
  release(camera: THREE.PerspectiveCamera, dt: number): void {
    if (this.active || this.blend >= 1) return;
    this.position.copy(camera.position);
    this.goalQuaternion.copy(camera.quaternion);
    this.blendInto(camera, this.position, this.goalQuaternion, dt);
  }

  private startTransition(camera: THREE.Camera): void {
    this.fromPosition.copy(camera.position);
    this.fromQuaternion.copy(camera.quaternion);
    this.blend = 0;
  }

  private blendInto(camera: THREE.Camera, position: THREE.Vector3, quaternion: THREE.Quaternion, dt: number): void {
    this.blend = Math.min(1, this.blend + dt / TRANSITION);
    const t = ease(this.blend);
    camera.position.lerpVectors(this.fromPosition, position, t);
    camera.quaternion.slerpQuaternions(this.fromQuaternion, quaternion, t);
    camera.updateMatrixWorld();
  }
}

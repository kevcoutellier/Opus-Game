import type * as THREE from 'three';
import type { HeroCamera } from '../camera/HeroCamera';
import type { World } from '../core/World';
import type { HeroState, HeroSystem } from '../heroes/HeroSystem';
import type { SelectionManager } from '../selection/SelectionManager';
import type { KeyboardInput } from './KeyboardInput';
import { MouseButton, type MouseInput } from './MouseInput';

/** Ability keys in the RTS view (physical row Z X C V, i.e. W X C V on AZERTY); 1–4 under direct control. */
export const ABILITY_KEYS = ['KeyZ', 'KeyX', 'KeyC', 'KeyV'] as const;
const DIRECT_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const;

export interface TargetPreview {
  x: number;
  z: number;
  radius: number;
  heroX: number;
  heroZ: number;
  range: number;
}

export interface HeroInputDeps {
  world: World;
  heroes: HeroSystem;
  selection: SelectionManager;
  mouse: MouseInput;
  keys: KeyboardInput;
  camera: HeroCamera;
  team: number;
  /** Ground point under a screen position, or null. */
  pickGround(x: number, y: number): THREE.Vector3 | null;
  viewport(): { width: number; height: number };
  /** Area of the ability being aimed, or null. */
  preview(target: TargetPreview | null): void;
  /** Direct control taken (hero id) or given back (-1): the game switches cameras. */
  onDirect(hero: number): void;
}

/** Largest radius among the effects of an ability (for the aiming ring). */
function areaOf(h: HeroState, slot: number): number {
  let radius = 1;
  for (const e of h.abilities[slot].effects) {
    if ('radius' in e && e.kind !== 'buff' && e.kind !== 'morale') radius = Math.max(radius, e.radius);
    if (e.kind === 'dash') radius = Math.max(radius, e.width);
  }
  return radius;
}

/**
 * The player's hands on his hero.
 *  - RTS view: Z X C V (or the ability bar) casts; an ability aimed at the ground shows its area under the
 *    cursor, left click casts, right click or Escape cancels.
 *  - Tab: direct third-person control. WASD walks relative to the camera, the mouse turns it (pointer
 *    locked after a click), left click strikes, right click strikes hard, Space dodges, 1–4 cast at the
 *    point in the middle of the screen, Tab or Escape gives the hero back to the army.
 */
export class HeroInput {
  targeting: { hero: number; slot: number } | null = null;
  /** Hero under direct control, -1 when none. */
  direct = -1;
  /** The rest of a click that cast or cancelled must not select or order anything. */
  private swallow = false;
  private lastSteer = '';

  constructor(private readonly d: HeroInputDeps) {
    d.mouse.listen({
      down: (button, x, y) => {
        if (this.direct >= 0) {
          if (!d.mouse.locked) d.mouse.lock();
          if (button === MouseButton.Left || button === MouseButton.Right) {
            d.world.commands.push({ kind: 'heroStrike', team: d.team, hero: this.direct, heavy: button === MouseButton.Right });
          }
          return;
        }
        if (!this.targeting) return;
        this.swallow = true;
        if (button === MouseButton.Left) {
          const p = d.pickGround(x, y);
          if (p) this.cast(this.targeting.hero, this.targeting.slot, p.x, p.z);
        }
        this.targeting = null;
        d.preview(null);
      },
    });
  }

  /** True while the hero controls own the mouse: selection and orders must ignore it. */
  get busy(): boolean {
    return this.targeting !== null || this.swallow || this.direct >= 0;
  }

  /** The hero the controls act on: a selected hero of the player, else his first living hero. */
  hero(): HeroState | null {
    const { heroes, selection, team } = this.d;
    if (this.direct >= 0) return heroes.get(this.direct) ?? null;
    for (const id of selection.ids) {
      const h = heroes.get(id);
      if (h?.alive && h.team === team) return h;
    }
    return heroes.list(team)[0] ?? null;
  }

  /** Ability `slot` of the current hero: cast at once (self) or start aiming it (point). */
  trigger(slot: number): void {
    const h = this.hero();
    if (!h || !h.abilities[slot] || this.d.heroes.blocked(this.d.world, h, slot)) return;
    const a = h.abilities[slot];
    if (a.targeting === 'self') {
      this.cast(h.id, slot, 0, 0);
    } else if (this.direct >= 0) {
      const p = this.aimPoint(h, a.range);
      this.cast(h.id, slot, p.x, p.z);
    } else {
      this.targeting = { hero: h.id, slot };
    }
  }

  toggleDirect(): void {
    const { world, team, mouse } = this.d;
    if (this.direct >= 0) {
      world.commands.push({ kind: 'heroControl', team, hero: this.direct, direct: false });
      this.direct = -1;
      mouse.unlock();
      this.d.onDirect(-1);
      return;
    }
    const h = this.hero();
    if (!h) return;
    this.targeting = null;
    this.d.preview(null);
    world.commands.push({ kind: 'heroControl', team, hero: h.id, direct: true });
    this.direct = h.id;
    this.lastSteer = '';
    this.d.onDirect(h.id);
  }

  /** Per frame, after the keyboard and mouse have been read. */
  update(): void {
    const { keys, mouse } = this.d;
    if (this.swallow && !mouse.isDown(MouseButton.Left) && !mouse.isDown(MouseButton.Right)) this.swallow = false;
    for (const code of keys.justPressed) {
      if (code === 'Tab') this.toggleDirect();
      else if (code === 'Escape' && this.direct >= 0) this.toggleDirect();
      else if (code === 'Escape' && this.targeting) {
        this.targeting = null;
        this.d.preview(null);
      } else if (this.direct >= 0) {
        const slot = DIRECT_KEYS.indexOf(code as (typeof DIRECT_KEYS)[number]);
        if (slot >= 0) this.trigger(slot);
        if (code === 'Space') this.dodge();
      } else {
        const slot = ABILITY_KEYS.indexOf(code as (typeof ABILITY_KEYS)[number]);
        if (slot >= 0 && !keys.ctrl) this.trigger(slot);
      }
    }
    if (this.direct >= 0) this.steer();
    else if (this.targeting) this.aim();
  }

  private cast(hero: number, slot: number, x: number, z: number): void {
    this.d.world.commands.push({ kind: 'cast', team: this.d.team, hero, slot, x, z });
  }

  /** Ground point under the middle of the screen (the crosshair), within `range` of the hero. */
  private aimPoint(h: HeroState, range: number): { x: number; z: number } {
    const { world, camera, viewport } = this.d;
    const { width, height } = viewport();
    const hx = world.c.x[h.id];
    const hz = world.c.z[h.id];
    const p = this.d.pickGround(width / 2, height / 2);
    if (p && Math.hypot(p.x - hx, p.z - hz) <= range) return { x: p.x, z: p.z };
    return { x: hx + camera.forwardX * range * 0.8, z: hz + camera.forwardZ * range * 0.8 };
  }

  private aim(): void {
    const { world, mouse, heroes } = this.d;
    const t = this.targeting!;
    const h = heroes.get(t.hero);
    if (!h?.alive) {
      this.targeting = null;
      this.d.preview(null);
      return;
    }
    const p = this.d.pickGround(mouse.x, mouse.y);
    const hx = world.c.x[h.id];
    const hz = world.c.z[h.id];
    const range = h.abilities[t.slot].range;
    if (!p) return;
    // Shown where it will land: clamped to the range, like the cast.
    let x = p.x;
    let z = p.z;
    const dist = Math.hypot(x - hx, z - hz);
    if (dist > range) {
      x = hx + ((x - hx) / dist) * range;
      z = hz + ((z - hz) / dist) * range;
    }
    this.d.preview({ x, z, radius: areaOf(h, t.slot), heroX: hx, heroZ: hz, range });
  }

  private steer(): void {
    const { keys, mouse, camera, world, team } = this.d;
    const h = this.hero();
    if (!h?.alive) {
      this.toggleDirect();
      return;
    }
    if (mouse.locked) camera.mouseLook(mouse.dx, mouse.dy);
    if (keys.isDown('KeyQ')) camera.yaw += 0.03;
    if (keys.isDown('KeyE')) camera.yaw -= 0.03;
    if (mouse.wheel) camera.zoom(mouse.wheel);
    let forward = 0;
    let right = 0;
    if (keys.isDown('KeyW', 'ArrowUp')) forward += 1;
    if (keys.isDown('KeyS', 'ArrowDown')) forward -= 1;
    if (keys.isDown('KeyD', 'ArrowRight')) right += 1;
    if (keys.isDown('KeyA', 'ArrowLeft')) right -= 1;
    const len = Math.hypot(forward, right) || 1;
    const fx = camera.forwardX;
    const fz = camera.forwardZ;
    // Right of the view = forward turned a quarter clockwise seen from above.
    const x = ((forward * fx - right * fz) / len) * (keys.shift ? 0.45 : 1);
    const z = ((forward * fz + right * fx) / len) * (keys.shift ? 0.45 : 1);
    const aim = camera.aim;
    const key = `${x.toFixed(3)},${z.toFixed(3)},${aim.toFixed(3)}`;
    if (key === this.lastSteer) return;
    this.lastSteer = key;
    world.commands.push({ kind: 'heroSteer', team, hero: h.id, x, z, aim });
  }

  private dodge(): void {
    const { keys, camera, world, team } = this.d;
    let forward = 0;
    let right = 0;
    if (keys.isDown('KeyW', 'ArrowUp')) forward += 1;
    if (keys.isDown('KeyS', 'ArrowDown')) forward -= 1;
    if (keys.isDown('KeyD', 'ArrowRight')) right += 1;
    if (keys.isDown('KeyA', 'ArrowLeft')) right -= 1;
    // Without direction, a step back.
    if (!forward && !right) forward = -1;
    const fx = camera.forwardX;
    const fz = camera.forwardZ;
    world.commands.push({ kind: 'heroDodge', team, hero: this.direct, x: forward * fx - right * fz, z: forward * fz + right * fx });
  }
}

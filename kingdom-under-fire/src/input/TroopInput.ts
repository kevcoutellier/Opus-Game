import type * as THREE from 'three';
import type { World } from '../core/World';
import { FORMATION_TYPES, type FormationType } from '../formations/FormationType';
import type { FormationManager } from '../formations/FormationManager';
import type { Troop, TroopSystem } from '../troops/TroopSystem';
import type { KeyboardInput } from './KeyboardInput';
import { MouseButton, type MouseInput } from './MouseInput';

export interface TroopInputDeps {
  world: World;
  troops: TroopSystem;
  formations: FormationManager;
  mouse: MouseInput;
  keys: KeyboardInput;
  team: number;
  /** Ground point under a screen position, or null. */
  pickGround(x: number, y: number): THREE.Vector3 | null;
  /** Unit under a screen position, those of the preferred side first, or -1. */
  pickUnit(x: number, y: number, prefer: 'own' | 'enemy'): number;
  /** Feedback on the ground where an order was given. */
  marker(x: number, z: number, attack: boolean): void;
  /** A troop was chosen; `focus`: the camera should move behind it. */
  onSelect(troop: Troop, focus: boolean): void;
  /** Area of the skill being aimed and the reach of the troop, or null. */
  preview(target: { x: number; z: number; radius: number; heroX: number; heroZ: number; range: number } | null): void;
}

const SKILL_KEYS = ['Digit1', 'Digit2', 'Digit3', 'Digit4'] as const;

/**
 * The player's orders to his troops, in tactic mode (The Crusaders: one troop is chosen at a time and
 * receives the orders):
 *  - Q / E (A / E on AZERTY), the triggers of the pad: previous / next troop, the camera goes behind it;
 *  - left click on one of his soldiers: chooses that soldier's troop;
 *  - right click: the troop marches there, on an enemy it attacks the enemy's troop;
 *    Shift + right click: adds a waypoint; Ctrl + right click: the whole army marches there;
 *  - F (Shift + F): next (previous) formation, H: hold the position;
 *  - 1–4: the skills of the troop (an aimed skill shows its area under the cursor: left click uses it,
 *    right click or Escape cancels).
 */
export class TroopInput {
  /** Troop receiving the orders, -1 when none. */
  selected = -1;
  /** When it returns true (the hero controls own the mouse), the mouse gives no order. */
  blocked: () => boolean = () => false;
  /** Skill of the chosen troop being aimed at the ground. */
  targeting: { troop: number; slot: number } | null = null;
  /** The rest of a click that used or cancelled a skill must not select or order anything. */
  private swallow = false;

  constructor(private readonly d: TroopInputDeps) {
    d.mouse.listen({
      down: (button, x, y) => {
        if (!this.targeting || this.blocked()) return;
        this.swallow = true;
        if (button === MouseButton.Left) {
          const p = d.pickGround(x, y);
          if (p) this.useSkill(this.targeting.troop, this.targeting.slot, p.x, p.z);
        }
        this.cancelTargeting();
      },
      up: (button, x, y, drag) => {
        if (this.swallow) {
          this.swallow = false;
          return;
        }
        if (this.blocked() || drag.moved) return;
        if (button === MouseButton.Left) {
          const unit = d.pickUnit(x, y, 'own');
          const troop = unit >= 0 && d.world.c.team[unit] === d.team ? d.troops.of(unit) : undefined;
          if (troop && troop.status !== 'defeated') this.select(troop, false);
        } else if (button === MouseButton.Right) {
          this.order(x, y);
        }
      },
    });
  }

  /** The chosen troop, if it can still take orders. */
  troop(): Troop | null {
    const t = this.d.troops.get(this.selected);
    return t && t.status !== 'defeated' && t.status !== 'routing' ? t : null;
  }

  /** The player's troops that can take orders, in deployment order. */
  standing(): Troop[] {
    return this.d.troops.list(this.d.team, true);
  }

  select(troop: Troop, focus: boolean): void {
    if (this.targeting && this.targeting.troop !== troop.id) this.cancelTargeting();
    this.selected = troop.id;
    this.d.onSelect(troop, focus);
  }

  /** Next (step 1) or previous (step -1) standing troop. */
  cycle(step: number): void {
    const list = this.standing();
    if (!list.length) return;
    const i = list.findIndex((t) => t.id === this.selected);
    const next = list[(i + step + list.length) % list.length];
    if (i < 0 && step < 0) this.select(list[list.length - 1], true);
    else this.select(next, true);
  }

  /** Per frame (tactic mode): hotkeys, the area of a skill being aimed; a broken troop is replaced. */
  update(): void {
    const { keys } = this.d;
    if (!this.troop()) {
      const first = this.standing()[0];
      if (first) this.select(first, false);
    }
    for (const code of keys.justPressed) {
      if (code === 'KeyQ') this.cycle(-1);
      else if (code === 'KeyE') this.cycle(1);
      else if (code === 'KeyF') this.cycleFormation(keys.shift ? -1 : 1);
      else if (code === 'KeyH') this.hold();
      else if (code === 'Escape' && this.targeting) this.cancelTargeting();
      else {
        const slot = SKILL_KEYS.indexOf(code as (typeof SKILL_KEYS)[number]);
        if (slot >= 0) this.skill(slot);
      }
    }
    if (this.targeting) this.aim();
  }

  /** Skill `slot` of the chosen troop: used at once (around the troop) or aimed at the ground. */
  skill(slot: number): void {
    const t = this.troop();
    if (!t || this.d.troops.skillBlocked(t, slot)) return;
    if (t.skills[slot].targeting === 'self') this.useSkill(t.id, slot, 0, 0);
    else this.targeting = { troop: t.id, slot };
  }

  cancelTargeting(): void {
    this.targeting = null;
    this.d.preview(null);
  }

  private useSkill(troop: number, slot: number, x: number, z: number): void {
    this.d.world.commands.push({ kind: 'troopSkill', team: this.d.team, troop, slot, x, z });
  }

  /** Shows where the aimed skill would land: within its range of the leader, like the command. */
  private aim(): void {
    const { troops, world, mouse } = this.d;
    const t = troops.get(this.targeting!.troop);
    const a = t?.skills[this.targeting!.slot];
    if (!t || !a || t.status === 'routing' || t.status === 'defeated') {
      this.cancelTargeting();
      return;
    }
    const p = this.d.pickGround(mouse.x, mouse.y);
    if (!p) return;
    const lx = world.c.x[t.leader];
    const lz = world.c.z[t.leader];
    let x = p.x;
    let z = p.z;
    const d = Math.hypot(x - lx, z - lz);
    if (d > a.range) {
      x = lx + ((x - lx) / d) * a.range;
      z = lz + ((z - lz) / d) * a.range;
    }
    let radius = 1;
    for (const e of a.effects) if ('radius' in e) radius = Math.max(radius, e.radius);
    this.d.preview({ x, z, radius, heroX: lx, heroZ: lz, range: a.range });
  }

  /** Order at a screen position: attack the troop of the enemy under it, else march there. */
  order(x: number, y: number): void {
    const { world, keys, team } = this.d;
    const unit = this.d.pickUnit(x, y, 'enemy');
    if (unit >= 0 && world.c.team[unit] !== team) {
      const enemy = this.d.troops.of(unit);
      if (enemy && this.attack(enemy)) return;
    }
    const ground = this.d.pickGround(x, y);
    if (ground) this.moveTo(ground.x, ground.z, keys.shift, keys.ctrl);
  }

  /** March order to a ground point (from the screen or the minimap). */
  moveTo(x: number, z: number, queue: boolean, all: boolean): void {
    const { world, team } = this.d;
    if (all) {
      world.commands.push({ kind: 'troopsMoveAll', team, x, z });
      this.d.marker(x, z, false);
      return;
    }
    const t = this.troop();
    if (!t) return;
    world.commands.push({ kind: 'troopMove', team, troop: t.id, x, z, queue });
    this.d.marker(x, z, false);
  }

  attack(enemy: Troop): boolean {
    const t = this.troop();
    if (!t || enemy.team === this.d.team || enemy.status === 'defeated') return false;
    const { world, team } = this.d;
    world.commands.push({ kind: 'troopAttack', team, troop: t.id, target: enemy.id });
    this.d.marker(world.c.x[enemy.leader], world.c.z[enemy.leader], true);
    return true;
  }

  hold(): void {
    const t = this.troop();
    if (t) this.d.world.commands.push({ kind: 'troopHold', team: this.d.team, troop: t.id });
  }

  setFormation(type: FormationType): void {
    const t = this.troop();
    if (t) this.d.world.commands.push({ kind: 'troopFormation', team: this.d.team, troop: t.id, formation: type });
  }

  /** Formation of the chosen troop (that of its leader, or of its first soldier). */
  formation(): FormationType | null {
    const t = this.troop();
    if (!t) return null;
    const { c } = this.d.world;
    for (const id of t.members) {
      const f = this.d.formations.get(c.formation[id]);
      if (f) return f.type;
    }
    return null;
  }

  private cycleFormation(step: number): void {
    const i = FORMATION_TYPES.indexOf(this.formation() ?? 'LINE');
    this.setFormation(FORMATION_TYPES[(i + step + FORMATION_TYPES.length) % FORMATION_TYPES.length]);
  }
}

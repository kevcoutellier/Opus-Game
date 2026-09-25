import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { UNIT_DEFS } from '../data/units';
import { Comp, NO_ENTITY, Order, UnitState, type OrderId } from '../entities/Components';
import type { UnitRole } from '../units/UnitStats';
import { Formation } from './Formation';
import { assignSlots, columnsForWidth, computeSlots } from './FormationSolver';
import type { FormationType } from './FormationType';

/** Front ranks first: melee, then ranged and siege. */
const ROLE_PRIORITY: Record<UnitRole, number> = { infantry: 0, spear: 0, hero: 0, cavalry: 0, archer: 1, worker: 1, siege: 2 };
/** Minimum seconds between two re-deals of the slots after casualties (avoids constant shuffling). */
const RESOLVE_COOLDOWN = 1.5;

/**
 * Owns the formations: turns orders into formations (one flow field and one slot solve per order, never
 * one path per soldier), moves every anchor along its flow field at the pace of its slowest members, and
 * writes each member's slot position and facing for the MovementSystem.
 */
export class FormationManager implements System {
  readonly name = 'formations';
  private readonly formations = new Map<number, Formation>();
  private nextId = 1;
  private readonly dir = { x: 0, z: 0 };

  constructor(private readonly world: World) {
    const q = world.commands;
    q.on('formationMove', (cmd) => {
      const f = this.gather(cmd.team, cmd.units, cmd.formation);
      if (!f) return;
      if (cmd.formation) f.type = cmd.formation;
      if (cmd.width !== null) f.columns = columnsForWidth(cmd.width, f.spacing, f.size);
      f.targetUnit = -1;
      this.moveTo(f, cmd.x, cmd.z, cmd.facing, cmd.attackMove ? Order.AttackMove : Order.Move);
    });
    q.on('attack', (cmd) => {
      if (!this.isActiveUnit(cmd.target) || world.c.team[cmd.target] === cmd.team) return;
      const f = this.gather(cmd.team, cmd.units, null);
      if (!f) return;
      for (const id of f.members) world.c.target[id] = cmd.target;
      f.targetUnit = cmd.target;
      this.moveTo(f, world.c.x[cmd.target], world.c.z[cmd.target], null, Order.Attack);
    });
    q.on('hold', (cmd) => {
      const f = this.gather(cmd.team, cmd.units, null);
      if (!f) return;
      f.moving = false;
      f.destX = f.anchorX;
      f.destZ = f.anchorZ;
      this.setOrder(f, Order.Hold);
    });
    q.on('setFormation', (cmd) => {
      const f = this.gather(cmd.team, cmd.units, cmd.formation);
      if (!f) return;
      f.type = cmd.formation;
      f.columns = null;
      f.forceSolve = true;
    });
  }

  get(id: number): Formation | undefined {
    return this.formations.get(id);
  }

  all(): IterableIterator<Formation> {
    return this.formations.values();
  }

  get count(): number {
    return this.formations.size;
  }

  /** Formation type shared by all the given units, or null when they are split or loose. */
  typeOf(units: readonly number[]): FormationType | null {
    let type: FormationType | null = null;
    for (const id of units) {
      const f = this.formations.get(this.world.c.formation[id]);
      if (!f || (type && f.type !== type)) return null;
      type = f.type;
    }
    return type;
  }

  private isActiveUnit(id: number): boolean {
    return this.world.entities.has(id, Comp.Unit) && this.world.c.state[id] !== UnitState.Dying;
  }

  /** The formation made of exactly these units (reused), or a new one they leave their old ones for. */
  private gather(team: number, units: readonly number[], type: FormationType | null): Formation | null {
    const { c } = this.world;
    const ids = [...new Set(units)].filter((id) => this.isActiveUnit(id) && c.team[id] === team);
    if (!ids.length) return null;
    const current = this.formations.get(c.formation[ids[0]]);
    if (current && current.size === ids.length && ids.every((id) => c.formation[id] === current.id)) return current;

    // Most common previous type, for a regrouping keeping the player's choice.
    const votes = new Map<FormationType, number>();
    for (const id of ids) {
      const old = this.formations.get(c.formation[id]);
      if (old) votes.set(old.type, (votes.get(old.type) ?? 0) + 1);
    }
    const inherited = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    const f = new Formation(this.nextId++, team, type ?? inherited ?? 'LINE', Order.Defend);
    let sx = 0;
    let sz = 0;
    let fx = 0;
    let fz = 0;
    for (const id of ids) {
      this.detach(id);
      c.formation[id] = f.id;
      sx += c.x[id];
      sz += c.z[id];
      fx += Math.sin(c.rot[id]);
      fz += Math.cos(c.rot[id]);
    }
    f.members = ids;
    f.initialSize = ids.length;
    f.anchorX = f.destX = sx / ids.length;
    f.anchorZ = f.destZ = sz / ids.length;
    f.facing = Math.atan2(fx, fz);
    f.flow = this.world.nav.cellAt(f.anchorX, f.anchorZ);
    this.formations.set(f.id, f);
    return f;
  }

  private detach(id: number): void {
    const old = this.formations.get(this.world.c.formation[id]);
    if (!old) return;
    this.keepMembers(old, (m) => m !== id);
    this.world.c.formation[id] = NO_ENTITY;
    if (!old.members.length) this.formations.delete(old.id);
  }

  /** Filters the members, keeping `slotOf` aligned (the lost members leave holes in the ranks). */
  private keepMembers(f: Formation, keep: (id: number) => boolean): void {
    const members: number[] = [];
    const slots: number[] = [];
    for (let k = 0; k < f.members.length; k++) {
      if (!keep(f.members[k])) continue;
      members.push(f.members[k]);
      if (k < f.slotOf.length) slots.push(f.slotOf[k]);
    }
    if (members.length === f.members.length) return;
    f.members = members;
    f.slotOf = Int32Array.from(slots);
    // The first loss starts the delay before the ranks close up; later losses do not extend it.
    if (!f.dirty) f.resolveCooldown = Math.max(f.resolveCooldown, RESOLVE_COOLDOWN);
    f.dirty = true;
  }

  private moveTo(f: Formation, x: number, z: number, facing: number | null, order: OrderId, redeal = true): void {
    const { nav, paths } = this.world;
    const margin = 3;
    let dx = Math.min(nav.width - margin, Math.max(margin, x));
    let dz = Math.min(nav.height - margin, Math.max(margin, z));
    if (nav.isBlockedAt(dx, dz)) {
      const cell = nav.nearestWalkable(nav.cellAt(dx, dz));
      dx = nav.centerX(cell);
      dz = nav.centerZ(cell);
    }
    const distance = Math.hypot(dx - f.anchorX, dz - f.anchorZ);
    f.facing = facing ?? (distance > 3 ? Math.atan2(dx - f.anchorX, dz - f.anchorZ) : f.facing);
    f.destX = dx;
    f.destZ = dz;
    f.moving = distance > 0.3;
    f.flow = nav.cellAt(dx, dz);
    paths.fieldForCell(f.flow);
    if (redeal) f.forceSolve = true;
    this.setOrder(f, order);
  }

  private setOrder(f: Formation, order: OrderId): void {
    const { c } = this.world;
    f.order = order;
    for (const id of f.members) {
      c.order[id] = order;
      c.flow[id] = f.flow;
      if (order === Order.Move || order === Order.Hold) c.target[id] = NO_ENTITY;
    }
  }

  /** Deals the slots: layout for the current strength, then crossing-free assignment. */
  private solve(f: Formation): void {
    const { c } = this.world;
    const n = f.members.length;
    const layout = computeSlots(f.type, n, f.spacing, f.columns);
    const xs = new Float32Array(n);
    const zs = new Float32Array(n);
    const priority = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      const id = f.members[k];
      xs[k] = c.x[id];
      zs[k] = c.z[id];
      priority[k] = ROLE_PRIORITY[UNIT_DEFS[c.unitType[id]].role];
    }
    const unitForSlot = assignSlots(layout, f.type, xs, zs, priority, f.facing);
    f.slotOf = new Int32Array(n);
    for (let s = 0; s < n; s++) f.slotOf[unitForSlot[s]] = s;
    f.layout = layout;
    f.dirty = false;
    f.forceSolve = false;
    f.resolveCooldown = RESOLVE_COOLDOWN;
    for (let k = 0; k < n; k++) c.slot[f.members[k]] = f.slotOf[k];
  }

  update(world: World, dt: number): void {
    const { c, nav, paths } = world;
    for (const f of [...this.formations.values()]) {
      for (const id of f.members) if (!this.isActiveUnit(id)) c.formation[id] = NO_ENTITY;
      this.keepMembers(f, (id) => this.isActiveUnit(id));
      if (!f.members.length) {
        this.formations.delete(f.id);
        continue;
      }
      f.resolveCooldown -= dt;
      const incomplete = !f.layout || f.slotOf.length !== f.members.length;
      if (incomplete || f.forceSolve || (f.dirty && f.resolveCooldown <= 0)) this.solve(f);
      if (f.order === Order.Attack) this.chase(f);

      if (f.moving) this.advance(f, dt, nav, paths);

      const sin = Math.sin(f.facing);
      const cos = Math.cos(f.facing);
      const layout = f.layout!;
      for (let k = 0; k < f.members.length; k++) {
        const id = f.members[k];
        const s = f.slotOf[k];
        const lateral = layout.lateral[s];
        const forward = layout.forward[s];
        c.slotX[id] = f.anchorX + lateral * cos + forward * sin;
        c.slotZ[id] = f.anchorZ - lateral * sin + forward * cos;
        c.slotRot[id] = f.facing + layout.facing[s];
      }
      if (!f.moving && f.order === Order.Move) this.setOrder(f, Order.Defend);
    }
  }

  /** An Attack order follows its target; once the target is dead the formation attack-moves to its last spot. */
  private chase(f: Formation): void {
    const { c } = this.world;
    const t = f.targetUnit;
    if (t < 0 || !this.isActiveUnit(t)) {
      f.targetUnit = -1;
      this.setOrder(f, Order.AttackMove);
      return;
    }
    // Re-route only when the target has moved a few metres (one flow field per new cell at most).
    if (Math.hypot(c.x[t] - f.destX, c.z[t] - f.destZ) > 4) this.moveTo(f, c.x[t], c.z[t], null, Order.Attack, false);
  }

  /** Moves the anchor along the flow field, slowing down while members lag behind their slots. */
  private advance(f: Formation, dt: number, nav: World['nav'], paths: World['paths']): void {
    const { c } = this.world;
    if (f.order !== Order.Move) {
      // An attacking formation stops where its soldiers are fighting instead of marching through.
      let engaged = 0;
      for (const id of f.members) if (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking) engaged++;
      if (engaged > f.members.length * 0.25) return;
    }
    const toX = f.destX - f.anchorX;
    const toZ = f.destZ - f.anchorZ;
    const distance = Math.hypot(toX, toZ);
    if (distance < 0.3) {
      f.anchorX = f.destX;
      f.anchorZ = f.destZ;
      f.moving = false;
      return;
    }
    let ux = toX / distance;
    let uz = toZ / distance;
    if (!nav.lineOfSight(f.anchorX, f.anchorZ, f.destX, f.destZ) && paths.fieldForCell(f.flow).direction(f.anchorX, f.anchorZ, this.dir)) {
      ux = this.dir.x;
      uz = this.dir.z;
    }
    let slowest = Infinity;
    let lag = 0;
    let counted = 0;
    for (const id of f.members) {
      slowest = Math.min(slowest, c.maxSpeed[id]);
      if (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking) continue;
      lag += Math.hypot(c.slotX[id] - c.x[id], c.slotZ[id] - c.z[id]);
      counted++;
    }
    const meanLag = counted ? lag / counted : 0;
    const cohesion = Math.min(1, Math.max(0.2, 1.3 - meanLag / (f.spacing * 3)));
    const speed = slowest * 0.9 * nav.speedAt(f.anchorX, f.anchorZ) * cohesion;
    const step = Math.min(distance, speed * dt);
    f.anchorX += ux * step;
    f.anchorZ += uz * step;
  }
}

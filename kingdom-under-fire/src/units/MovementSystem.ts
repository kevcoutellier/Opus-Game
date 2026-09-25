import type { System } from '../core/Simulation';
import type { World } from '../core/World';
import { Comp, MoraleState, UnitState } from '../entities/Components';

const NEIGHBOUR_RADIUS = 1.8;
/** Steering responsiveness (1/s): lower = heavier, more inertia. */
const ACCELERATION = 6.5;
const TURN_RATE = 5.5;
const SEPARATION = 5.5;
const ALIGNMENT = 0.2;
const COHESION = 0.06;
const PROBE_DISTANCE = 1.3;
const AVOID_ANGLES = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, (3 * Math.PI) / 4, (-3 * Math.PI) / 4];

/**
 * Local steering of every unit towards its goal (formation slot, enemy, or flight). Forces: goal attraction
 * (flow field when the goal is out of sight), separation (mass-weighted pushing, units react to
 * collisions), alignment and cohesion with formation mates, obstacle probes. Neighbours come from the
 * spatial grid, never from a scan of every unit.
 */
export class MovementSystem implements System {
  readonly name = 'movement';
  private readonly neighbours = new Int32Array(64);
  private readonly dir = { x: 0, z: 0 };

  update(world: World, dt: number): void {
    const { entities, c, nav, spatial, paths } = world;
    const blend = Math.min(1, ACCELERATION * dt);
    for (let i = 0; i < entities.count; i++) {
      const id = entities.dense[i];
      if ((entities.mask[id] & (Comp.Movement | Comp.Unit)) !== (Comp.Movement | Comp.Unit)) continue;
      if (c.state[id] === UnitState.Dying) continue;
      const x = c.x[id];
      const z = c.z[id];
      const routing = c.moraleState[id] === MoraleState.Routing;

      // 1. Goal: the enemy being engaged, the formation slot, or (routing) the flight point in slot*.
      const target = c.target[id];
      const engaging = !routing && target >= 0 && (c.state[id] === UnitState.Engaging || c.state[id] === UnitState.Attacking);
      let gx: number;
      let gz: number;
      let stop: number;
      if (engaging) {
        gx = c.x[target];
        gz = c.z[target];
        stop = c.radius[id] + c.radius[target] + c.reach[id] * 0.85;
      } else {
        gx = c.slotX[id];
        gz = c.slotZ[id];
        stop = routing ? 1 : 0.12;
      }
      const dx = gx - x;
      const dz = gz - z;
      const dist = Math.hypot(dx, dz);

      let wantX = 0;
      let wantZ = 0;
      let wantSpeed = 0;
      if (dist > stop) {
        let ux = dx / dist;
        let uz = dz / dist;
        const flow = c.flow[id];
        if (!engaging && dist > 2.5 && flow >= 0 && !nav.lineOfSight(x, z, gx, gz)) {
          if (paths.fieldForCell(flow).direction(x, z, this.dir)) {
            ux = this.dir.x;
            uz = this.dir.z;
          }
        }
        const arrive = Math.min(1, (dist - stop) / 1.6 + 0.12);
        // Stragglers jog to catch up with their formation; routers run.
        const hurry = routing ? 1.25 : dist > 5 ? 1.2 : 1;
        wantSpeed = c.maxSpeed[id] * nav.speedAt(x, z) * arrive * hurry;
        wantX = ux * wantSpeed;
        wantZ = uz * wantSpeed;
      }

      // 2. Neighbours: separation with everyone, alignment and cohesion with formation mates.
      const n = spatial.query(x, z, NEIGHBOUR_RADIUS, c.x, c.z, this.neighbours);
      let sepX = 0;
      let sepZ = 0;
      let alignX = 0;
      let alignZ = 0;
      let cohX = 0;
      let cohZ = 0;
      let mates = 0;
      const formation = c.formation[id];
      for (let k = 0; k < n; k++) {
        const j = this.neighbours[k];
        if (j === id) continue;
        let ox = x - c.x[j];
        let oz = z - c.z[j];
        let d = Math.hypot(ox, oz);
        if (d < 1e-4) {
          // Exactly stacked: split them deterministically.
          ox = id < j ? 1 : -1;
          oz = 0;
          d = 1;
        }
        const minD = c.radius[id] + c.radius[j] + 0.1;
        if (d < minD) {
          const push = (minD - d) / minD;
          const share = (2 * c.mass[j]) / (c.mass[id] + c.mass[j]);
          sepX += (ox / d) * push * share;
          sepZ += (oz / d) * push * share;
        }
        if (formation >= 0 && c.formation[j] === formation) {
          alignX += c.vx[j];
          alignZ += c.vz[j];
          cohX += c.x[j];
          cohZ += c.z[j];
          mates++;
        }
      }
      let tx = wantX + sepX * SEPARATION;
      let tz = wantZ + sepZ * SEPARATION;
      if (mates > 0 && wantSpeed > 0.3 && !engaging) {
        tx += (alignX / mates - c.vx[id]) * ALIGNMENT + (cohX / mates - x) * COHESION;
        tz += (alignZ / mates - c.vz[id]) * ALIGNMENT + (cohZ / mates - z) * COHESION;
      }

      // 3. Obstacle avoidance: probe ahead, turn towards the first free direction.
      const speed = Math.hypot(tx, tz);
      if (speed > 0.1 && nav.isBlockedAt(x + (tx / speed) * PROBE_DISTANCE, z + (tz / speed) * PROBE_DISTANCE)) {
        for (const angle of AVOID_ANGLES) {
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const rx = (tx * cos - tz * sin) / speed;
          const rz = (tx * sin + tz * cos) / speed;
          if (!nav.isBlockedAt(x + rx * PROBE_DISTANCE, z + rz * PROBE_DISTANCE)) {
            tx = rx * speed;
            tz = rz * speed;
            break;
          }
        }
      }

      // 4. Integrate with inertia, slide along obstacles.
      let vx = c.vx[id] + (tx - c.vx[id]) * blend;
      let vz = c.vz[id] + (tz - c.vz[id]) * blend;
      const maxV = c.maxSpeed[id] * 1.4;
      const v = Math.hypot(vx, vz);
      if (v > maxV) {
        vx *= maxV / v;
        vz *= maxV / v;
      }
      let nx = x + vx * dt;
      let nz = z + vz * dt;
      if (nav.isBlockedAt(nx, nz)) {
        if (!nav.isBlockedAt(nx, z)) {
          nz = z;
          vz = 0;
        } else if (!nav.isBlockedAt(x, nz)) {
          nx = x;
          vx = 0;
        } else {
          nx = x;
          nz = z;
          vx = vz = 0;
        }
      }
      c.x[id] = nx;
      c.z[id] = nz;
      c.vx[id] = vx;
      c.vz[id] = vz;

      // 5. Facing: the enemy in reach, else the direction of travel, else the formation front.
      const moving = Math.hypot(vx, vz) > 0.35;
      let facing = c.rot[id];
      if (engaging && dist < stop + 1.5) facing = Math.atan2(dx, dz);
      else if (moving) facing = Math.atan2(vx, vz);
      else if (!engaging && !routing) facing = c.slotRot[id];
      c.rot[id] = turnTowards(c.rot[id], facing, TURN_RATE * dt);

      if (!engaging && !routing) c.state[id] = moving ? UnitState.Moving : UnitState.Idle;
    }
  }
}

/** Rotates `from` towards `to` by at most `max` radians (shortest way), result in (-π, π]. */
export function turnTowards(from: number, to: number, max: number): number {
  let delta = to - from;
  delta -= Math.round(delta / (Math.PI * 2)) * Math.PI * 2;
  const step = Math.max(-max, Math.min(max, delta));
  let result = from + step;
  result -= Math.round(result / (Math.PI * 2)) * Math.PI * 2;
  return result;
}

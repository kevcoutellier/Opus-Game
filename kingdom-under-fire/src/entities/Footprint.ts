import type { Components } from './Components';

/**
 * Point of entity `t` closest to (x, z): its centre for a unit (a disc), the nearest point of its
 * footprint for a building (a rectangle). Soldiers aim at it, walk to it and measure their reach from it,
 * so a long barracks can be struck from any side.
 */
export function closestPoint(c: Components, t: number, x: number, z: number, out: { x: number; z: number }): void {
  const hw = c.halfW[t];
  if (hw <= 0) {
    out.x = c.x[t];
    out.z = c.z[t];
    return;
  }
  const hd = c.halfD[t];
  out.x = Math.min(c.x[t] + hw, Math.max(c.x[t] - hw, x));
  out.z = Math.min(c.z[t] + hd, Math.max(c.z[t] - hd, z));
}

/** Radius of `t` counted in contact distances: the disc of a unit, nothing for a footprint (already its edge). */
export function contactRadius(c: Components, t: number): number {
  return c.halfW[t] > 0 ? 0 : c.radius[t];
}

/** Distance from (x, z) to the edge of `t` (negative inside a unit's disc, 0 inside a footprint). */
export function distanceToEdge(c: Components, t: number, x: number, z: number, out: { x: number; z: number }): number {
  closestPoint(c, t, x, z, out);
  return Math.hypot(out.x - x, out.z - z) - contactRadius(c, t);
}

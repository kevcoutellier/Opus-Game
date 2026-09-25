// Static galaxy: system positions, hyperlanes and pathfinding. Built once at module load.
import { SYSTEMS, REGIONS, TRADE_ROUTES } from '../data/systems.js';

const COLS = 'ABCDEFGHIJKLMNOPQRSTUVW';
const MIN_DIST = 64;
const MAX_LANE = 330;
const MAJOR_SPEED = 1.6;

function initialPosition(sys) {
  const col = COLS.indexOf(sys.grid[0]);
  const row = Number(sys.grid.slice(1));
  const angle = Math.atan2(row - 10.5, col - 11.5);
  const [r0, r1] = REGIONS[sys.region].band;
  const r = r0 + sys.frac * (r1 - r0);
  return { x: Math.cos(angle) * r, y: Math.sin(angle) * r };
}

/** Pushes overlapping systems apart (deterministic). */
function relax(nodes) {
  for (let iter = 0; iter < 160; iter++) {
    let moved = false;
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= MIN_DIST) continue;
        if (d < 0.01) {
          // Same spot: separate along a direction derived from the indices.
          const ang = (i * 37 + j * 11) % 360 * (Math.PI / 180);
          dx = Math.cos(ang);
          dy = Math.sin(ang);
          d = 1;
        }
        const push = (MIN_DIST - d) / 2 + 0.5;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
        moved = true;
      }
    }
    if (!moved) break;
  }
}

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function buildLanes(nodes) {
  const n = nodes.length;
  const edges = new Map();
  const key = (i, j) => (i < j ? `${i}|${j}` : `${j}|${i}`);
  // Gabriel graph: no third system inside the circle whose diameter is the lane.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = nodes[i];
      const b = nodes[j];
      const d = dist(a, b);
      if (d > MAX_LANE) continue;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const r2 = (d / 2) ** 2;
      let ok = true;
      for (let k = 0; k < n && ok; k++) {
        if (k === i || k === j) continue;
        const c = nodes[k];
        if ((c.x - mx) ** 2 + (c.y - my) ** 2 < r2) ok = false;
        // Drop lanes that have an almost straight detour through a third system.
        else if (dist(a, c) < d && dist(c, b) < d && dist(a, c) + dist(c, b) < d * 1.12) ok = false;
      }
      if (ok) edges.set(key(i, j), { a: i, b: j, len: d });
    }
  }
  // Minimum spanning tree edges guarantee that the network is connected (Unknown Regions...).
  const inTree = new Array(n).fill(false);
  const best = new Array(n).fill(Infinity);
  const from = new Array(n).fill(-1);
  best[0] = 0;
  for (let step = 0; step < n; step++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!inTree[i] && (u === -1 || best[i] < best[u])) u = i;
    inTree[u] = true;
    if (from[u] >= 0 && !edges.has(key(u, from[u]))) edges.set(key(u, from[u]), { a: from[u], b: u, len: dist(nodes[u], nodes[from[u]]) });
    for (let v = 0; v < n; v++) {
      const d = dist(nodes[u], nodes[v]);
      if (!inTree[v] && d < best[v]) {
        best[v] = d;
        from[v] = u;
      }
    }
  }
  return [...edges.values()];
}

function build() {
  const nodes = SYSTEMS.map((s) => ({ ...s, ...initialPosition(s) }));
  relax(nodes);
  for (const node of nodes) {
    node.x = Math.round(node.x);
    node.y = Math.round(node.y);
  }
  const rawLanes = buildLanes(nodes);
  const byId = Object.fromEntries(nodes.map((s) => [s.id, s]));
  const lanes = rawLanes.map((e) => ({ a: nodes[e.a].id, b: nodes[e.b].id, len: Math.round(e.len), major: false, route: null }));
  const adj = Object.fromEntries(nodes.map((s) => [s.id, []]));
  for (const lane of lanes) {
    adj[lane.a].push({ to: lane.b, lane });
    adj[lane.b].push({ to: lane.a, lane });
  }
  const galaxy = { systems: nodes, byId, lanes, adj };
  // Trade routes follow the shortest path between their waypoints.
  for (const route of TRADE_ROUTES) {
    for (let i = 0; i < route.waypoints.length - 1; i++) {
      const path = shortestPath(galaxy, route.waypoints[i], route.waypoints[i + 1], () => true, true);
      for (let k = 0; path && k < path.length - 1; k++) {
        const lane = laneBetween(galaxy, path[k], path[k + 1]);
        lane.major = true;
        lane.route = lane.route || route.name;
      }
    }
  }
  return galaxy;
}

export function laneBetween(galaxy, a, b) {
  return galaxy.adj[a].find((e) => e.to === b)?.lane;
}

/** Travel cost of a lane in "distance units" (major lanes are faster). */
export function laneCost(lane) {
  return lane.major ? lane.len / MAJOR_SPEED : lane.len;
}

export { MAJOR_SPEED };

/**
 * Dijkstra between two systems. `canEnter(id)` filters the systems that may be crossed (the destination too).
 * Returns the list of system ids including both ends, or null.
 */
export function shortestPath(galaxy, from, to, canEnter, ignoreMajor = false) {
  if (from === to) return [from];
  const distTo = { [from]: 0 };
  const prev = {};
  const open = new Set([from]);
  const done = new Set();
  while (open.size) {
    let u = null;
    for (const id of open) if (u === null || distTo[id] < distTo[u]) u = id;
    open.delete(u);
    if (u === to) break;
    done.add(u);
    for (const { to: v, lane } of galaxy.adj[u]) {
      if (done.has(v) || !canEnter(v)) continue;
      const d = distTo[u] + (ignoreMajor ? lane.len : laneCost(lane));
      if (distTo[v] === undefined || d < distTo[v]) {
        distTo[v] = d;
        prev[v] = u;
        open.add(v);
      }
    }
  }
  if (distTo[to] === undefined) return null;
  const path = [to];
  while (path[0] !== from) path.unshift(prev[path[0]]);
  return path;
}

/** Hop distances from a system (BFS), limited to `maxHops`. */
export function hopsFrom(galaxy, from, maxHops = 99, canEnter = () => true) {
  const hops = { [from]: 0 };
  let frontier = [from];
  for (let h = 1; h <= maxHops && frontier.length; h++) {
    const next = [];
    for (const u of frontier) {
      for (const { to } of galaxy.adj[u]) {
        if (hops[to] !== undefined || !canEnter(to)) continue;
        hops[to] = h;
        next.push(to);
      }
    }
    frontier = next;
  }
  return hops;
}

export const GALAXY = build();

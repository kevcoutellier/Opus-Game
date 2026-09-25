// Seeded PRNG (mulberry32). The state lives in `state.rng` so a saved game replays identically.

export function nextRandom(state) {
  state.rng = (state.rng + 0x6d2b79f5) >>> 0;
  let t = state.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Integer in [0, n). */
export function randInt(state, n) {
  return Math.floor(nextRandom(state) * n);
}

/** True with probability p (0..1). */
export function chance(state, p) {
  return nextRandom(state) < p;
}

export function pick(state, list) {
  return list[randInt(state, list.length)];
}

/** Picks a key of `weights` with probability proportional to its value. */
export function weighted(state, weights) {
  const entries = Object.entries(weights).filter(([, w]) => w > 0);
  let total = entries.reduce((sum, [, w]) => sum + w, 0);
  let roll = nextRandom(state) * total;
  for (const [key, w] of entries) {
    roll -= w;
    if (roll <= 0) return key;
  }
  return entries.length ? entries[entries.length - 1][0] : null;
}

/** Random factor in [1 - spread, 1 + spread]. */
export function jitter(state, spread) {
  return 1 - spread + nextRandom(state) * spread * 2;
}

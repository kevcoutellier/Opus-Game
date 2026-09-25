// Small seeded PRNG (mulberry32) so battles are reproducible in tests.
export class Rng {
  constructor(seed = Date.now()) {
    this.state = seed >>> 0;
  }

  next() {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max) — or [0, min) when called with one argument. */
  int(min, max) {
    if (max === undefined) [min, max] = [0, min];
    return min + Math.floor(this.next() * (max - min));
  }

  /** True with probability num/den. */
  chance(num, den = 100) {
    return this.int(den) < num;
  }

  pick(list) {
    return list[this.int(list.length)];
  }

  shuffle(list) {
    const out = [...list];
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}

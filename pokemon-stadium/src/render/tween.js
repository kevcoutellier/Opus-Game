// Minimal promise-based tweening driven by the render loop.

export const ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => t * (2 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  outCubic: (t) => 1 - (1 - t) ** 3,
  inCubic: (t) => t ** 3,
  inOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  outBack: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
  },
  outElastic: (t) => (t === 0 || t === 1 ? t : 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

const active = new Set();
let speed = 1;

export function setTweenSpeed(value) {
  speed = value;
}

export function tweenSpeed() {
  return speed;
}

/**
 * Calls onUpdate(k) with k going 0 -> 1 over `duration` seconds.
 * Resolves when done (or immediately if duration is 0).
 */
export function tween(duration, onUpdate, easing = ease.inOutQuad) {
  return new Promise((resolve) => {
    if (duration <= 0) {
      onUpdate(1);
      resolve();
      return;
    }
    active.add({ t: 0, duration, onUpdate, easing, resolve });
  });
}

export function wait(seconds) {
  return tween(seconds, () => {});
}

export function updateTweens(dt) {
  for (const tw of active) {
    tw.t += dt * speed;
    const k = Math.min(1, tw.t / tw.duration);
    tw.onUpdate(tw.easing(k));
    if (k >= 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}

export const lerp = (a, b, k) => a + (b - a) * k;

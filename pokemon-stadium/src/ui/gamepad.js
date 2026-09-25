import { toast } from './dom.js';

// Standard-mapping gamepads are turned into the keyboard events the screens
// already understand: D-pad/stick = arrows, A = Enter, B = Escape,
// X = S (switch Pokémon), Y = R (random rentals), Start = Enter.
const BUTTON_KEYS = { 0: 'Enter', 1: 'Escape', 2: 's', 3: 'r', 9: 'Enter', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' };
const REPEAT_DELAY = 0.4;
const REPEAT_RATE = 0.12;

function press(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

export function enableGamepad() {
  const held = new Map();
  let last = performance.now();

  window.addEventListener('gamepadconnected', (e) => toast(`Manette connectée : ${e.gamepad.id.split('(')[0].trim()}`));

  const poll = (now) => {
    const dt = (now - last) / 1000;
    last = now;
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const down = new Set();
    for (const pad of pads) {
      pad.buttons.forEach((b, i) => {
        if (b.pressed && BUTTON_KEYS[i]) down.add(BUTTON_KEYS[i]);
      });
      const [x = 0, y = 0] = pad.axes;
      if (x < -0.5) down.add('ArrowLeft');
      if (x > 0.5) down.add('ArrowRight');
      if (y < -0.5) down.add('ArrowUp');
      if (y > 0.5) down.add('ArrowDown');
    }
    for (const key of down) {
      const t = held.get(key);
      if (t === undefined) {
        press(key);
        held.set(key, -REPEAT_DELAY);
      } else if (key.startsWith('Arrow')) {
        // auto-repeat for directions, like holding a key
        const next = t + dt;
        if (next >= REPEAT_RATE) {
          press(key);
          held.set(key, 0);
        } else held.set(key, next);
      }
    }
    for (const key of [...held.keys()]) if (!down.has(key)) held.delete(key);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}

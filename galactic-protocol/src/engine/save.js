// Save games in localStorage (the state is plain JSON).
import { recomputeMods } from './research.js';
import { refreshEconomy } from './economy.js';

const PREFIX = 'galactic-protocol:save:';
export const SLOTS = ['auto', '1', '2', '3'];

export function serialize(state) {
  return JSON.stringify(state, (key, value) => (key === 'fx' ? undefined : value));
}

export function deserialize(json) {
  const state = JSON.parse(json);
  state.fx = [];
  for (const f of Object.values(state.factions)) recomputeMods(f);
  refreshEconomy(state);
  return state;
}

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(state, slot) {
  const store = storage();
  if (!store) return false;
  try {
    const meta = { slot, day: state.day, scenario: state.scenario, player: state.player, name: state.factions[state.player].name, savedAt: Date.now(), startYear: state.startYear };
    store.setItem(PREFIX + slot, serialize(state));
    store.setItem(`${PREFIX + slot}:meta`, JSON.stringify(meta));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(slot) {
  const store = storage();
  const json = store?.getItem(PREFIX + slot);
  return json ? deserialize(json) : null;
}

export function listSaves() {
  const store = storage();
  if (!store) return [];
  const out = [];
  for (const slot of SLOTS) {
    try {
      const meta = store.getItem(`${PREFIX + slot}:meta`);
      if (meta) out.push(JSON.parse(meta));
    } catch {
      // Ignore corrupted entries.
    }
  }
  return out;
}

export function deleteSave(slot) {
  const store = storage();
  store?.removeItem(PREFIX + slot);
  store?.removeItem(`${PREFIX + slot}:meta`);
}

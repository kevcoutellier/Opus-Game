// Creation and bookkeeping of army/fleet stacks.
import { UNIT_TYPES } from '../data/units.js';
import { maxHp, stacksAt } from './query.js';

const FLEET_NAMES = ['Flotte', 'Escadre', 'Groupe', 'Armada', 'Division', 'Force'];
const GREEK = ['Aurek', 'Besh', 'Cresh', 'Dorn', 'Esk', 'Forn', 'Grek', 'Herf', 'Isk', 'Jenth', 'Krill', 'Leth', 'Mern', 'Nern', 'Osk', 'Peth', 'Qek', 'Resh', 'Senth', 'Trill', 'Usk', 'Vev', 'Wesk', 'Xesh', 'Yirt', 'Zerek'];

export function newId(state, prefix) {
  state.nextId = (state.nextId || 1) + 1;
  return `${prefix}${state.nextId}`;
}

function stackName(state, owner) {
  const f = state.factions[owner];
  f.stackCounter = (f.stackCounter || 0) + 1;
  const n = f.stackCounter;
  return `${FLEET_NAMES[n % FLEET_NAMES.length]} ${GREEK[n % GREEK.length]}${n > GREEK.length ? ` ${Math.ceil(n / GREEK.length)}` : ''}`;
}

export function createStack(state, owner, sys, units = [], name = null) {
  const id = newId(state, 's');
  const stack = { id, owner, sys, name: name || stackName(state, owner), units, path: [], move: null, dest: null };
  state.stacks[id] = stack;
  return stack;
}

export function makeUnit(state, owner, type, xp = 0) {
  return { t: type, hp: maxHp(state, owner, type), xp };
}

/** Adds freshly built units to an idle stack of the owner in the system, or creates one. */
export function addUnits(state, owner, sys, type, count = 1, xp = 0) {
  let stack = stacksAt(state, sys).find((st) => st.owner === owner && !st.path.length && !st.station);
  if (UNIT_TYPES[type].cat === 'station') stack = null;
  if (!stack) stack = createStack(state, owner, sys);
  for (let i = 0; i < count; i++) stack.units.push(makeUnit(state, owner, type, xp));
  return stack;
}

export function removeStack(state, id) {
  delete state.stacks[id];
  for (const sw of state.superweapons) if (sw.stackId === id) sw.stackId = null;
}

/** Drops destroyed units and empty stacks. */
export function cleanStacks(state) {
  for (const id of Object.keys(state.stacks)) {
    const st = state.stacks[id];
    st.units = st.units.filter((u) => u.hp > 0);
    if (!st.units.length) removeStack(state, id);
  }
}

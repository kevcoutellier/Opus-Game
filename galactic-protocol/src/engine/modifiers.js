// Temporary national modifiers (decisions, events, Senate resolutions...).
// A modifier is { id, name, until, stability?, output?, manpower?, prodTime?, milCost?, growth?, income?, ... }.

export function addModifier(state, fid, modifier) {
  const f = state.factions[fid];
  if (!f) return;
  const { days, ...rest } = modifier;
  const entry = { ...rest, until: state.day + (days ?? 360) };
  const index = f.modifiers.findIndex((m) => m.id === entry.id);
  if (index >= 0) f.modifiers[index] = entry;
  else f.modifiers.push(entry);
}

export function hasModifier(state, fid, id) {
  return !!state.factions[fid]?.modifiers.some((m) => m.id === id && m.until > state.day);
}

export function modSum(state, fid, key) {
  const f = state.factions[fid];
  if (!f) return 0;
  let total = 0;
  for (const m of f.modifiers) if (m.until > state.day && m[key]) total += m[key];
  return total;
}

export function expireModifiers(state) {
  for (const f of Object.values(state.factions)) {
    if (f.modifiers.length) f.modifiers = f.modifiers.filter((m) => m.until > state.day);
  }
}

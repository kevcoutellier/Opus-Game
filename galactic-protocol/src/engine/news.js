// HoloNet news feed and transient visual effects for the renderer.

const MAX_NEWS = 300;

/**
 * Adds a news item. `faction`: main faction concerned; `visibleTo`: optional list of factions that learn about
 * it (default: everybody). `important` items are shown as toasts to the player.
 */
export function news(state, { text, kind = 'info', faction = null, sys = null, important = false, visibleTo = null }) {
  state.news.push({ day: state.day, text, kind, faction, sys, important, visibleTo });
  if (state.news.length > MAX_NEWS) state.news.splice(0, state.news.length - MAX_NEWS);
}

/** Visual effect consumed by the map renderer (not saved). */
export function fx(state, effect) {
  if (!state.fx) state.fx = [];
  state.fx.push(effect);
}

export function playerSees(state, item) {
  return !item.visibleTo || item.visibleTo.includes(state.player);
}

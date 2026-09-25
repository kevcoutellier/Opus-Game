import { getManifest, loadManifest } from './assetSources.js';
import { audio } from './audio/audio.js';
import { GalaxyMap } from './render/map.js';
import { initTooltips } from './ui/dom.js';
import { titleScreen } from './ui/title.js';
import { startGame } from './ui/game.js';
import { createGame } from './engine/setup.js';
import { SCENARIO_BY_ID } from './data/scenarios.js';

async function boot() {
  initTooltips();
  await loadManifest();
  audio.setManifest(getManifest());
  const map = new GalaxyMap(document.getElementById('map'));
  const app = { map, root: document.getElementById('ui'), game: null };
  app.showTitle = () => titleScreen(app);
  app.startGame = (state, options) => startGame(app, state, options);
  window.app = app;
  window.addEventListener('resize', () => map.resize());
  // Shortcut: #play/<scenario>/<faction> starts a game directly (skips the menus and the crawl).
  const [route, scenario, faction] = location.hash.slice(1).split('/');
  if (route === 'play' && SCENARIO_BY_ID[scenario]) {
    const fid = faction || SCENARIO_BY_ID[scenario].factions[0].id;
    startGame(app, createGame({ scenario, player: fid, seed: Date.now() >>> 0 }), { fresh: true });
    return;
  }
  titleScreen(app);
}

boot();

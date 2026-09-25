import { getManifest, loadManifest } from './assetSources.js';
import { audio } from './audio/audio.js';
import { GalaxyMap } from './render/map.js';
import { initTooltips } from './ui/dom.js';
import { titleScreen } from './ui/title.js';
import { startGame } from './ui/game.js';
import { createGame } from './engine/setup.js';
import { SCENARIO_BY_ID } from './data/scenarios.js';

const HOLO_KEY = 'galactic-protocol:holo';

function holoEnabled() {
  try {
    return localStorage.getItem(HOLO_KEY) !== 'off';
  } catch {
    return true;
  }
}

async function boot() {
  initTooltips();
  // Screen-wide hologram layer: scanlines, vignette and interference band between the map and the interface.
  document.body.append(Object.assign(document.createElement('div'), { id: 'holo-fx' }));
  await loadManifest();
  audio.setManifest(getManifest());
  const map = new GalaxyMap(document.getElementById('map'));
  const app = { map, root: document.getElementById('ui'), game: null };
  app.holo = holoEnabled();
  app.setHolo = (on) => {
    app.holo = on;
    map.fx = on;
    document.body.classList.toggle('no-holo', !on);
    try {
      localStorage.setItem(HOLO_KEY, on ? 'on' : 'off');
    } catch {
      // Storage unavailable.
    }
  };
  app.setHolo(app.holo);
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

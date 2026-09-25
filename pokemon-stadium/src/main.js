import data from './data/gen1.json';
import { Game } from './game.js';
import { loadManifest } from './render/assets.js';
import { titleScreen } from './ui/titleScreen.js';
import { dexScreen } from './ui/dexScreen.js';
import { battleScreen } from './ui/battleScreen.js';
import { randomTeam } from './game/teams.js';
import { freeRun } from './game/runs.js';
import { enableGamepad } from './ui/gamepad.js';

async function boot() {
  await loadManifest();
  const game = new Game({
    data,
    canvas: document.getElementById('scene'),
    root: document.getElementById('ui'),
  });
  window.game = game;
  enableGamepad();
  // Shortcuts: #dex/25 opens the Pokédex on a model, #battle[/6,25,150] starts a quick battle.
  const [route, arg] = location.hash.slice(1).split('/');
  if (route === 'dex') game.show(dexScreen, { num: Number(arg) || 1 });
  else if (route === 'battle') {
    game.run = freeRun(data, 'fixed50', 1);
    const picks = arg ? arg.split(',').map((n) => game.byNum.get(Number(n))) : randomTeam(data, { size: 3 });
    game.run.team = [...picks, ...randomTeam(data, { size: 3 })];
    const foe = game.run.rounds[0];
    game.show(battleScreen, {
      mine: picks.map((species) => ({ species, level: 50 })),
      foe: { ...foe, team: foe.team.slice(0, 3).map((species) => ({ species, level: 50 })) },
    });
  } else game.show(titleScreen);
}

boot();

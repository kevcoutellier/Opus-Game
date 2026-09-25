import { h } from './dom.js';
import { menuScreen } from './menuScreen.js';
import { assetStats } from '../render/assets.js';

const FEATURED = [6, 9, 3, 25, 150, 149, 94, 131, 143, 130, 65, 68, 59, 144, 145, 146, 151, 34, 76, 112];

export function titleScreen(game) {
  game.resetField();
  game.arena.setTheme('sunset');
  game.arena.setScoreboard({ title: 'BIENVENUE !', left: 'OPUS', right: 'STADIUM' });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 30, height: 9, speed: 0.05 });
  game.showcase.spin = 0.25;

  let i = Math.floor(Math.random() * FEATURED.length);
  const next = async () => {
    const species = game.byNum.get(FEATURED[i++ % FEATURED.length]);
    const actor = await game.showcase.show(species, { orbit: false });
    if (actor) game.director.startOrbit({ radius: 10 + actor.height * 2.5, height: 2 + actor.height * 0.8, speed: 0.12 });
  };
  next();
  const timer = setInterval(next, 7000);

  const stats = assetStats();
  const local = stats.models ? `${stats.models} modèles 3D locaux` : 'modèles 3D chargés depuis GitHub';
  const el = h(
    'div.screen.title-screen',
    h(
      'div.logo',
      h('div.pokemon', 'POKéMON'),
      h('div.stadium', 'STADIUM'),
      h('div.edition', 'OPUS EDITION · GEN 1'),
    ),
    h('div.press-start', 'APPUIE SUR ENTRÉE'),
    h('div.title-credits', `Remake fan non officiel · ${local} · Pokémon © Nintendo / Game Freak`),
  );

  const go = () => {
    game.audio.ensure();
    game.audio.sfx('select');
    game.show(menuScreen);
  };
  const onKey = (e) => {
    if (e.key === 'Enter' || e.key === ' ') go();
  };
  el.addEventListener('click', go);
  window.addEventListener('keydown', onKey);
  return {
    el,
    destroy() {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      game.showcase.clear();
    },
  };
}

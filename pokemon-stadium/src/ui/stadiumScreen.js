import { h, keyboardNav, toast } from './dom.js';
import { menuScreen } from './menuScreen.js';
import { rentalScreen } from './rentalScreen.js';
import { CUPS, RANKS } from '../game/rules.js';
import { cupRun } from '../game/runs.js';
import { hasTrophy, rankUnlocked } from '../game/progress.js';

export function ballIcon(color, { size = 22, dim = false } = {}) {
  return h('span.ball-icon', {
    style: {
      width: `${size}px`,
      height: `${size}px`,
      background: `linear-gradient(180deg, ${color} 0 46%, #111 46% 54%, #f4f4f4 54% 100%)`,
      filter: dim ? 'grayscale(1) brightness(0.6)' : 'none',
    },
  });
}

export function stadiumScreen(game) {
  const { progress } = game;
  game.resetField();
  game.run = null;
  game.arena.setTheme('day');
  game.arena.setScoreboard({ title: 'STADIUM', left: 'COUPES', right: `${Object.keys(progress.trophies).length}/16` });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 42, height: 22, speed: 0.035 });

  const cards = CUPS.map((cup) =>
    h(
      'div.panel.cup-card',
      h('h3', cup.name),
      h('p.hint', cup.blurb),
      h(
        'div.rank-row',
        RANKS.map((rank, i) => {
          const unlocked = rankUnlocked(progress, cup.id, i);
          const won = hasTrophy(progress, cup.id, rank.id);
          return h(
            `button.rank-btn${won ? '.won' : ''}`,
            {
              'data-nav': true,
              disabled: !unlocked,
              title: unlocked ? `${cup.name} · ${rank.name}` : `Remporte d'abord la ${RANKS[i - 1].name}`,
              onclick: () => start(cup, i),
            },
            ballIcon(rank.color, { dim: !unlocked }),
            h('span', rank.name),
            won ? h('span.trophy-mark', '🏆') : !unlocked ? h('span.trophy-mark', '🔒') : null,
          );
        }),
      ),
    ),
  );

  function start(cup, rankIndex) {
    if (!rankUnlocked(progress, cup.id, rankIndex)) {
      toast('Remporte la difficulté précédente pour la débloquer');
      return;
    }
    game.audio.sfx('select');
    game.run = cupRun(game.data, cup, rankIndex);
    game.show(rentalScreen);
  }

  const el = h(
    'div.screen.hub-screen',
    h('div.hub-header', h('h2', 'Stadium'), h('p.hint', 'Remporte les 4 balls de chaque coupe : 6 dresseurs à battre à la suite avec tes 6 Pokémon de location.')),
    h('div.cup-grid', cards),
    h('div.hub-footer', h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Retour')),
  );
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

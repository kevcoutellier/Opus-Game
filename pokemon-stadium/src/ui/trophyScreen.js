import { h, icon, keyboardNav } from './dom.js';
import { menuScreen } from './menuScreen.js';
import { ballIcon } from './stadiumScreen.js';
import { CUPS, RANKS } from '../game/rules.js';
import { GYMS } from '../game/castle.js';
import { hasTrophy } from '../game/progress.js';

export function trophyScreen(game) {
  const { progress } = game;
  game.resetField();
  game.arena.setTheme('night');
  game.arena.setScoreboard({ title: 'SALLE DES TROPHÉES', left: game.settings.playerName, right: '★' });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 30, height: 12, speed: 0.05 });

  const trophies = h(
    'div.trophy-table',
    CUPS.map((cup) =>
      h(
        'div.trophy-line',
        h('b', cup.name),
        RANKS.map((rank) => {
          const won = hasTrophy(progress, cup.id, rank.id);
          return h(`span.trophy-slot${won ? '.won' : ''}`, { title: `${cup.name} · ${rank.name}` }, ballIcon(rank.color, { size: 18, dim: !won }), won ? '🏆' : '—');
        }),
      ),
    ),
  );

  const badges = h(
    'div.badge-row',
    GYMS.map((g) => h(`span.gym-badge${progress.badges[g.id] ? '' : '.missing'}`, { title: g.badge, style: { background: g.color } }, progress.badges[g.id] ? '★' : '')),
    h('span.hint', progress.elite ? '🏆 Conseil 4 vaincu' : 'Conseil 4 : pas encore vaincu'),
  );

  const fame = progress.hallOfFame.length
    ? progress.hallOfFame.map((e) =>
        h(
          'div.fame-entry',
          h('div', h('b', e.title), h('div.hint', `${new Date(e.date).toLocaleDateString('fr-FR')} · ${e.turns} tours au dernier combat`)),
          h('div.fame-team', e.team.map((m) => h('span.fame-mon', icon(m.num), h('small', `N.${m.level}`)))),
        ),
      )
    : [h('p.hint', 'Remporte une coupe ou une arène pour inscrire ton équipe au Panthéon.')];

  const el = h(
    'div.screen.hub-screen',
    h('div.hub-header', h('h2', 'Salle des Trophées')),
    h(
      'div.trophy-columns',
      h('div.panel.trophy-panel', h('h3', 'Coupes'), trophies, h('h3', 'Badges'), badges),
      h('div.panel.trophy-panel', h('h3', 'Panthéon'), h('div.fame-list', fame)),
    ),
    h('div.hub-footer', h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Retour')),
  );
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

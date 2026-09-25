import { h, icon, keyboardNav, typeBadge } from './dom.js';
import { battleScreen } from './battleScreen.js';
import { menuScreen } from './menuScreen.js';
import { LEVEL_MODES, pickThree } from '../game/teams.js';

export function pickScreen(game, { mine, foe, levelMode }) {
  const { data } = game;
  const level = LEVEL_MODES[levelMode];
  game.resetField();
  game.arena.setTheme(foe.theme);
  game.arena.setScoreboard({ title: foe.title.toUpperCase(), left: game.settings.playerName, right: foe.name.split(' ').pop().toUpperCase() });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 40, height: 20, speed: 0.03 });

  const picked = [];
  const go = h('button.btn', { 'data-nav': true, onclick: () => start() }, 'Au combat !');

  const card = (s, selectable) => {
    const c = h(
      `div.pick-card${selectable ? '.selectable' : ''}`,
      selectable ? { 'data-nav': true, onclick: () => toggle(s) } : {},
      icon(s.num),
      h(
        'div',
        h('div.pname', s.nameFr, ' ', h('span.hud-level', `N.${level.level(s)}`)),
        h('div', { style: { display: 'flex', gap: '4px', margin: '3px 0' } }, s.types.map((t) => typeBadge(data, t))),
        h('div.pmoves', s.rental.moves.map((m) => data.moves[m].nameFr).join(' · ')),
      ),
      selectable ? h('div.pick-order') : h('div'),
    );
    c.dataset.num = s.num;
    return c;
  };

  const mineCards = mine.map((s) => card(s, true));
  const el = h(
    'div.screen.pick-screen',
    h('div.pick-header', h('h2', `${foe.title} · ${foe.name}`), h('div.hint', 'Choisis 3 Pokémon dans l\'ordre d\'entrée en combat.')),
    h(
      'div.pick-columns',
      h('div.panel.pick-team.mine', h('h3', `Équipe de ${game.settings.playerName}`), mineCards),
      h('div.panel.pick-team.foe', h('h3', `Équipe de ${foe.name}`), foe.team.map((s) => card(s, false))),
    ),
    h('div.pick-footer', h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Abandonner'), go),
  );

  function toggle(s) {
    const i = picked.indexOf(s);
    if (i >= 0) {
      picked.splice(i, 1);
      game.audio.sfx('back');
    } else if (picked.length < 3) {
      picked.push(s);
      game.audio.sfx('select');
      game.audio.cry(s.num);
    }
    refresh();
  }

  function refresh() {
    mineCards.forEach((c) => {
      const i = picked.findIndex((s) => String(s.num) === c.dataset.num);
      c.classList.toggle('picked', i >= 0);
      c.querySelector('.pick-order').textContent = i >= 0 ? i + 1 : '';
    });
    go.disabled = picked.length !== 3;
    go.textContent = picked.length === 3 ? 'Au combat !' : `Au combat ! (${picked.length}/3)`;
  }

  function start() {
    if (picked.length !== 3) return;
    game.audio.sfx('select');
    game.show(battleScreen, {
      mine: [...picked],
      foe: { ...foe, team: pickThree(data, foe.team, mine) },
      levelMode,
    });
  }

  refresh();
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

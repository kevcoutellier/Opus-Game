import { h, icon, keyboardNav, trainerPortrait, typeBadge } from './dom.js';
import { battleScreen } from './battleScreen.js';
import { hubFor } from './hub.js';
import { pickThree } from '../game/teams.js';
import { defaultLevels, levelLabel, levelRange, levelsValid, levelTotal } from '../game/rules.js';
import { currentRound } from '../game/runs.js';
import { loadModel } from '../render/actor.js';

/** Stadium's "choose 3 of your 6", with the opponent's team revealed and level tuning. */
export function pickScreen(game) {
  const { data, run } = game;
  const { rules } = run;
  const foe = currentRound(run);
  const mine = run.team;
  game.resetField();
  game.arena.setTheme(foe.theme);
  game.arena.setScoreboard({ title: foe.title.toUpperCase(), left: game.settings.playerName, right: foe.name.split(' ').pop().toUpperCase() });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 40, height: 20, speed: 0.03 });
  // Warm the model cache so send-outs don't wait on the network.
  for (const s of [...mine, ...foe.team]) loadModel(s.num);

  const picked = [];
  let levels = [];
  const adjustable = !rules.balanced && rules.min !== rules.max;
  const go = h('button.btn', { 'data-nav': true, onclick: () => start() }, 'Au combat !');
  const levelPanel = h('div.level-panel');

  const card = (s, selectable) => {
    const c = h(
      `div.pick-card${selectable ? '.selectable' : ''}`,
      selectable ? { 'data-nav': true, onclick: () => toggle(s) } : {},
      icon(s.num),
      h(
        'div',
        h('div.pname', s.nameFr, ' ', h('span.hud-level', levelLabel(rules, s))),
        h('div', { style: { display: 'flex', gap: '4px', margin: '3px 0' } }, s.types.map((t) => typeBadge(data, t))),
        h('div.pmoves', s.rental.moves.map((m) => data.moves[m].nameFr).join(' · ')),
      ),
      selectable ? h('div.pick-order') : h('div'),
    );
    c.dataset.num = s.num;
    return c;
  };

  const mineCards = mine.map((s) => card(s, true));
  const progress = run.rounds.length > 1 ? h('div.bracket.small', run.rounds.map((r, i) => h(`div.round${i < run.round ? '.done' : i === run.round ? '.current' : ''}`, r.title))) : null;
  const el = h(
    'div.screen.pick-screen',
    h('div.pick-header', h('h2', `${foe.title} · ${foe.name}`), progress, h('div.hint', `${run.title} — choisis 3 Pokémon dans l'ordre d'entrée en combat.`)),
    h(
      'div.pick-columns',
      h('div.panel.pick-team.mine', h('h3', `Équipe de ${game.settings.playerName}`), mineCards, levelPanel),
      h('div.panel.pick-team.foe', h('div.foe-head', trainerPortrait(foe.pic), h('h3', `Équipe de ${foe.name}`)), foe.team.map((s) => card(s, false))),
    ),
    h('div.pick-footer', h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(hubFor(run)) }, 'Abandonner'), go),
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
    levels = defaultLevels(rules, picked);
    refresh();
  }

  function adjust(i, delta) {
    const [min, max] = levelRange(rules, picked[i]);
    const next = Math.max(min, Math.min(max, levels[i] + delta));
    if (next === levels[i]) return;
    levels[i] = next;
    game.audio.sfx('cursor');
    refresh();
  }

  function refresh() {
    mineCards.forEach((c) => {
      const i = picked.findIndex((s) => String(s.num) === c.dataset.num);
      c.classList.toggle('picked', i >= 0);
      c.querySelector('.pick-order').textContent = i >= 0 ? i + 1 : '';
    });
    const valid = picked.length === 3 && levelsValid(rules, picked, levels);
    if (adjustable && picked.length) {
      const total = levelTotal(levels);
      levelPanel.replaceChildren(
        h('div.level-head', h('b', 'Niveaux'), h(`span${rules.total != null && total > rules.total ? '.over' : ''}`, rules.total != null ? `Total ${total} / ${rules.total}` : `Total ${total}`)),
        ...picked.map((s, i) =>
          h(
            'div.level-row',
            h('span', `${i + 1}. ${s.nameFr}`),
            h('button.btn.small.ghost', { 'data-nav': true, onclick: () => adjust(i, -1) }, '−'),
            h('b.hud-level', `N.${levels[i]}`),
            h('button.btn.small.ghost', { 'data-nav': true, onclick: () => adjust(i, +1) }, '+'),
          ),
        ),
      );
    } else {
      levelPanel.replaceChildren();
    }
    go.disabled = !valid;
    go.textContent = picked.length === 3 ? 'Au combat !' : `Au combat ! (${picked.length}/3)`;
  }

  function start() {
    if (picked.length !== 3 || !levelsValid(rules, picked, levels)) return;
    game.audio.sfx('select');
    const foePicks = pickThree(data, foe.team, mine);
    const foeLevels = defaultLevels(rules, foePicks);
    game.show(battleScreen, {
      mine: picked.map((species, i) => ({ species, level: levels[i] })),
      foe: { ...foe, team: foePicks.map((species, i) => ({ species, level: foeLevels[i] })) },
    });
  }

  refresh();
  const nav = keyboardNav(el, { onBack: () => game.show(hubFor(run)) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

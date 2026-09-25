import { h, keyboardNav } from './dom.js';
import { menuScreen } from './menuScreen.js';
import { pickScreen } from './pickScreen.js';
import { rentalScreen } from './rentalScreen.js';
import { buildTeam } from '../game/teams.js';

export function resultScreen(game, { won, foe, turns, survivors, levelMode }) {
  const cup = game.cup;
  game.battleScene.setTrainersVisible(true);
  game.director.startOrbit({ radius: 30, height: 14, speed: 0.06 });
  game.arena.setCheer(won ? 0.6 : 0.15);

  let title = won ? 'Victoire !' : 'Défaite...';
  let subtitle = `${foe.name} · ${turns} tours · ${survivors} Pokémon debout`;
  const actions = [];
  let trophy = null;

  if (cup) {
    if (won) cup.round++;
    const finished = cup.round >= cup.rounds.length;
    if (won && finished) {
      title = 'Coupe Poké remportée !';
      subtitle = `Bravo ${game.settings.playerName}, tu es le champion du Stadium !`;
      trophy = h('div.trophy', '🏆');
      game.audio.say('Incroyable ! Nous avons un nouveau champion de la Coupe Poké !');
      actions.push(h('button.btn', { 'data-nav': true, onclick: () => { game.cup = null; game.show(menuScreen); } }, 'Menu principal'));
    } else if (won) {
      const next = cup.rounds[cup.round];
      subtitle += ` · Prochain adversaire : ${next.name}`;
      actions.push(
        h('button.btn', {
          'data-nav': true,
          onclick: () =>
            game.show(pickScreen, {
              mine: cup.team,
              foe: { name: next.name, ai: next.ai, team: buildTeam(game.data, { types: next.types, tier: next.tier }), theme: next.theme, title: next.title },
              levelMode,
            }),
        }, `${next.title} →`),
      );
    } else {
      const round = cup.rounds[cup.round];
      actions.push(
        h('button.btn', {
          'data-nav': true,
          onclick: () =>
            game.show(pickScreen, {
              mine: cup.team,
              foe: { name: round.name, ai: round.ai, team: buildTeam(game.data, { types: round.types, tier: round.tier }), theme: round.theme, title: round.title },
              levelMode,
            }),
        }, 'Réessayer'),
      );
      actions.push(h('button.btn.ghost', { 'data-nav': true, onclick: () => { game.cup = null; game.show(menuScreen); } }, 'Abandonner la coupe'));
    }
  } else {
    actions.push(h('button.btn', { 'data-nav': true, onclick: () => game.show(rentalScreen, { mode: 'free', banned: new Set(), levelMode }) }, 'Nouveau combat'));
    actions.push(h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Menu principal'));
  }

  const bracket = cup
    ? h(
        'div.bracket',
        cup.rounds.map((r, i) => h(`div.round${i < cup.round ? '.done' : i === cup.round ? '.current' : ''}`, `${r.title}`, h('br'), r.name)),
      )
    : null;

  const el = h(
    'div.screen.result-screen',
    h(`div.panel.result-card${won ? '' : '.lose'}`, trophy, h('h1', title), h('p', subtitle), bracket, h('div.result-actions', actions)),
  );
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

import { h, keyboardNav } from './dom.js';
import { pickScreen } from './pickScreen.js';
import { rentalScreen } from './rentalScreen.js';
import { trophyScreen } from './trophyScreen.js';
import { hubFor } from './hub.js';
import { currentRound, freeRun, runFinished } from '../game/runs.js';
import { recordVictory } from '../game/progress.js';

function rewardText(reward) {
  if (reward.type === 'cup') return 'Trophée remporté !';
  if (reward.type === 'badge') return `${reward.label} obtenu !`;
  return 'Le Conseil 4 est vaincu !';
}

export function resultScreen(game, { won, foe, turns, survivors, team }) {
  const { run } = game;
  game.battleScene.setTrainersVisible(true);
  game.director.startOrbit({ radius: 30, height: 14, speed: 0.06 });
  game.arena.setCheer(won ? 0.6 : 0.15);

  let title = won ? 'Victoire !' : 'Défaite...';
  let subtitle = `${foe.name} · ${turns} tours · ${survivors} Pokémon debout`;
  let trophy = null;
  const actions = [];
  const hub = hubFor(run);
  const button = (label, onclick, cls = 'button.btn') => h(cls, { 'data-nav': true, onclick }, label);

  if (won) run.round++;

  if (run.kind === 'free') {
    actions.push(button('Nouveau combat', () => {
      game.run = freeRun(game.data, game.settings.freeRules, game.settings.difficulty);
      game.show(rentalScreen);
    }));
    actions.push(button('Revanche', () => {
      if (won) run.round--;
      game.show(pickScreen);
    }, 'button.btn.blue'));
    actions.push(button('Menu principal', () => game.show(hub), 'button.btn.ghost'));
  } else if (won && runFinished(run)) {
    const isNew = recordVictory(game.progress, run.reward, { title: run.title, date: Date.now(), turns, team });
    game.saveProgress();
    title = rewardText(run.reward);
    subtitle = `Bravo ${game.settings.playerName} ! ${isNew ? 'Ton équipe entre au Panthéon.' : 'Ton équipe rejoint le Panthéon.'}`;
    trophy = h('div.trophy', run.reward.type === 'badge' ? '🎖️' : '🏆');
    game.audio.say(run.reward.type === 'elite' ? 'Incroyable ! Un nouveau Maître de la Ligue !' : `Et c'est gagné ! ${title}`);
    actions.push(button('Salle des Trophées', () => game.show(trophyScreen)));
    actions.push(button('Continuer', () => game.show(hub), 'button.btn.ghost'));
  } else if (won) {
    const next = currentRound(run);
    subtitle += ` · Prochain adversaire : ${next.name}`;
    actions.push(button(`${next.title} →`, () => game.show(pickScreen)));
    actions.push(button('Abandonner', () => game.show(hub), 'button.btn.ghost'));
  } else {
    actions.push(button('Réessayer', () => game.show(pickScreen)));
    actions.push(button('Abandonner', () => game.show(hub), 'button.btn.ghost'));
  }

  const bracket =
    run.rounds.length > 1
      ? h('div.bracket', run.rounds.map((r, i) => h(`div.round${i < run.round ? '.done' : i === run.round ? '.current' : ''}`, r.title, h('br'), r.name)))
      : null;

  const el = h(
    'div.screen.result-screen',
    h(`div.panel.result-card${won ? '' : '.lose'}`, trophy, h('h1', title), h('p', subtitle), h('p.hint', run.title), bracket, h('div.result-actions', actions)),
  );
  const nav = keyboardNav(el, { onBack: () => game.show(hub) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

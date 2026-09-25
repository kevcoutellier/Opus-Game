import { h, keyboardNav } from './dom.js';
import { rentalScreen } from './rentalScreen.js';
import { dexScreen } from './dexScreen.js';
import { titleScreen } from './titleScreen.js';
import { CUP_BANNED, CUP_ROUNDS, LEVEL_MODES } from '../game/teams.js';

function segmented(options, value, onChange) {
  const wrap = h('div.segmented');
  const render = (current) => {
    wrap.replaceChildren(
      ...options.map(([v, label]) =>
        h(
          'button.btn.small',
          {
            'data-nav': true,
            'aria-pressed': String(v === current),
            onclick: () => {
              onChange(v);
              render(v);
            },
          },
          label,
        ),
      ),
    );
  };
  render(value);
  return wrap;
}

export function menuScreen(game, { page = 'main' } = {}) {
  game.resetField();
  game.arena.setTheme('day');
  game.arena.setScoreboard({ title: 'POKéMON STADIUM', left: game.settings.playerName, right: '???' });
  game.audio.playTheme('menu');
  game.director.startOrbit({ radius: 36, height: 16, speed: 0.04 });

  const card = h('div.panel.menu-card');
  const el = h('div.screen.menu-screen', card);
  let nav;

  const pages = {
    main: () => [
      h('h2', 'Menu principal'),
      h('p.sub', `Dresseur : ${game.settings.playerName}`),
      h(
        'div.menu-list',
        h('button.btn', { 'data-nav': true, onclick: () => startCup() }, 'Coupe Poké', h('small', `${CUP_ROUNDS.length} dresseurs à battre · niveau 50 · Mew et Mewtwo interdits`)),
        h('button.btn', { 'data-nav': true, onclick: () => open('free') }, 'Combat Libre', h('small', "Choisis tes règles et affronte l'IA")),
        h('button.btn.blue', { 'data-nav': true, onclick: () => game.show(dexScreen) }, 'Pokédex 3D', h('small', 'Les 151 Pokémon en 3D, avec leur cri')),
        h('button.btn.blue', { 'data-nav': true, onclick: () => open('options') }, 'Options', h('small', 'Son, commentateur, vitesse des combats')),
        h('button.btn.ghost', { 'data-nav': true, onclick: () => game.show(titleScreen) }, 'Écran titre'),
      ),
    ],
    free: () => [
      h('h2', 'Combat Libre'),
      h('p.sub', 'Loue 6 Pokémon, puis choisis-en 3 face à ton adversaire.'),
      h('div.option-row', h('span', 'Niveaux'), segmented(Object.entries(LEVEL_MODES).map(([k, v]) => [k, v.label]), game.settings.levelMode, (v) => game.saveSettings({ levelMode: v }))),
      h('div.option-row', h('span', 'Adversaire'), segmented([[0, 'Débutant'], [1, 'Normal'], [2, 'Expert']], game.settings.difficulty, (v) => game.saveSettings({ difficulty: v }))),
      h(
        'div.menu-list',
        { style: { marginTop: '16px' } },
        h('button.btn', { 'data-nav': true, onclick: () => startFree() }, 'Choisir mes Pokémon'),
        h('button.btn.ghost', { 'data-nav': true, onclick: () => open('main') }, 'Retour'),
      ),
    ],
    options: () => [
      h('h2', 'Options'),
      h(
        'div.option-row',
        h('span', 'Nom du dresseur'),
        h('input.interactive', {
          value: game.settings.playerName,
          maxlength: 10,
          style: { font: 'inherit', padding: '6px 10px', borderRadius: '8px', border: '2px solid #fff4', background: '#0005', color: '#fff', width: '140px' },
          oninput: (e) => game.saveSettings({ playerName: e.target.value.toUpperCase() || 'ROUGE' }),
        }),
      ),
      h('div.option-row', h('span', 'Musique'), segmented([[true, 'Oui'], [false, 'Non']], game.settings.music, (v) => game.saveSettings({ music: v }))),
      h('div.option-row', h('span', 'Effets sonores et cris'), segmented([[true, 'Oui'], [false, 'Non']], game.settings.sfx, (v) => game.saveSettings({ sfx: v }))),
      h('div.option-row', h('span', 'Commentateur vocal'), segmented([[true, 'Oui'], [false, 'Non']], game.settings.voice, (v) => {
        game.saveSettings({ voice: v });
        if (v) game.audio.say('Bienvenue au Stadium !');
      })),
      h('div.option-row', h('span', 'Vitesse des combats'), segmented([[1, 'x1'], [1.5, 'x1.5'], [2, 'x2']], game.settings.speed, (v) => game.saveSettings({ speed: v }))),
      h('div.menu-list', { style: { marginTop: '16px' } }, h('button.btn.ghost', { 'data-nav': true, onclick: () => open('main') }, 'Retour')),
    ],
  };

  function open(name) {
    game.audio.sfx(name === 'main' ? 'back' : 'select');
    page = name;
    card.replaceChildren(...pages[name]());
    nav?.reset();
    nav?.focus(0);
  }

  function startCup() {
    game.audio.sfx('select');
    game.cup = { round: 0, rounds: CUP_ROUNDS, team: null };
    game.show(rentalScreen, { mode: 'cup', banned: CUP_BANNED, levelMode: 'fixed50' });
  }

  function startFree() {
    game.audio.sfx('select');
    game.cup = null;
    game.show(rentalScreen, { mode: 'free', banned: new Set(), levelMode: game.settings.levelMode });
  }

  card.replaceChildren(...pages[page]());
  nav = keyboardNav(el, { onBack: () => (page === 'main' ? game.show(titleScreen) : open('main')) });
  nav.focus(0);
  return { el, destroy: () => nav.destroy() };
}

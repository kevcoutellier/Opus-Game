import { h, icon, keyboardNav } from './dom.js';
import { speciesCard } from './speciesCard.js';
import { menuScreen } from './menuScreen.js';
import { hasStadiumModel } from '../render/assets.js';

export function dexScreen(game, { num = 1 } = {}) {
  const { data } = game;
  game.resetField();
  game.arena.setTheme('night');
  game.arena.setScoreboard({ title: 'POKéDEX 3D', left: '151', right: 'POKéMON' });
  game.audio.playTheme('menu');
  game.showcase.spin = 0.35;

  const items = new Map();
  const info = h('div');
  const animInfo = h('div.hint');
  const list = h('div.dex-items');
  let current = null;
  let timer;

  for (const s of data.species) {
    const item = h(
      'div.dex-item',
      { 'data-nav': true, onclick: () => select(s, true), onnavfocus: () => select(s) },
      h('span.num', `#${String(s.num).padStart(3, '0')}`),
      icon(s.num),
      h('span', s.nameFr),
    );
    items.set(s.num, item);
    list.append(item);
  }

  function select(s, cry = false, delay = 90) {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (current !== s) {
        current = s;
        for (const [n, item] of items) item.classList.toggle('current', n === s.num);
        items.get(s.num).scrollIntoView({ block: 'nearest' });
        info.replaceChildren(speciesCard(data, s, { moves: s.rental.moves }));
        animInfo.textContent = 'Chargement du modèle 3D…';
        history.replaceState(null, '', `#dex/${s.num}`);
        const actor = await game.showcase.show(s);
        if (actor && current === s) {
          const clips = Object.entries(actor.clips).filter(([, c]) => c).map(([k]) => k);
          const source = hasStadiumModel(s.num) ? 'modèle Stadium (local)' : 'modèle Pokemon-3D-api';
          animInfo.textContent = `${source} · ${clips.length ? `animations : ${clips.join(', ')}` : 'animation procédurale'}`;
        }
      }
      if (cry) game.audio.cry(s.num);
    }, delay);
  }

  const el = h(
    'div.screen.dex-screen',
    h('div.panel.dex-list', h('h2', { style: { margin: '0 0 8px', color: 'var(--yellow)' } }, 'Pokédex 3D'), list),
    h('div.spacer'),
    h(
      'div.panel.side-panel',
      info,
      animInfo,
      h(
        'div.bottom-actions',
        h('button.btn.small.blue', { onclick: () => current && game.audio.cry(current.num) }, 'Cri ♪'),
        h('button.btn.small.ghost', { 'data-nav': true, onclick: () => game.show(menuScreen) }, 'Retour'),
      ),
    ),
  );

  select(game.byNum.get(num) || data.species[0], false, 0);
  const nav = keyboardNav(el, { onBack: () => game.show(menuScreen) });
  return {
    el,
    destroy() {
      clearTimeout(timer);
      nav.destroy();
      game.showcase.clear();
      history.replaceState(null, '', location.pathname);
    },
  };
}

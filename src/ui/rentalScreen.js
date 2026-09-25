import { h, icon, keyboardNav, toast } from './dom.js';
import { speciesCard } from './speciesCard.js';
import { hubFor } from './hub.js';
import { pickScreen } from './pickScreen.js';
import { randomTeam } from '../game/teams.js';
import { allowed, levelLabel } from '../game/rules.js';

/** Pick the 6 rental Pokémon of the current run (cup, gym, free battle). */
export function rentalScreen(game) {
  const { data, run } = game;
  const { rules } = run;
  game.resetField();
  game.arena.setTheme('day');
  game.audio.playTheme('menu');
  game.showcase.spin = 0.5;

  const chosen = [];
  let current = null;
  let hoverTimer;

  const cells = new Map();
  const grid = h('div.mon-grid');
  const search = h('input.interactive', { placeholder: 'Rechercher (nom, type, n°)…', type: 'search' });
  const info = h('div');
  const slots = h('div.team-slots');
  const confirm = h('button.btn', { 'data-nav': true, onclick: () => validate() }, 'Valider');

  for (const s of data.species) {
    const isBanned = !allowed(rules, s);
    const cell = h(
      `div.mon-cell${isBanned ? '.banned' : ''}`,
      {
        'data-nav': isBanned ? null : true,
        title: `${s.nameFr}${isBanned ? ' (interdit par le règlement)' : ''}`,
        onclick: () => !isBanned && toggle(s),
        onmouseenter: () => preview(s),
        onnavfocus: () => preview(s, 0),
      },
      h('span.num', s.num),
      icon(s.num),
      h('span.order'),
    );
    cells.set(s.num, cell);
    grid.append(cell);
  }

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    for (const s of data.species) {
      const types = s.types.map((t) => `${t} ${data.types[t].fr}`.toLowerCase()).join(' ');
      const match = !q || s.nameFr.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) || types.includes(q) || String(s.num) === q;
      cells.get(s.num).style.display = match ? '' : 'none';
    }
  });

  function preview(s, delay = 140) {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      if (current === s) return;
      current = s;
      for (const [num, cell] of cells) cell.classList.toggle('current', num === s.num);
      info.replaceChildren(speciesCard(data, s, { level: levelLabel(rules, s) }));
      game.showcase.show(s, { radiusScale: 1.15 });
    }, delay);
  }

  function toggle(s) {
    const i = chosen.indexOf(s);
    if (i >= 0) {
      chosen.splice(i, 1);
      game.audio.sfx('back');
    } else if (chosen.length < 6) {
      chosen.push(s);
      game.audio.sfx('select');
      game.audio.cry(s.num);
    } else {
      toast('Ton équipe est complète (6 Pokémon)');
      return;
    }
    preview(s, 0);
    refresh();
  }

  function refresh() {
    for (const [num, cell] of cells) {
      const i = chosen.findIndex((c) => c.num === num);
      cell.classList.toggle('chosen', i >= 0);
      cell.querySelector('.order').textContent = i >= 0 ? i + 1 : '';
    }
    slots.replaceChildren(
      ...Array.from({ length: 6 }, (_, i) => {
        const s = chosen[i];
        return h(`div.team-slot${s ? '.filled' : ''}`, { title: s ? `Retirer ${s.nameFr}` : '', onclick: () => s && toggle(s) }, s ? icon(s.num) : '');
      }),
    );
    confirm.disabled = chosen.length !== 6;
    confirm.textContent = chosen.length === 6 ? 'Valider' : `Valider (${chosen.length}/6)`;
  }

  function randomize() {
    chosen.splice(0, chosen.length, ...randomTeam(data, { rules }));
    game.audio.sfx('select');
    refresh();
    preview(chosen[0], 0);
  }

  function validate() {
    if (chosen.length !== 6) return;
    game.audio.sfx('select');
    run.team = [...chosen];
    game.show(pickScreen);
  }

  const el = h(
    'div.screen.rental-screen',
    h(
      'div.panel.rental-grid-panel',
      h('h2', `${run.title} · Location`),
      h('div.hint', { style: { marginBottom: '8px' } }, `Choisis 6 Pokémon de location. ${rules.blurb || rules.name}`),
      h('div.rental-tools', search, h('button.btn.small.blue', { 'data-nav': true, onclick: randomize }, 'Aléatoire')),
      grid,
    ),
    h('div.spacer'),
    h(
      'div.panel.side-panel',
      info,
      h('h2', { style: { marginTop: '6px' } }, 'Ton équipe'),
      slots,
      h('div.bottom-actions', h('button.btn.ghost.small', { 'data-nav': true, onclick: () => game.show(hubFor(run)) }, 'Retour'), confirm),
    ),
  );

  refresh();
  const firstAllowed = data.species.find((s) => allowed(rules, s) && s.num === 25) || data.species.find((s) => allowed(rules, s));
  preview(firstAllowed, 0);
  const nav = keyboardNav(el, {
    onBack: () => game.show(hubFor(run)),
    onKey: (e) => {
      if (e.key === 'r' && !(e.target instanceof HTMLInputElement)) {
        randomize();
        return true;
      }
      return false;
    },
  });
  return {
    el,
    destroy() {
      clearTimeout(hoverTimer);
      nav.destroy();
      game.showcase.clear();
    },
  };
}

import { h, typeBadge } from './dom.js';

const STAT_LABELS = [['hp', 'PV'], ['atk', 'Attaque'], ['def', 'Défense'], ['spc', 'Spécial'], ['spe', 'Vitesse']];
const STAT_COLORS = { hp: '#ff5959', atk: '#f5ac78', def: '#fae078', spc: '#9db7f5', spe: '#fa92b2' };

export function moveChip(data, id, extra) {
  const m = data.moves[id];
  const color = data.types[m.type]?.color || '#888';
  const meta = m.category === 'Status' ? 'Statut' : `Puiss. ${m.fixedDamage ? '—' : m.power}`;
  return h(
    'div.move-chip',
    { style: { background: `linear-gradient(90deg, ${color}, ${color}bb)` }, title: m.name },
    h('span', m.nameFr),
    h('small', extra ?? `${meta} · Préc. ${m.accuracy ?? '—'} · PP ${m.pp}`),
  );
}

export function speciesCard(data, species, { moves = species.rental.moves, level } = {}) {
  return h(
    'div',
    { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    h(
      'div.mon-title',
      h('span.name', species.nameFr),
      h('span.dex', `N°${String(species.num).padStart(3, '0')}`),
      level ? h('span.hud-level', typeof level === 'number' ? `N.${level}` : level) : null,
    ),
    h('div.genus', `${species.genusFr} · ${species.heightm} m · ${species.weightkg} kg`),
    h('div', { style: { display: 'flex', gap: '6px' } }, species.types.map((t) => typeBadge(data, t))),
    h(
      'div',
      STAT_LABELS.map(([k, label]) =>
        h(
          'div.stat-row',
          h('span', label),
          h('b', species.base[k]),
          h('div.stat-bar', h('div', { style: { width: `${Math.min(100, (species.base[k] / 160) * 100)}%`, background: STAT_COLORS[k] } })),
        ),
      ),
    ),
    h('div.move-list', moves.map((id) => moveChip(data, id))),
  );
}

// Right panel: details of the selected system, stack or faction, with the matching actions.
import { BUILDINGS, BUILDING_CATS } from '../data/buildings.js';
import { REGIONS } from '../data/systems.js';
import { UNIT_TYPES } from '../data/units.js';
import { AGENCIES, GOVERNMENTS } from '../data/factions.js';
import {
  RES_INFO, buildingBlocker, buildingCost, demolishBuilding, productionLines, queueBuilding, slotCount, systemOutput, cancelBuilding,
} from '../engine/economy.js';
import {
  fac, friendly, hasTreaty, isHidden, militaryPower, overlordOf, relation, relationLabel, stacksAt,
  staticSystem, unitName, visibleSystems, dayCache, warBetween,
} from '../engine/query.js';
import { claimSystem, disbandUnits, garrisonMax, mergeAllHere, renameStack, splitStack, stopStack, travelDays } from '../engine/military.js';
import {
  TREATY_NAMES, cancelTreaty, declareIndependence, declareWar, demandVassal, envoyCost, improveRelations, insult, proposeTreaty,
  sendGift, treatyBlocker, warBlocker, scoreFor,
} from '../engine/diplomacy.js';
import { fundInsurrection, insurrectionBlocker, insurrectionCost } from '../engine/politics.js';
import { bdzBlocker, fireBlocker, fireSuperweapon, orbitalBombardment } from '../engine/superweapons.js';
import { planetImage, leaderImage, unitImage } from '../assetSources.js';
import { h, clear, fmt, fmt1, bar, icon, pop, esc, signed } from './dom.js';
import { emblemSvg } from './emblems.js';
import { recruitGrid } from './panels.js';
import { confirmModal } from './modals.js';

const section = (title, ...children) => [h('div', { class: 'section-title' }, title), ...children];
const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', {}, k), h('span', { class: cls }, v));
const emblem = (f, size = 22) => h('span', { class: 'emblem', style: { width: `${size + 10}px`, height: `${size + 10}px` }, html: emblemSvg(f, size) });

export function renderDetails(ui, selection, container) {
  const scroll = container.querySelector('.side-body')?.scrollTop ?? 0;
  clear(container);
  let title = '';
  let body = [];
  if (selection.type === 'system') [title, body] = systemDetails(ui, selection.id);
  else if (selection.type === 'stack') {
    if (!ui.state.stacks[selection.id]) {
      ui.select(null);
      return;
    }
    [title, body] = stackDetails(ui, selection.id);
  } else if (selection.type === 'faction') [title, body] = factionDetails(ui, selection.id);
  const bodyEl = h('div', { class: 'side-body' }, body);
  container.append(h('div', { class: 'side-head' }, h('h2', {}, title), h('button', { class: 'btn icon ghost', html: icon('close', 16), onclick: () => ui.select(null) })), bodyEl);
  bodyEl.scrollTop = scroll;
}

// ---------------------------------------------------------------- system

function systemDetails(ui, id) {
  const { state } = ui;
  const s = state.systems[id];
  const stat = staticSystem(id);
  const hidden = isHidden(state, ui.player, id);
  const owner = hidden ? null : s.owner ? fac(state, s.owner) : null;
  const ctrl = hidden ? null : s.controller ? fac(state, s.controller) : null;
  const mine = s.owner === ui.player && s.controller === ui.player;
  const img = planetImage(id);
  const vis = dayCache(state, `vis:${ui.player}`, () => visibleSystems(state, ui.player));
  const out = [];
  if (img) out.push(h('img', { class: 'hero-img', src: img, alt: stat.name, style: { objectPosition: 'center' } }));
  out.push(h('div', { class: 'row', style: { marginTop: '8px' } },
    owner ? emblem(owner, 20) : null,
    h('div', { class: 'grow' },
      h('div', { style: { fontWeight: 700, color: owner?.color || '#ccd' } }, owner ? owner.name : s.destroyed ? 'Champ de débris' : hidden ? 'Inconnu' : 'Non revendiqué'),
      h('div', { class: 'muted small' }, `${REGIONS[stat.region].name} · secteur ${stat.grid}`)),
    ctrl && ctrl !== owner ? h('span', { class: 'tag', style: { borderColor: ctrl.color, color: ctrl.color } }, `occupé : ${ctrl.short}`) : null));
  if (stat.desc) out.push(h('div', { class: 'muted small', style: { margin: '6px 0' } }, stat.desc));
  if (s.destroyed) {
    out.push(h('div', { class: 'card bad' }, 'Cette planète a été anéantie. Il ne reste qu’un champ d’astéroïdes.'));
    return [stat.name, out];
  }
  if (hidden) {
    out.push(h('div', { class: 'card small muted' }, 'Aucune information : ce monde pourrait abriter une base secrète. Une opération de reconnaissance permettrait de le savoir.'));
    return [stat.name, out];
  }
  const deposits = Object.entries(s.res).filter(([, l]) => l > 0);
  out.push(h('div', { class: 'card grid2' },
    kv('Population', pop(s.pop)), kv('Développement', fmt1(s.dev)),
    kv('Production', `${fmt1(systemOutput(state, s))} cr/j`),
    kv('Stabilité', `${Math.round(s.stability)} %`, s.stability < 30 ? 'bad' : s.stability < 50 ? 'warn' : 'good'),
    state.insurgency ? kv('Sympathie insurgée', `${Math.round(s.sympathy || 0)} %`, s.sympathy > 50 ? 'bad' : '') : null,
    kv('Garnison', `${fmt(s.garrison)} / ${fmt(garrisonMax(state, s))}`),
    s.shield ? kv('Bouclier', fmt(s.shield)) : null,
    deposits.length ? kv('Gisements', deposits.map(([r, l]) => `${RES_INFO[r].short} ${l}`).join(', ')) : null,
    s.blockade ? kv('Blocus', 'oui', 'bad') : null,
  ));
  if (s.battle) out.push(h('div', { class: 'card bad small' }, `⚔ Combat en cours depuis ${state.day - s.battle.since} jour(s).`));

  // Buildings.
  const slots = slotCount(state, s);
  out.push(...section(`Infrastructures (${s.buildings.length + s.build.length}/${slots})`,
    h('div', { class: 'slots' },
      s.buildings.map((b, i) => h('span', { class: 'slot', 'data-tip': `<b>${BUILDINGS[b].name}</b><br>${BUILDINGS[b].desc}${mine ? '<br><i>Clic droit : démolir</i>' : ''}`,
        oncontextmenu: (ev) => { ev.preventDefault(); if (mine) confirmModal(ui, 'Démolir ?', `Démolir ${BUILDINGS[b].name} ?`, () => ui.command(() => demolishBuilding(state, ui.player, id, i))); } }, BUILDINGS[b].name)),
      s.build.map((q, i) => h('span', { class: 'slot building', 'data-tip': `En construction : ${Math.ceil(q.days)} j${mine ? '<br><i>Clic : annuler</i>' : ''}`, onclick: () => { if (mine) ui.command(() => cancelBuilding(state, ui.player, id, i)); } },
        `${BUILDINGS[q.b].name} · ${i === 0 ? `${Math.ceil(q.days)} j` : '…'}`)),
      Array.from({ length: Math.max(0, slots - s.buildings.length - s.build.length) }, () => h('span', { class: 'slot empty' }, 'libre')))));
  if (mine) {
    const permanent = ['Aucun gisement.', 'Déjà construit.', 'Chantier naval majeur requis.'];
    const options = Object.entries(BUILDINGS).filter(([bid]) => !permanent.includes(buildingBlocker(state, ui.player, id, bid)));
    out.push(...section('Construire', h('div', { class: 'build-grid' }, options.map(([bid, b]) => {
      const reason = buildingBlocker(state, ui.player, id, bid);
      const cost = buildingCost(state, ui.player, bid);
      const costText = Object.entries(cost).map(([k, v]) => `${fmt(v)} ${k === 'cr' ? 'cr' : RES_INFO[k].short}`).join(' · ');
      return h('div', {
        class: `build-item ${reason ? 'disabled' : ''}`,
        'data-tip': `<b>${b.name}</b> (${BUILDING_CATS[b.cat]})<br>${b.desc}<br>Coût : ${costText} · ${b.days} j · entretien ${b.upkeep} cr/j${reason ? `<br><span class="bad">${esc(reason)}</span>` : ''}`,
        onclick: () => { if (!reason) ui.command(() => queueBuilding(state, ui.player, id, bid)); },
      }, h('div', { style: { fontWeight: 600 } }, b.name), h('div', { class: 'muted' }, `${fmt(cost.cr)} cr · ${b.days} j`));
    }))));
    const lines = productionLines(state, s);
    if (lines.ground || lines.air || lines.ship) out.push(...section('Recruter ici', recruitGrid(ui, id)));
  }

  // Forces present.
  const here = stacksAt(state, id).filter((st) => st.owner === ui.player || friendly(state, ui.player, st.owner) || vis.has(id));
  out.push(...section('Forces présentes', here.length ? here.map((st) => h('div', { class: 'row between small', style: { padding: '3px 0', cursor: 'pointer' }, onclick: () => ui.select({ type: 'stack', id: st.id }) },
    h('div', { class: 'row' }, emblem(fac(state, st.owner), 12), h('span', {}, st.name)), h('span', { class: 'muted' }, `${st.units.length} unités`)))
    : h('div', { class: 'muted small' }, vis.has(id) ? 'Aucune.' : 'Hors de portée de vos capteurs.')));

  // Special actions.
  const actions = [];
  if (!s.owner) {
    actions.push(h('button', { class: 'btn', onclick: () => ui.command(() => claimSystem(state, ui.player, id), 'Avant-poste établi.') }, 'Établir un avant-poste (150 cr, troupes requises)'));
  }
  const insBlock = s.owner && s.owner !== ui.player ? insurrectionBlocker(state, ui.player, id) : 'n/a';
  if (insBlock !== 'n/a' && insBlock !== 'Réservé aux mouvements insurgés.') {
    actions.push(h('button', { class: 'btn', disabled: !!insBlock, 'data-tip': insBlock || null, onclick: () => ui.command(() => fundInsurrection(state, ui.player, id), 'Insurrection lancée !') }, `Armer les cellules locales (${fmt(insurrectionCost(state, id))} cr)`));
  }
  for (const sw of state.superweapons.filter((w) => w.owner === ui.player)) {
    const blocker = fireBlocker(state, sw, id);
    if (s.owner === ui.player && blocker === 'Cible alliée.') continue;
    actions.push(h('button', { class: 'btn danger', disabled: !!blocker, 'data-tip': blocker || 'Anéantir ce système.',
      onclick: () => confirmModal(ui, `${sw.name} : faire feu ?`, `Détruire définitivement ${stat.name} ? Toute la galaxie s’en souviendra.`, () => ui.command(() => fireSuperweapon(state, sw.id, id), `${stat.name} a été détruite.`)) },
    `☄ ${sw.name} : faire feu`));
  }
  if (actions.length) out.push(...section('Actions', h('div', { class: 'stack' }, actions)));
  return [stat.name, out];
}

// ---------------------------------------------------------------- stack

function stackDetails(ui, id) {
  const { state } = ui;
  const st = state.stacks[id];
  const owner = fac(state, st.owner);
  const mine = st.owner === ui.player;
  const vis = dayCache(state, `vis:${ui.player}`, () => visibleSystems(state, ui.player));
  const intel = mine || friendly(state, ui.player, st.owner) || fac(state, ui.player).intel[st.owner] > state.day || vis.has(st.sys);
  const out = [];
  const where = st.move
    ? `En route : ${staticSystem(st.move.from).name} → ${staticSystem(st.move.to).name}${st.dest && st.dest !== st.move.to ? ` (destination ${staticSystem(st.dest).name})` : ''}`
    : `En orbite de ${staticSystem(st.sys).name}${st.dest ? ` → ${staticSystem(st.dest).name}` : ''}`;
  out.push(h('div', { class: 'row' }, emblem(owner, 20), h('div', { class: 'grow' }, h('div', { style: { fontWeight: 700, color: owner.color } }, owner.name), h('div', { class: 'muted small' }, where))));
  if (mine && st.dest) {
    const remaining = [st.move ? st.move.to : st.sys, ...st.path];
    out.push(h('div', { class: 'muted small' }, `Arrivée estimée : ${travelDays(state, st, remaining) + (st.move ? 1 : 0)} jour(s)`));
  }
  if (!intel) {
    out.push(h('div', { class: 'card muted small', style: { marginTop: '8px' } }, `${st.units.length} unités de composition inconnue.`));
    return [st.name, out];
  }
  // Units grouped by type.
  const groups = {};
  for (const u of st.units) {
    if (!groups[u.t]) groups[u.t] = { n: 0, hp: 0, max: 0, xp: 0 };
    const g = groups[u.t];
    g.n++;
    g.hp += u.hp;
    g.max += owner.mods.maxHp?.[u.t] ?? UNIT_TYPES[u.t].hp;
    g.xp += u.xp || 0;
  }
  out.push(...section(`Composition (${st.units.length})`, Object.entries(groups).map(([t, g]) => h('div', { class: 'unit-row' },
    h('img', { src: unitImage(owner.style, t) || '', alt: '', loading: 'lazy' }),
    h('div', { class: 'grow' }, h('div', {}, `${g.n} × ${unitName(state, st.owner, t)}`), bar(g.hp, g.max, g.hp / g.max < 0.4 ? 'var(--bad)' : 'var(--good)')),
    h('span', { class: 'muted small', 'data-tip': 'Expérience moyenne' }, `xp ${Math.round(g.xp / g.n)}`),
    mine && !st.station ? h('button', { class: 'btn small ghost', 'data-tip': 'Détacher ces unités dans un nouveau groupe', onclick: () => {
      const created = splitStack(state, id, { [t]: g.n });
      if (created) ui.select({ type: 'stack', id: created.id });
      ui.command(() => ({ ok: true }));
    } }, '⇱') : null))));
  if (!mine) return [st.name, out];
  const s = state.systems[st.sys];
  const actions = [
    h('button', { class: 'btn primary', onclick: () => ui.startMove() }, 'Déplacer (clic droit sur la carte)'),
    st.path.length || st.move ? h('button', { class: 'btn', onclick: () => ui.command(() => stopStack(state, id)) }, 'Arrêter après le saut en cours') : null,
    !st.move && !st.station ? h('button', { class: 'btn', onclick: () => ui.command(() => ({ ok: !!mergeAllHere(state, id) || true })) }, 'Regrouper les forces du système') : null,
    !st.move && !st.station && st.units.length > 1 ? h('button', { class: 'btn', onclick: () => {
      const half = {};
      for (const [t, g] of Object.entries(groups)) half[t] = Math.floor(g.n / 2);
      const created = splitStack(state, id, half);
      if (created) ui.select({ type: 'stack', id: created.id });
    } }, 'Scinder en deux') : null,
  ];
  if (!st.move && unlockedBdz(ui)) {
    const blocker = bdzBlocker(state, id);
    actions.push(h('button', { class: 'btn danger', disabled: !!blocker, 'data-tip': blocker || 'Réduire la surface de la planète en cendres.',
      onclick: () => confirmModal(ui, 'Base Delta Zéro', `Bombarder ${staticSystem(st.sys).name} jusqu’à la roche en fusion ?`, () => ui.command(() => orbitalBombardment(state, id), 'Bombardement orbital exécuté.')) }, '☢ Base Delta Zéro'));
  }
  const sw = state.superweapons.find((w) => w.stackId === id);
  if (sw && !st.move) {
    const blocker = fireBlocker(state, sw, st.sys);
    actions.push(h('button', { class: 'btn danger', disabled: !!blocker, 'data-tip': blocker || '',
      onclick: () => confirmModal(ui, `${sw.name} : faire feu ?`, `Détruire ${staticSystem(st.sys).name} ?`, () => ui.command(() => fireSuperweapon(state, sw.id, st.sys), 'Cible anéantie.')) }, `☄ Superlaser sur ${staticSystem(st.sys).name} (${Math.floor(sw.charge * 100)} %)`));
  }
  if (!st.station) {
    actions.push(h('button', { class: 'btn ghost small', onclick: () => confirmModal(ui, 'Dissoudre', `Dissoudre ${st.name} ?`, () => { disbandUnits(state, id); ui.select(null); ui.command(() => ({ ok: true })); }) }, 'Dissoudre le groupe'));
  }
  const rename = h('input', { type: 'text', value: st.name, style: { width: '100%' }, onchange: (ev) => ui.command(() => { renameStack(state, id, ev.target.value); return { ok: true }; }) });
  out.push(...section('Ordres', h('div', { class: 'stack' }, actions.filter(Boolean))), ...section('Nom', rename));
  if (s?.battle) out.push(h('div', { class: 'card bad small', style: { marginTop: '8px' } }, 'Combat en cours : un groupe peut battre en retraite en recevant un ordre de déplacement.'));
  return [st.name, out];
}

function unlockedBdz(ui) {
  return ui.state.factions[ui.player].mods.unlock.includes('bdz');
}

// ---------------------------------------------------------------- faction

function factionDetails(ui, fid) {
  const { state } = ui;
  const f = fac(state, fid);
  const me = ui.player;
  const g = GOVERNMENTS[f.gov];
  const img = leaderImage(f.leader);
  const rel = relation(state, me, fid);
  const intel = fac(state, me).intel[fid] > state.day || fid === me;
  const systems = Object.values(state.systems).filter((s) => s.owner === fid);
  const out = [];
  out.push(h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '10px' } },
    img ? h('img', { class: 'portrait', src: img, alt: '' }) : h('span', { class: 'emblem', style: { width: '76px', height: '76px' }, html: emblemSvg(f, 48) }),
    h('div', { class: 'stack', style: { gap: '3px' } },
      h('div', { class: 'row' }, emblem(f, 16), h('b', { style: { color: f.color } }, f.name)),
      h('div', { class: 'small' }, f.leader), h('div', { class: 'muted small' }, g.name), h('div', { class: 'muted small' }, AGENCIES[f.agency].name),
      f.capital ? h('a', { href: '#', class: 'small', onclick: (ev) => { ev.preventDefault(); ui.focusSystem(f.capital); } }, `Capitale : ${staticSystem(f.capital).name}`) : null)));
  out.push(h('div', { class: 'card grid2', style: { marginTop: '8px' } },
    kv('Systèmes', systems.length), kv('PIB/j', fmt(f.econ?.gdp || 0)),
    kv('Puissance', fmt(militaryPower(state, fid))), kv('Stabilité', `${Math.round(f.stability)} %`),
    kv('Technologies', f.techs.length), intel ? kv('Trésorerie', fmt(f.treasury)) : kv('Trésorerie', '?'),
  ));
  if (fid === me) return [f.short, out];
  const war = warBetween(state, me, fid);
  out.push(...section('Relations',
    h('div', { class: 'row' }, h('div', { class: 'grow' }, bar(rel + 100, 200, rel >= 0 ? 'var(--good)' : 'var(--bad)')), h('b', {}, `${Math.round(rel)} · ${relationLabel(rel)}`)),
    h('div', { class: 'row wrap small', style: { gap: '4px', marginTop: '4px' } },
      Object.keys(TREATY_NAMES).filter((t) => hasTreaty(state, t, me, fid)).map((t) => h('span', { class: 'tag' }, t === 'vassal' ? (overlordOf(state, me) === fid ? 'Votre suzerain' : 'Votre vassal') : TREATY_NAMES[t])),
      war ? h('span', { class: 'tag', style: { color: 'var(--bad)', borderColor: 'var(--bad)' } }, `En guerre (score ${signed(scoreFor(state, war, me))})`) : null)));
  const cost = envoyCost(state, me);
  const giftInput = h('input', { type: 'number', min: 1, value: Math.round(Math.max(50, (fac(state, me).econ?.revenue || 10) * 10)), style: { width: '90px' } });
  const actions = [
    h('button', { class: 'btn', onclick: () => ui.command(() => improveRelations(state, me, fid), 'Émissaire bien accueilli (+10).') }, `Envoyer un émissaire (${fmt(cost)} cr)`),
    h('div', { class: 'row' }, h('button', { class: 'btn', onclick: () => ui.command(() => sendGift(state, me, fid, Number(giftInput.value)), 'Cadeau envoyé.') }, 'Offrir des crédits'), giftInput),
    h('button', { class: 'btn', onclick: () => ui.command(() => insult(state, me, fid), 'Affront diffusé sur l’HoloNet.') }, 'Insulter publiquement'),
  ];
  const treatyButtons = ['trade', 'nap', 'access', 'alliance'].map((type) => {
    if (hasTreaty(state, type, me, fid)) {
      return h('button', { class: 'btn small', onclick: () => confirmModal(ui, 'Rompre le traité', `Rompre ${TREATY_NAMES[type].toLowerCase()} avec ${f.name} ?`, () => ui.command(() => cancelTreaty(state, me, fid, type), 'Traité rompu.')) }, `Rompre : ${TREATY_NAMES[type]}`);
    }
    const blocker = treatyBlocker(state, me, fid, type);
    return h('button', { class: 'btn small', disabled: !!blocker, 'data-tip': blocker || null, onclick: () => ui.command(() => proposeTreaty(state, me, fid, type)) }, `Proposer : ${TREATY_NAMES[type]}`);
  });
  const vassalAction = hasTreaty(state, 'vassal', me, fid)
    ? (overlordOf(state, me) === fid
      ? h('button', { class: 'btn small danger', onclick: () => confirmModal(ui, 'Indépendance', `Proclamer votre indépendance face à ${f.name} ? C’est la guerre.`, () => ui.command(() => declareIndependence(state, me))) }, 'Proclamer l’indépendance')
      : h('button', { class: 'btn small', onclick: () => ui.command(() => cancelTreaty(state, me, fid, 'vassal'), 'Vassal libéré.') }, 'Libérer ce vassal'))
    : h('button', { class: 'btn small', disabled: !!treatyBlocker(state, me, fid, 'vassal'), onclick: () => ui.command(() => demandVassal(state, me, fid)) }, 'Exiger leur vassalité');
  const blocker = warBlocker(state, me, fid);
  const warButton = war ? null : h('button', { class: 'btn danger', disabled: !!blocker, 'data-tip': blocker || null,
    onclick: () => confirmModal(ui, 'Déclarer la guerre', `Déclarer la guerre à ${f.name} ? Leurs alliés pourraient se joindre au conflit.`, () => ui.command(() => declareWar(state, me, fid), 'La guerre est déclarée !')) }, 'Déclarer la guerre');
  out.push(...section('Diplomatie', h('div', { class: 'stack' }, actions, h('div', { class: 'row wrap', style: { gap: '4px' } }, treatyButtons, vassalAction), warButton)));
  if (war) out.push(h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'Les propositions de paix se font depuis le panneau Diplomatie (G).'));
  out.push(h('button', { class: 'btn small ghost', style: { marginTop: '8px' }, onclick: () => { ui.opTarget = fid; ui.openPanel('intel'); } }, 'Opérations clandestines contre cette faction…'));
  return [f.short, out];
}

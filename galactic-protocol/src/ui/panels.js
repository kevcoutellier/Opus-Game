// Left panels: economy, military, diplomacy, intelligence, research, Senate, politics, alert level, ledger, news.
import { BUILDINGS } from '../data/buildings.js';
import { OPS } from '../data/ops.js';
import { RESOLUTIONS } from '../data/senate.js';
import { TECHS, TECH_BY_ID, BRANCHES } from '../data/techs.js';
import { UNIT_TYPES } from '../data/units.js';
import { AGENCIES, GOVERNMENTS } from '../data/factions.js';
import {
  BUDGET_KEYS, RES, RES_INFO, buyResource, cancelBuilding, cancelProduction, isSanctioned, marketPrice, productionLines,
  recruit, recruitBlocker, sellResource, setBudget, setTax, unitCost,
} from '../engine/economy.js';
import {
  aliveFactions, atWar, fac, hasTreaty, militaryPower, relation, stackCounts, stackPower,
  stacksOf, staticSystem, unitName, warsOf, yearLabel, DAYS_PER_YEAR,
} from '../engine/query.js';
import { PEACE_TERMS, aiAcceptsPeace, proposePeace, scoreFor, warScore } from '../engine/diplomacy.js';
import { counterIntel, freeAgents, launchOp, maxAgents, opBlocker, opChance, opCost, opTargets } from '../engine/espionage.js';
import { canResearch, queueResearch, setResearch, techCost } from '../engine/research.js';
import {
  castVote, isMember, joinSenate, leaveSenate, proposalBlocker, proposeResolution, seats, tally, totalSeats,
} from '../engine/senate.js';
import { DECISIONS, approval, decisionBlocker, decisionCost, socialEffect, stabilityFactors, takeDecision, taxEffect } from '../engine/politics.js';
import { ALERT_LEVELS, SW_TYPES, alertLevel, swLocation, tensionTarget } from '../engine/superweapons.js';
import { answerInbox, dominationTarget, goalProgress, gdpShare, inboxText, inboxTitle } from '../engine/sim.js';
import { playerSees } from '../engine/news.js';
import { leaderImage, unitImage, iconUrl } from '../assetSources.js';
import { h, clear, fmt, fmt1, signed, bar, icon, esc, holoHead, holoPic } from './dom.js';
import { emblemSvg } from './emblems.js';
import { ALERT_COLORS } from './hud.js';

const section = (title, ...children) => [h('div', { class: 'section-title' }, title), ...children];
const kv = (k, v, cls = '') => h('div', { class: 'kv' }, h('span', {}, k), h('span', { class: cls }, v));
const emblem = (f, size = 22) => h('span', { class: 'emblem', style: { width: `${size + 10}px`, height: `${size + 10}px` }, html: emblemSvg(f, size) });

export const PANELS = {
  economy: { title: 'Économie', short: 'Économie', icon: icon('economy'), key: 'e', tip: 'Budget, fiscalité, ressources et commerce (E)', render: economyPanel },
  military: { title: 'Forces armées', short: 'Armée', icon: icon('military'), key: 'f', tip: 'Flottes, armées et production militaire (F)', render: militaryPanel },
  diplomacy: {
    title: 'Diplomatie', short: 'Diplo.', icon: icon('diplomacy'), key: 'g', tip: 'Relations, traités, guerres et paix (G)', render: diplomacyPanel,
    badge: (ui) => ui.state.inbox.filter((i) => i.kind === 'treaty').length || warsOf(ui.state, ui.player).length || null,
  },
  intel: { title: 'Renseignement', short: 'Espions', icon: icon('intel'), key: 'i', tip: 'Agence de renseignement et opérations clandestines (I)', render: intelPanel },
  research: {
    title: 'Recherche', short: 'Recherche', icon: icon('research'), key: 'r', tip: 'Arbre technologique : 47 technologies (R)', render: researchPanel, wide: true,
    badge: (ui) => (fac(ui.state, ui.player).research.current ? null : '!'),
  },
  senate: {
    title: 'Sénat Galactique', short: 'Sénat', icon: icon('senate'), key: 'n', tip: 'Résolutions, votes et sanctions (N)', render: senatePanel,
    badge: (ui) => (ui.state.senate?.current && isMember(ui.state, ui.player) && !ui.state.senate.current.votes[ui.player] ? '!' : null),
  },
  politics: { title: 'Politique intérieure', short: 'Politique', icon: icon('politics'), key: 'p', tip: 'Gouvernement, stabilité, décisions et objectifs (P)', render: politicsPanel },
  alert: { title: 'Alerte & superarmes', short: 'Alerte', icon: icon('alert'), key: 'l', tip: 'Niveau d’alerte galactique et armes de destruction massive (L)', render: alertPanel },
  ledger: { title: 'Classement galactique', short: 'Classement', icon: icon('ledger'), key: 'c', tip: 'Comparaison des puissances (C)', render: ledgerPanel, wide: true },
  news: { title: 'HoloNet', short: 'HoloNet', icon: icon('help'), key: 'h', tip: 'Journal des événements (H)', render: newsPanel, hidden: false },
};

export function renderPanel(ui, id, container) {
  const p = PANELS[id];
  const scroll = container.querySelector('.side-body')?.scrollTop ?? 0;
  clear(container);
  container.classList.toggle('wide', !!p.wide);
  const body = h('div', { class: 'side-body' });
  container.append(
    holoHead(p.title, { lead: h('span', { html: p.icon, class: 'accent' }),
      extra: h('button', { class: 'btn icon ghost', html: icon('close', 16), onclick: () => ui.closePanel() }) }),
    body,
  );
  body.append(...[p.render(ui)].flat(Infinity).filter(Boolean));
  body.scrollTop = scroll;
}

// ---------------------------------------------------------------- economy

function economyPanel(ui) {
  const { state } = ui;
  const f = fac(state, ui.player);
  const e = f.econ;
  const line = (label, value, tip = '') => h('div', { class: 'kv', 'data-tip': tip || null }, h('span', {}, label), h('span', { class: value >= 0 ? 'good' : 'bad' }, signed(value, 1)));
  const allocTotal = Object.values(e.alloc).reduce((a, b) => a + b, 0);
  const taxSlider = h('input', { type: 'range', min: 0, max: 60, step: 1, value: f.taxRate, onchange: (ev) => ui.command(() => setTax(state, ui.player, Number(ev.target.value))) });
  const budget = Object.entries(BUDGET_KEYS).map(([key, label]) => {
    const effect = {
      research: `${fmt1(f.rpDay)} recherche/j`,
      intel: `${fmt1(f.ipDay)} renseignement/j`,
      social: `stabilité ${signed(socialEffect(f.budget.social), 1)}`,
      infra: `croissance ${fmt1(f.budget.infra * 0.018)} dév./an`,
    }[key];
    return h('div', { class: 'stack', style: { gap: '2px' } },
      h('div', { class: 'row between small' }, h('span', {}, label), h('span', { class: 'muted' }, `${f.budget[key]} % · ${fmt(e.alloc[key])} cr/j · ${effect}`)),
      h('input', { type: 'range', min: 0, max: 40, step: 1, value: f.budget[key], onchange: (ev) => ui.command(() => setBudget(state, ui.player, key, Number(ev.target.value))) }),
    );
  });
  const sanctioned = isSanctioned(state, ui.player);
  const resRows = RES.map((r) => {
    const net = e.prod[r] - e.use[r];
    return h('tr', {},
      h('td', { 'data-tip': `<b>${RES_INFO[r].name}</b><br>Production ${fmt1(e.prod[r])}/j · consommation ${fmt1(e.use[r])}/j` }, RES_INFO[r].name),
      h('td', { class: f.deficit[r] ? 'bad' : '' }, fmt(f.res[r])),
      h('td', { class: net < -0.05 ? 'bad' : 'good' }, signed(net, 1)),
      h('td', {}, fmt1(marketPrice(state, r))),
      h('td', {}, h('div', { class: 'row', style: { gap: '3px' } },
        h('button', { class: 'btn small', disabled: sanctioned, onclick: () => ui.command(() => buyResource(state, ui.player, r, 50)) }, '+50'),
        h('button', { class: 'btn small', disabled: sanctioned || f.res[r] < 1, onclick: () => ui.command(() => sellResource(state, ui.player, r, Math.min(50, f.res[r]))) }, '−50'),
      )),
    );
  });
  const builds = Object.values(state.systems).filter((s) => s.owner === ui.player && s.build.length);
  return [
    h('div', { class: 'card' },
      kv('PIB galactique / jour', fmt(e.gdp)),
      line('Impôts', e.tax), e.trade ? line('Commerce', e.trade) : null,
      e.donations ? line('Dons des sympathisants', e.donations) : null, e.subsidy ? line('Financement occulte', e.subsidy) : null,
      e.tribute ? line('Tribut', e.tribute) : null, e.market ? line('Marché galactique', e.market, 'Achats et ventes de ressources de la veille') : null,
      line('Entretien des unités', -e.unitUpkeep), line('Entretien des bâtiments', -e.buildingUpkeep),
      line('Budget de l’État', -allocTotal), e.interest ? line('Intérêts de la dette', -e.interest) : null,
      e.loans ? line('Remboursement d’emprunt', -e.loans) : null,
      h('div', { style: { borderTop: '1px solid var(--line)', marginTop: '4px', paddingTop: '4px' } }, line('Solde quotidien', e.net + (e.market || 0))),
      kv('Trésorerie', fmt(f.treasury), f.treasury < 0 ? 'bad' : 'accent'),
      f.bankrupt ? h('div', { class: 'bad small' }, 'Cessation de paiements : moral des troupes et stabilité en chute.') : null,
    ),
    section('Fiscalité',
      h('div', { class: 'row between small' }, h('span', {}, `Taux d’imposition : ${f.taxRate} %`), h('span', { class: 'muted' }, `stabilité ${signed(taxEffect(f.taxRate), 1)}`)),
      taxSlider),
    section('Budget de l’État (% des revenus)', ...budget),
    section('Ressources stratégiques & marché galactique',
      sanctioned ? h('div', { class: 'bad small' }, 'Embargo du Sénat : accès au marché interdit.') : null,
      h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Ressource'), h('th', {}, 'Stock'), h('th', {}, 'Net/j'), h('th', {}, 'Prix'), h('th', {}, '')), resRows),
      h('label', { class: 'row small', style: { marginTop: '6px' } },
        h('input', { type: 'checkbox', checked: f.autoTrade, onchange: (ev) => { f.autoTrade = ev.target.checked; } }),
        'Commerce automatique (vend les surplus, achète en cas de pénurie)')),
    section('Chantiers en cours',
      builds.length ? builds.map((s) => s.build.map((item, i) => h('div', { class: 'row between small', style: { padding: '2px 0' } },
        h('a', { href: '#', onclick: (ev) => { ev.preventDefault(); ui.focusSystem(s.id); } }, staticSystem(s.id).name),
        h('span', {}, BUILDINGS[item.b].name),
        h('span', { class: 'muted' }, i === 0 ? `${Math.max(0, Math.ceil(item.days))} j` : 'en attente'),
        h('button', { class: 'btn small ghost', onclick: () => ui.command(() => cancelBuilding(state, ui.player, s.id, i)), 'data-tip': 'Annuler (remboursé à 50 %)' }, '✕'),
      ))) : h('div', { class: 'muted small' }, 'Aucun chantier. Sélectionnez un de vos systèmes pour construire.')),
  ];
}

// ---------------------------------------------------------------- military

export function unitCard(ui, sysId, type, disabledReason) {
  const f = fac(ui.state, ui.player);
  const u = UNIT_TYPES[type];
  const cost = unitCost(ui.state, ui.player, type);
  const costText = Object.entries(cost).filter(([, v]) => v).map(([k, v]) => `${fmt(v)} ${k === 'cr' ? 'cr' : RES_INFO[k].short}`).join(' · ');
  const tip = `<b>${esc(unitName(ui.state, ui.player, type))}</b> (${u.label})<br>${u.desc}<br>PV ${u.hp} · Att. chasseurs ${u.atk.air} / vaisseaux ${u.atk.ship} / sol ${u.atk.ground} · Vitesse ${u.speed}<br>Coût : ${costText}${u.mp ? ` · ${u.mp} effectifs` : ''}<br>Entretien ${fmt1(u.upkeep * 1.5)} cr/j · ${u.days} jours${disabledReason ? `<br><span class="bad">${disabledReason}</span>` : '<br><i>Clic : 1 unité · Maj+clic : 5 unités</i>'}`;
  return h('div', {
    class: `unit-card ${disabledReason ? 'disabled' : ''}`, 'data-tip': tip,
    onclick: (ev) => { if (!disabledReason) ui.command(() => recruit(ui.state, ui.player, sysId, type, ev.shiftKey ? 5 : 1)); },
  },
  h('img', { src: unitImage(f.style, type) || '', alt: '', loading: 'lazy' }),
  h('div', { class: 'body' }, h('div', { class: 'nm' }, unitName(ui.state, ui.player, type)), h('div', { class: 'muted' }, `${fmt(cost.cr)} cr · ${u.days} j`)));
}

export function recruitGrid(ui, sysId) {
  const lines = productionLines(ui.state, ui.state.systems[sysId]);
  const types = Object.keys(UNIT_TYPES).filter((t) => UNIT_TYPES[t].cat !== 'station');
  return h('div', { class: 'stack' },
    h('div', { class: 'muted small' }, `Lignes de production : troupes ${lines.ground} · chasseurs ${lines.air} · vaisseaux ${lines.ship}`),
    h('div', { class: 'unit-grid' }, types.map((t) => unitCard(ui, sysId, t, recruitBlocker(ui.state, ui.player, sysId, t)))));
}

function militaryPanel(ui) {
  const { state } = ui;
  const f = fac(state, ui.player);
  const stacks = stacksOf(state, ui.player);
  const counts = {};
  for (const st of stacks) for (const [t, n] of Object.entries(stackCounts(st))) counts[t] = (counts[t] || 0) + n;
  const sites = Object.values(state.systems).filter((s) => s.owner === ui.player && s.controller === ui.player && !s.destroyed)
    .filter((s) => { const l = productionLines(state, s); return l.ground || l.air || l.ship; });
  if (!ui.recruitSite || !sites.some((s) => s.id === ui.recruitSite)) ui.recruitSite = sites.find((s) => s.id === f.capital)?.id ?? sites[0]?.id;
  const siteSelect = h('select', { onchange: (ev) => { ui.recruitSite = ev.target.value; ui.refreshPanels(true); } },
    sites.map((s) => h('option', { value: s.id, selected: s.id === ui.recruitSite }, staticSystem(s.id).name)));
  const rows = stacks.sort((a, b) => stackPower(state, b) - stackPower(state, a)).map((st) => {
    const where = st.move ? `→ ${staticSystem(st.dest || st.move.to).name}` : staticSystem(st.sys).name;
    const hp = st.units.reduce((acc, u) => acc + u.hp, 0);
    const max = st.units.reduce((acc, u) => acc + (f.mods.maxHp?.[u.t] ?? UNIT_TYPES[u.t].hp), 0);
    return h('tr', { class: 'clickable', onclick: () => ui.focusStack(st.id) },
      h('td', {}, st.name, state.systems[st.sys]?.battle && !st.move ? h('span', { class: 'bad' }, ' ⚔') : null),
      h('td', { class: 'muted' }, where),
      h('td', {}, st.units.length),
      h('td', {}, `${Math.round((hp / Math.max(1, max)) * 100)} %`));
  });
  return [
    h('div', { class: 'card grid2' },
      kv('Puissance', fmt(militaryPower(state, ui.player))), kv('Unités', stacks.reduce((a, st) => a + st.units.length, 0)),
      kv('Entretien', `${fmt(f.econ.unitUpkeep)} cr/j`), kv('Effectifs', fmt(f.manpower)),
    ),
    h('div', { class: 'row wrap small', style: { marginTop: '6px', gap: '4px' } },
      Object.entries(counts).map(([t, n]) => h('span', { class: 'tag' }, `${n} × ${unitName(state, ui.player, t)}`))),
    section('Groupes armés', stacks.length ? h('table', { class: 'table' },
      h('tr', {}, h('th', {}, 'Nom'), h('th', {}, 'Position'), h('th', {}, 'U.'), h('th', {}, 'PV')), rows)
      : h('div', { class: 'muted small' }, 'Aucune force armée.')),
    section('Production en cours', f.production.length ? f.production.slice(0, 40).map((p) => h('div', { class: 'row between small', style: { padding: '2px 0' } },
      h('span', {}, unitName(state, ui.player, p.t)), h('span', { class: 'muted' }, staticSystem(p.sys).name),
      h('span', {}, `${Math.max(0, Math.ceil(p.days))} j`),
      h('button', { class: 'btn small ghost', onclick: () => ui.command(() => cancelProduction(state, ui.player, p.id)), 'data-tip': 'Annuler (remboursé à 75 %)' }, '✕')))
      : h('div', { class: 'muted small' }, 'Aucune unité en production.')),
    section('Recruter', sites.length ? [h('div', { class: 'row small' }, 'Chantier / caserne :', siteSelect), recruitGrid(ui, ui.recruitSite)]
      : h('div', { class: 'muted small' }, 'Aucun site de production : construisez une caserne, une base de chasseurs ou un chantier naval.')),
    h('div', { class: 'muted small', style: { marginTop: '10px' } }, 'Astuce : sélectionnez un groupe puis faites un clic droit sur un système pour le déplacer.'),
  ];
}

// ---------------------------------------------------------------- diplomacy

function diplomacyPanel(ui) {
  const { state } = ui;
  const wars = state.wars;
  const warCards = wars.map((w) => {
    const mine = w.att.includes(ui.player) || w.def.includes(ui.player);
    const score = mine ? scoreFor(state, w, ui.player) : warScore(state, w);
    const leaderFoe = mine ? (w.att.includes(ui.player) ? w.def[0] : w.att[0]) : null;
    const pct = (score + 100) / 2;
    return h('div', { class: 'card', style: { marginBottom: '6px', borderColor: mine ? 'rgba(255,93,93,0.5)' : '' } },
      h('div', { class: 'row between' }, h('b', {}, w.name), h('span', { class: 'muted small' }, `${Math.round((state.day - w.start) / 30)} mois`)),
      h('div', { class: 'row small', style: { margin: '4px 0' } },
        h('div', { class: 'row wrap', style: { gap: '2px' } }, w.att.map((id) => emblem(fac(state, id), 14))), h('span', { class: 'muted' }, 'contre'),
        h('div', { class: 'row wrap', style: { gap: '2px' } }, w.def.map((id) => emblem(fac(state, id), 14)))),
      h('div', { class: 'row small' }, h('span', {}, mine ? 'Score (vous)' : 'Score (attaquants)'), h('div', { class: 'grow' }, bar(pct, 100, score >= 0 ? 'var(--good)' : 'var(--bad)')), h('b', {}, signed(score))),
      mine && leaderFoe ? h('div', { class: 'row wrap', style: { marginTop: '6px', gap: '4px' } }, Object.entries(PEACE_TERMS).map(([terms, label]) => {
        const hint = aiAcceptsPeace(state, leaderFoe, ui.player, terms);
        return h('button', { class: `btn small ${hint.accept ? 'good' : ''}`, 'data-tip': `${label}<br>${hint.accept ? '<span class="good">Ils accepteraient probablement.</span>' : `<span class="bad">${esc(hint.reason || 'Refus probable.')}</span>`}`,
          onclick: () => ui.command(() => proposePeace(state, ui.player, leaderFoe, terms), 'Paix signée !') }, label.split(' (')[0]);
      })) : null);
  });
  const others = aliveFactions(state).filter((f) => f.id !== ui.player).sort((a, b) => relation(state, ui.player, b.id) - relation(state, ui.player, a.id));
  const rows = others.map((o) => {
    const rel = relation(state, ui.player, o.id);
    const flags = [
      atWar(state, ui.player, o.id) ? '⚔' : null, hasTreaty(state, 'alliance', ui.player, o.id) ? '🛡' : null,
      hasTreaty(state, 'vassal', ui.player, o.id) ? '♛' : null, hasTreaty(state, 'nap', ui.player, o.id) ? '☮' : null,
      hasTreaty(state, 'trade', ui.player, o.id) ? '⇄' : null, hasTreaty(state, 'access', ui.player, o.id) ? '⇢' : null,
    ].filter(Boolean).join(' ');
    return h('tr', { class: 'clickable', onclick: () => ui.select({ type: 'faction', id: o.id }) },
      h('td', {}, h('div', { class: 'row' }, emblem(o, 14), h('span', {}, o.short))),
      h('td', { class: rel >= 20 ? 'good' : rel <= -20 ? 'bad' : '' }, `${Math.round(rel)}`),
      h('td', { class: 'small', 'data-tip': '⚔ guerre · 🛡 alliance · ♛ vassalité · ☮ non-agression · ⇄ commerce · ⇢ passage' }, flags || '—'),
      h('td', { class: 'muted' }, fmt(militaryPower(state, o.id))));
  });
  const offers = state.inbox.filter((i) => i.kind === 'treaty');
  const offerCards = offers.map((item) => h('div', { class: 'card', style: { marginBottom: '6px', borderColor: 'var(--accent-2)' } },
    h('div', { class: 'row' }, emblem(fac(state, item.from), 14), h('b', { class: 'grow small' }, inboxTitle(state, item))),
    h('div', { class: 'muted small' }, `${inboxText(state, item)} · expire dans ${Math.max(0, 60 - (state.day - item.day))} j`),
    h('div', { class: 'row', style: { marginTop: '6px' } },
      h('button', { class: 'btn small good', onclick: () => ui.command(() => { answerInbox(state, item.id, 0); return { ok: true }; }, 'Traité signé.') }, 'Accepter'),
      h('button', { class: 'btn small', onclick: () => ui.command(() => { answerInbox(state, item.id, 1); return { ok: true }; }) }, 'Refuser'))));
  return [
    offers.length ? section('Propositions reçues', offerCards) : null,
    section('Guerres en cours', wars.length ? warCards : h('div', { class: 'muted small' }, 'La galaxie est en paix.')),
    section('Factions', h('table', { class: 'table' }, h('tr', {}, h('th', {}, 'Faction'), h('th', {}, 'Rel.'), h('th', {}, 'Traités'), h('th', {}, 'Puiss.')), rows)),
    h('div', { class: 'muted small', style: { marginTop: '8px' } }, 'Cliquez sur une faction pour négocier, proposer des traités ou déclarer la guerre.'),
  ];
}

// ---------------------------------------------------------------- intelligence

function intelPanel(ui) {
  const { state } = ui;
  const f = fac(state, ui.player);
  const ag = AGENCIES[f.agency];
  if (!ui.opChoice) ui.opChoice = 'recon';
  const targets = opTargets(state, ui.player, ui.opChoice);
  if (!targets.includes(ui.opTarget)) ui.opTarget = targets[0];
  const op = OPS[ui.opChoice];
  const cost = opCost(state, ui.player, ui.opChoice);
  const blocker = ui.opTarget ? opBlocker(state, ui.player, ui.opChoice, ui.opTarget) : 'Aucune cible possible.';
  const chance = ui.opTarget ? opChance(state, ui.player, ui.opChoice, ui.opTarget) : 0;
  const opList = h('div', { class: 'stack', style: { gap: '4px' } }, Object.entries(OPS).map(([id, o]) => h('div', {
    class: `faction-item ${ui.opChoice === id ? 'selected' : ''}`, style: { padding: '5px 8px' }, onclick: () => { ui.opChoice = id; ui.refreshPanels(true); },
  }, h('div', { class: 'grow' }, h('div', { style: { fontWeight: 600, fontSize: '13px' } }, o.name), h('div', { class: 'muted small' }, o.desc)))));
  return [
    h('div', { class: 'card' },
      h('b', {}, ag.name), h('div', { class: 'muted small' }, ag.desc),
      h('div', { class: 'row wrap small', style: { gap: '4px', marginTop: '4px' } }, Object.entries(ag.bonus).map(([k, v]) => h('span', { class: 'tag' }, `${OPS[k]?.name ?? k} +${v}`))),
      h('div', { class: 'grid2', style: { marginTop: '6px' } },
        kv('Renseignement', `${fmt(f.ip)} (${signed(f.ipDay, 1)}/j)`), kv('Agents', `${maxAgents(state, ui.player) - freeAgents(state, ui.player)} / ${maxAgents(state, ui.player)}`),
        kv('Contre-espionnage', counterIntel(state, ui.player))),
    ),
    section('Opérations en cours', f.agents.length ? f.agents.map((a) => h('div', { class: 'row between small' },
      h('span', {}, OPS[a.op].name), h('span', {}, fac(state, a.target)?.short), h('span', { class: 'muted' }, `${a.days} j · ${opChance(state, ui.player, a.op, a.target)} %`)))
      : h('div', { class: 'muted small' }, 'Aucun agent sur le terrain.')),
    section('Nouvelle opération', opList,
      h('div', { class: 'card', style: { marginTop: '6px' } },
        h('div', { class: 'row small' }, 'Cible :', h('select', { onchange: (ev) => { ui.opTarget = ev.target.value; ui.refreshPanels(true); } },
          targets.map((t) => h('option', { value: t, selected: t === ui.opTarget }, fac(state, t).name)))),
        h('div', { class: 'row between small', style: { margin: '6px 0' } },
          h('span', {}, `Coût : ${cost.ip} renseignement · ${fmt(cost.cr)} cr${op.days ? ` · ${op.days} j` : ''}`),
          h('b', { class: chance >= 60 ? 'good' : chance >= 35 ? 'warn' : 'bad' }, `${chance} %`)),
        blocker ? h('div', { class: 'bad small' }, blocker) : null,
        h('button', { class: 'btn primary', disabled: !!blocker, onclick: () => ui.command(() => launchOp(state, ui.player, ui.opChoice, ui.opTarget), op.target === 'self' ? `${op.name} lancée.` : 'Agent déployé.') }, 'Lancer l’opération'))),
    section('Dossiers ouverts', Object.entries(f.intel).filter(([, until]) => until > state.day).map(([id, until]) => h('div', { class: 'row between small' },
      h('span', {}, fac(state, id)?.name), h('span', { class: 'muted' }, `${until - state.day} j`))) || []),
  ];
}

// ---------------------------------------------------------------- research

function researchPanel(ui) {
  const { state } = ui;
  const f = fac(state, ui.player);
  const cur = f.research.current ? TECH_BY_ID[f.research.current] : null;
  const cost = cur ? techCost(state, ui.player, cur.id) : 0;
  const eta = cur && f.rpDay ? Math.ceil((cost - f.research.progress) / f.rpDay) : null;
  const cols = Object.entries(BRANCHES).map(([branch, label]) => h('div', { class: 'tech-col' },
    h('h4', {}, label.toUpperCase()),
    TECHS.filter((t) => t.branch === branch).sort((a, b) => a.tier - b.tier).map((t) => {
      const known = f.techs.includes(t.id);
      const available = canResearch(state, ui.player, t.id);
      const queued = f.research.queue.includes(t.id);
      const current = f.research.current === t.id;
      const cls = known ? 'known' : current ? 'current' : queued ? 'queued' : available ? 'available' : 'locked';
      const tip = `<b>${t.name}</b> (niveau ${t.tier})<br>${t.desc}<br>Coût : ${fmt(techCost(state, ui.player, t.id))} points${t.req.length ? `<br>Prérequis : ${t.req.map((r) => TECH_BY_ID[r].name).join(', ')}` : ''}${!known ? '<br><i>Clic : rechercher · Maj+clic : file d’attente</i>' : ''}`;
      return h('div', {
        class: `tech ${cls}`, 'data-tip': tip,
        onclick: (ev) => {
          if (known) return;
          if (ev.shiftKey || !available) ui.command(() => ({ ok: queueResearch(state, ui.player, t.id) }));
          else ui.command(() => ({ ok: setResearch(state, ui.player, t.id) }));
        },
      }, t.name, h('div', { class: 'cost' }, known ? '✓' : `${fmt(techCost(state, ui.player, t.id))} pts`));
    })));
  return [
    h('div', { class: 'card' },
      cur ? [h('div', { class: 'row between' }, h('b', {}, cur.name), h('span', { class: 'muted small' }, eta ? `≈ ${eta} j` : '')),
        bar(f.research.progress, cost, 'var(--accent)'), h('div', { class: 'muted small', style: { marginTop: '4px' } }, `${fmt(f.research.progress)} / ${fmt(cost)} points · ${fmt1(f.rpDay)} par jour`)]
        : h('div', { class: 'warn' }, 'Aucune recherche en cours : choisissez une technologie.'),
      f.research.queue.length ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, `File : ${f.research.queue.map((id) => TECH_BY_ID[id].name).join(' → ')}`) : null,
      h('div', { class: 'small muted' }, `${f.techs.length} / ${TECHS.length} technologies connues. Les technologies déjà maîtrisées par d’autres factions coûtent moins cher.`),
    ),
    h('div', { class: 'tech-tree', style: { marginTop: '10px' } }, cols),
  ];
}

// ---------------------------------------------------------------- senate

function senatePanel(ui) {
  const { state } = ui;
  const senate = state.senate;
  if (!senate) return h('div', { class: 'muted' }, 'Aucune assemblée galactique à cette époque.');
  if (senate.dissolved) return h('div', { class: 'card' }, h('b', {}, senate.name), h('div', { class: 'muted' }, 'Le Sénat a été dissous. Les gouverneurs régionaux gouvernent désormais par la peur.'));
  const member = isMember(state, ui.player);
  const total = totalSeats(state);
  const res = senate.current;
  let current = null;
  if (res) {
    const t = tally(state);
    const def = RESOLUTIONS[res.type];
    const myVote = res.votes[ui.player];
    current = h('div', { class: 'card', style: { borderColor: 'var(--accent)' } },
      h('div', { class: 'row between' }, h('b', {}, def.name), h('span', { class: 'muted small' }, `${res.days} j restants`)),
      res.target ? h('div', { class: 'small' }, `Cible : ${fac(state, res.target).name}`) : null,
      h('div', { class: 'muted small' }, def.desc),
      h('div', { class: 'small' }, `Proposée par ${fac(state, res.proposer).name}`),
      h('div', { class: 'row small', style: { margin: '6px 0' } },
        h('span', { class: 'good' }, `Pour ${t.yes}`), h('div', { class: 'grow' }, bar(t.yes, Math.max(1, t.yes + t.no), 'var(--good)')), h('span', { class: 'bad' }, `Contre ${t.no}`)),
      h('div', { class: 'muted small' }, `Projection au vu des intentions de vote · ${t.abstain} abstentions`),
      member ? h('div', { class: 'row', style: { marginTop: '6px' } },
        ['yes', 'no', 'abstain'].map((v) => h('button', { class: `btn small ${myVote === v ? 'active' : ''}`, onclick: () => ui.command(() => castVote(state, ui.player, v)) },
          { yes: 'Pour', no: senate.presiding === ui.player ? 'Contre (veto)' : 'Contre', abstain: 'Abstention' }[v]))) : null,
    );
  }
  if (!ui.resChoice) ui.resChoice = 'sanctions';
  const needsTarget = RESOLUTIONS[ui.resChoice].needsTarget;
  const targets = aliveFactions(state).filter((f) => f.id !== ui.player);
  if (needsTarget && !targets.some((f) => f.id === ui.resTarget)) ui.resTarget = targets[0]?.id;
  const blocker = proposalBlocker(state, ui.player, ui.resChoice, needsTarget ? ui.resTarget : null);
  const members = [...senate.members].filter((m) => state.factions[m]?.alive).sort((a, b) => seats(state, b) - seats(state, a));
  return [
    h('div', { class: 'card' },
      h('div', { class: 'row' }, h('img', { src: iconUrl('galactic-senate'), width: 28, height: 28, style: { filter: 'invert(80%) sepia(40%) saturate(600%) hue-rotate(5deg)' }, alt: '' }), h('b', {}, senate.name)),
      kv('Présidence', senate.presiding ? fac(state, senate.presiding)?.name ?? '—' : '—'),
      kv('Sièges', total), kv('Votre délégation', member ? `${seats(state, ui.player)} sièges` : 'non membre'),
      h('div', { class: 'row', style: { marginTop: '6px' } }, member
        ? h('button', { class: 'btn small', onclick: () => ui.command(() => leaveSenate(state, ui.player)) }, 'Quitter le Sénat')
        : h('button', { class: 'btn small primary', onclick: () => ui.command(() => joinSenate(state, ui.player)) }, 'Demander l’adhésion')),
    ),
    section('Résolution en cours', current || h('div', { class: 'muted small' }, 'Aucun vote en cours.')),
    member ? section('Proposer une résolution', h('div', { class: 'card stack' },
      h('select', { onchange: (ev) => { ui.resChoice = ev.target.value; ui.refreshPanels(true); } },
        Object.entries(RESOLUTIONS).map(([id, r]) => h('option', { value: id, selected: id === ui.resChoice }, r.name))),
      h('div', { class: 'muted small' }, RESOLUTIONS[ui.resChoice].desc),
      needsTarget ? h('select', { onchange: (ev) => { ui.resTarget = ev.target.value; ui.refreshPanels(true); } },
        targets.map((f) => h('option', { value: f.id, selected: f.id === ui.resTarget }, f.name))) : null,
      blocker ? h('div', { class: 'bad small' }, blocker) : null,
      h('button', { class: 'btn primary', disabled: !!blocker, onclick: () => ui.command(() => proposeResolution(state, ui.player, ui.resChoice, needsTarget ? ui.resTarget : null), 'Résolution soumise au vote.') }, 'Soumettre au vote'),
    )) : null,
    section('Résolutions en vigueur', senate.active.length ? senate.active.map((r) => h('div', { class: 'row between small' },
      h('span', {}, `${RESOLUTIONS[r.type].name}${r.target ? ` — ${fac(state, r.target)?.short}` : ''}`), h('span', { class: 'muted' }, `${r.until - state.day} j`)))
      : h('div', { class: 'muted small' }, 'Aucune.')),
    section('Membres', members.map((m) => h('div', { class: 'row small', style: { padding: '2px 0' } }, emblem(fac(state, m), 12), h('span', { class: 'grow' }, fac(state, m).short),
      h('div', { style: { width: '90px' } }, bar(seats(state, m), total, fac(state, m).color)), h('span', { class: 'muted' }, seats(state, m))))),
    section('Historique', senate.history.slice(0, 10).map((r) => h('div', { class: 'small', style: { padding: '2px 0' } },
      h('span', { class: r.passed ? 'good' : 'bad' }, r.passed ? '✓ ' : r.vetoed ? '⛔ ' : '✕ '),
      `${RESOLUTIONS[r.type].name}${r.target ? ` (${fac(state, r.target)?.short ?? '?'})` : ''} — ${r.yes}/${r.no}`))),
  ];
}

// ---------------------------------------------------------------- politics

function politicsPanel(ui) {
  const { state } = ui;
  const f = fac(state, ui.player);
  const g = GOVERNMENTS[f.gov];
  const img = leaderImage(f.leader);
  const factors = stabilityFactors(state, ui.player);
  const goal = goalProgress(state, ui.player);
  const share = gdpShare(state, ui.player);
  const target = dominationTarget(state, ui.player);
  return [
    h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '12px' } },
      img ? holoPic(img, { width: 84, height: 110 }) : h('span', { class: 'emblem', style: { width: '84px', height: '84px' }, html: emblemSvg(f, 54) }),
      h('div', { class: 'stack', style: { gap: '3px' } },
        h('b', { style: { color: f.color } }, f.name), h('div', {}, f.leader), h('div', { class: 'muted small' }, g.name),
        h('div', { class: 'small muted' }, g.desc),
        f.capital ? h('div', { class: 'small' }, `Capitale : ${staticSystem(f.capital).name}`) : h('div', { class: 'bad small' }, 'Gouvernement en exil'))),
    section('Stabilité nationale',
      h('div', { class: 'row' }, h('div', { class: 'grow' }, bar(f.stability, 100, f.stability < 30 ? 'var(--bad)' : f.stability < 50 ? 'var(--warn)' : 'var(--good)')), h('b', {}, `${Math.round(f.stability)} %`)),
      h('div', { class: 'card small', style: { marginTop: '6px' } }, factors.map(([k, v]) => kv(k, signed(v, 1), v >= 0 ? 'good' : 'bad')),
        kv('Cible nationale', fmt1(f.stabilityTarget)), h('div', { class: 'muted' }, 'Chaque système ajoute ses bâtiments, la distance à la capitale, l’occupation et la sympathie insurgée.')),
      kv('Lassitude de guerre', `${Math.round(f.warWeariness)} / 100`, f.warWeariness > 40 ? 'bad' : ''),
      g.elections ? kv('Soutien populaire', `${Math.round(approval(state, ui.player))} %`) : null,
      g.elections && f.nextElection ? kv('Prochaines élections', `dans ${Math.max(0, f.nextElection - state.day)} jours`) : null,
    ),
    section('Décisions', Object.entries(DECISIONS).map(([id, d]) => {
      const blocker = decisionBlocker(state, ui.player, id);
      if (blocker && (blocker.startsWith('Réservé') || blocker === 'Conditions non remplies.')) return null;
      const cost = decisionCost(state, ui.player, id);
      return h('div', { class: 'card', style: { marginBottom: '5px', padding: '7px 9px' } },
        h('div', { class: 'row between' }, h('b', { class: 'small' }, d.name),
          h('button', { class: 'btn small', disabled: !!blocker, 'data-tip': blocker || null, onclick: () => ui.command(() => takeDecision(state, ui.player, id), `${d.name} : décision appliquée.`) }, cost ? `${fmt(cost)} cr` : 'Appliquer')),
        h('div', { class: 'muted small' }, d.desc), blocker ? h('div', { class: 'warn small' }, blocker) : null);
    })),
    section('Effets temporaires', f.modifiers.filter((m) => m.until > state.day).length ? f.modifiers.filter((m) => m.until > state.day).map((m) => h('div', { class: 'row between small' },
      h('span', {}, m.name), h('span', { class: 'muted' }, `${m.until - state.day} j`))) : h('div', { class: 'muted small' }, 'Aucun.')),
    section('Objectifs',
      goal ? h('div', { class: 'card small' }, h('b', { class: 'accent' }, goal.text), h('div', { class: goal.done ? 'good' : 'muted' }, goal.detail)) : null,
      h('div', { class: 'card small' }, h('b', {}, 'Domination galactique'), h('div', { class: 'muted' }, `Produire ${Math.round(target * 100)} % de la richesse galactique (actuellement ${Math.round(share * 100)} %).`), bar(share * 100, target * 100, 'var(--accent)'))),
  ];
}

// ---------------------------------------------------------------- alert

function alertPanel(ui) {
  const { state } = ui;
  const lvl = alertLevel(state);
  const weapons = state.superweapons;
  return [
    h('div', { class: 'alert-big' }, [5, 4, 3, 2, 1].map((l) => h('div', {
      class: `lvl ${l === lvl ? 'on' : ''}`, style: l === lvl ? { background: ALERT_COLORS[l], color: '#000' } : {}, 'data-tip': `<b>${ALERT_LEVELS[l].name}</b><br>${ALERT_LEVELS[l].desc}`,
    }, String(l), h('small', {}, ALERT_LEVELS[l].name.split(' ')[0])))),
    h('div', { class: 'card', style: { marginTop: '10px' } },
      h('b', { style: { color: ALERT_COLORS[lvl] } }, `Niveau ${lvl} — ${ALERT_LEVELS[lvl].name}`),
      h('div', { class: 'muted small' }, ALERT_LEVELS[lvl].desc),
      h('div', { class: 'row small', style: { marginTop: '6px' } }, 'Tension', h('div', { class: 'grow' }, bar(state.tension, 100, ALERT_COLORS[lvl])), h('b', {}, Math.round(state.tension))),
      kv('Tendance', `vers ${Math.round(tensionTarget(state))}`),
      h('div', { class: 'muted small', style: { marginTop: '6px' } }, 'La tension monte avec les guerres, les mobilisations, les superarmes armées, les assassinats et les bombardements. Elle retombe lentement en temps de paix ou après un traité d’interdiction du Sénat.'),
    ),
    section('Armes de destruction massive', weapons.length ? weapons.map((sw) => {
      const loc = swLocation(state, sw);
      const own = sw.owner === ui.player;
      const plans = Object.keys(sw.plans).filter((k) => sw.plans[k]);
      return h('div', { class: 'card', style: { marginBottom: '6px' } },
        h('div', { class: 'row' }, h('img', { src: unitImage('imperial', 'battlestation') || '', style: { width: '54px', height: '40px', objectFit: 'cover', borderRadius: '4px' }, alt: '' }),
          h('div', { class: 'grow' }, h('b', {}, sw.name), h('div', { class: 'small', style: { color: fac(state, sw.owner).color } }, fac(state, sw.owner).name))),
        kv('Position', loc ? staticSystem(loc).name : 'en hyperespace'),
        kv('Charge', `${Math.floor(sw.charge * 100)} %`, sw.charge >= 1 ? 'bad' : ''),
        kv('Niveau requis', `alerte ${SW_TYPES[sw.type].level} ou moins`),
        kv('Tirs', sw.fired),
        plans.length ? h('div', { class: plans.includes(ui.player) ? 'good small' : 'warn small' }, `Plans dérobés par : ${plans.map((p) => fac(state, p)?.short).join(', ')}`) : null,
        own ? h('div', { class: 'muted small' }, SW_TYPES[sw.type].fixed
          ? 'Sélectionnez n’importe quel système ennemi sur la carte pour faire feu.'
          : 'Déplacez la station jusqu’au système visé, puis faites feu depuis la fiche du système.') : null,
        !own && !plans.includes(ui.player) ? h('div', { class: 'muted small' }, 'Volez ses plans (Renseignement) : vos chasseurs pourront viser son point faible.') : null,
      );
    }) : h('div', { class: 'muted small' }, 'Aucune superarme connue dans la galaxie.')),
    section('Base Delta Zéro', h('div', { class: 'muted small' }, 'Avec la doctrine adéquate et un vaisseau capital en orbite d’une planète ennemie sans défense spatiale, vous pouvez la bombarder (niveau d’alerte 3 ou moins) depuis la fiche du groupe. Les conséquences diplomatiques sont lourdes.')),
    h('button', { class: 'btn', style: { marginTop: '10px' }, disabled: !!decisionBlocker(state, ui.player, 'mobilization'),
      onclick: () => ui.command(() => takeDecision(state, ui.player, 'mobilization'), 'Mobilisation générale décrétée.') }, `Décréter la mobilisation générale (${fmt(decisionCost(state, ui.player, 'mobilization'))} cr)`),
  ];
}

// ---------------------------------------------------------------- ledger

function ledgerPanel(ui) {
  const { state } = ui;
  const rows = aliveFactions(state).map((f) => ({
    f, gdp: f.econ?.gdp || 0, power: militaryPower(state, f.id), systems: Object.values(state.systems).filter((s) => s.controller === f.id).length,
  }));
  const score = (r) => r.gdp * 2 + r.power * 0.4 + r.systems * 30 + r.f.techs.length * 40;
  rows.sort((a, b) => score(b) - score(a));
  const canvas = h('canvas', { width: 740, height: 300, style: { width: '100%', height: '150px', background: 'rgba(0,0,0,0.25)', borderRadius: '6px' } });
  requestAnimationFrame(() => drawHistory(state, canvas, rows.slice(0, 6).map((r) => r.f), ui.ledgerMetric || 0));
  return [
    h('table', { class: 'table' },
      h('tr', {}, h('th', {}, '#'), h('th', {}, 'Faction'), h('th', {}, 'PIB/j'), h('th', {}, 'Puiss.'), h('th', {}, 'Sys.'), h('th', {}, 'Tech.'), h('th', {}, 'Stab.')),
      rows.map((r, i) => h('tr', { class: 'clickable', style: r.f.id === ui.player ? { background: 'rgba(255,200,87,0.08)' } : {}, onclick: () => ui.select({ type: 'faction', id: r.f.id }) },
        h('td', {}, i + 1), h('td', {}, h('div', { class: 'row' }, emblem(r.f, 12), r.f.short)), h('td', {}, fmt(r.gdp)), h('td', {}, fmt(r.power)),
        h('td', {}, r.systems), h('td', {}, r.f.techs.length), h('td', {}, `${Math.round(r.f.stability)}`)))),
    section('Évolution', h('div', { class: 'row', style: { marginBottom: '4px' } }, ['PIB', 'Puissance militaire', 'Systèmes'].map((label, i) => h('button', {
      class: `btn small ${(ui.ledgerMetric || 0) === i ? 'active' : ''}`, onclick: () => { ui.ledgerMetric = i; ui.refreshPanels(true); },
    }, label))), canvas),
    h('div', { class: 'muted small' }, `Époque : ${yearLabel(state.startYear)} → ${yearLabel(state.startYear + Math.floor(state.day / DAYS_PER_YEAR))}`),
  ];
}

function drawHistory(state, canvas, factions, metric) {
  const g = canvas.getContext('2d');
  const w = canvas.width;
  const hgt = canvas.height;
  g.clearRect(0, 0, w, hgt);
  const hist = state.history;
  if (hist.length < 2) {
    g.fillStyle = '#8d9ab3';
    g.font = '22px "Exo 2"';
    g.fillText('Les courbes apparaîtront après quelques mois de jeu.', 20, hgt / 2);
    return;
  }
  let max = 1;
  for (const snap of hist) for (const f of factions) max = Math.max(max, snap.f[f.id]?.[metric] || 0);
  for (const f of factions) {
    g.strokeStyle = f.color;
    g.lineWidth = f.isPlayer ? 4 : 2;
    g.beginPath();
    hist.forEach((snap, i) => {
      const v = snap.f[f.id]?.[metric] || 0;
      const x = (i / (hist.length - 1)) * (w - 20) + 10;
      const y = hgt - 10 - (v / max) * (hgt - 20);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
}

// ---------------------------------------------------------------- news

function newsPanel(ui) {
  const { state } = ui;
  const items = state.news.filter((n) => playerSees(state, n)).slice(-150).reverse();
  return h('div', { class: 'news-log' }, items.map((n) => h('div', {
    class: 'news-item', style: n.sys ? { cursor: 'pointer' } : {}, onclick: () => { if (n.sys) ui.focusSystem(n.sys); },
  }, h('span', { class: 'day' }, `J${n.day}`), h('span', { class: n.important ? '' : 'muted' }, n.text))));
}


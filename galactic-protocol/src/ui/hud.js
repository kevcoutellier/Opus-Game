// Top command bar: faction, treasury and resources, stability, alert level, date and speed.
import { RES, RES_INFO } from '../engine/economy.js';
import { formatDate } from '../engine/query.js';
import { ALERT_LEVELS, alertLevel } from '../engine/superweapons.js';
import { h, icon, fmt, signed } from './dom.js';
import { emblemSvg } from './emblems.js';
import { openMenu } from './modals.js';
import { audio } from '../audio/audio.js';

export const ALERT_COLORS = { 5: '#4fa3ff', 4: '#5fe08a', 3: '#ffd35a', 2: '#ff9a3c', 1: '#ff3b3b' };

function chip(key, tip) {
  const v = h('span', { class: 'v' });
  const d = h('span', { class: 'd' });
  const el = h('div', { class: 'chip', 'data-tip': tip }, h('span', { class: 'k' }, key), v, d);
  return { el, v, d };
}

export function buildHud(ui) {
  const state = ui.state;
  const f = state.factions[ui.player];
  const emblem = h('span', { class: 'emblem', style: { width: '40px', height: '40px' }, html: emblemSvg(f, 26) });
  const name = h('div', { class: 'name', style: { color: f.color } }, f.name);
  const leader = h('div', { class: 'leader' }, f.leader);
  const faction = h('div', { class: 'hud-faction', onclick: () => ui.openPanel('politics'), 'data-tip': 'Gouvernement et politique intérieure' }, emblem, h('div', {}, name, leader));
  const chips = {
    cr: chip('Crédits', 'Trésorerie et solde quotidien'),
    stab: chip('Stabilité', 'Stabilité nationale (moyenne pondérée des systèmes)'),
    mp: chip('Effectifs', 'Réserve de recrues pour les troupes'),
    rp: chip('Recherche', 'Points de recherche par jour'),
    ip: chip('Renseign.', 'Points de renseignement disponibles'),
  };
  for (const r of RES) chips[r] = chip(RES_INFO[r].short, `${RES_INFO[r].name} : stock, production nette par jour`);
  const res = h('div', { class: 'hud-res' }, Object.values(chips).map((c) => c.el));
  const levels = [5, 4, 3, 2, 1].map((l) => h('div', { class: 'lvl' }, String(l)));
  const alertLabel = h('div', { class: 'label' });
  const defcon = h('div', { class: 'defcon', onclick: () => ui.openPanel('alert') }, levels, alertLabel);
  const date = h('div', { class: 'date' });
  const speedBtns = [];
  const speeds = h('div', { class: 'speed' });
  const pause = h('button', { class: 'btn icon', onclick: () => { audio.click(); ui.togglePause(); }, 'data-tip': 'Pause (Espace)' });
  for (let s = 1; s <= 5; s++) {
    const b = h('button', { class: 'btn', onclick: () => { audio.click(); ui.setSpeed(s); }, 'data-tip': `Vitesse ${s} (touche ${s})` }, String(s));
    speedBtns.push(b);
    speeds.append(b);
  }
  const soundBtn = h('button', { class: 'btn icon ghost', 'data-tip': 'Son', onclick: () => { audio.toggleMute(); update(); } });
  const menuBtn = h('button', { class: 'btn icon ghost', html: icon('menu'), 'data-tip': 'Menu (sauvegarder, charger, quitter)', onclick: () => openMenu(ui) });
  const el = h('header', { id: 'hud' }, faction, res, defcon, h('div', { class: 'clock' }, pause, date, speeds), soundBtn, menuBtn);

  function update() {
    const e = f.econ || {};
    chips.cr.v.textContent = fmt(f.treasury);
    const net = (e.net || 0) + (e.market || 0);
    chips.cr.d.textContent = `${signed(net)}/j`;
    chips.cr.d.className = `d ${net >= 0 ? 'good' : 'bad'}`;
    chips.cr.v.className = `v ${f.treasury < 0 ? 'bad' : ''}`;
    chips.stab.v.textContent = `${Math.round(f.stability)} %`;
    chips.stab.v.className = `v ${f.stability < 30 ? 'bad' : f.stability < 50 ? 'warn' : 'good'}`;
    chips.stab.d.textContent = f.warWeariness > 1 ? `lassitude ${Math.round(f.warWeariness)}` : '';
    chips.stab.d.className = 'd muted';
    chips.mp.v.textContent = fmt(f.manpower);
    chips.mp.d.textContent = `${signed(e.mp || 0, 1)}/j`;
    chips.mp.d.className = 'd muted';
    chips.rp.v.textContent = `${Math.round(f.rpDay || 0)}/j`;
    chips.rp.d.textContent = f.research.current ? 'en cours' : 'inactive';
    chips.rp.d.className = `d ${f.research.current ? 'muted' : 'warn'}`;
    chips.ip.v.textContent = fmt(f.ip);
    chips.ip.d.textContent = `${signed(f.ipDay || 0, 1)}/j`;
    chips.ip.d.className = 'd muted';
    for (const r of RES) {
      const netR = (e.prod?.[r] || 0) - (e.use?.[r] || 0);
      chips[r].v.textContent = fmt(f.res[r]);
      chips[r].v.className = `v ${f.deficit[r] ? 'bad' : ''}`;
      chips[r].d.textContent = `${signed(netR, 1)}/j`;
      chips[r].d.className = `d ${netR < -0.05 ? 'bad' : 'muted'}`;
    }
    const lvl = alertLevel(state);
    levels.forEach((node, i) => {
      const l = 5 - i;
      const on = l === lvl;
      node.className = `lvl ${on ? 'on' : ''}`;
      node.style.background = on ? ALERT_COLORS[l] : '';
    });
    alertLabel.innerHTML = `ALERTE<br><span style="color:${ALERT_COLORS[lvl]}">${ALERT_LEVELS[lvl].name}</span>`;
    defcon.dataset.tip = `<b>Niveau d’alerte galactique ${lvl}</b><br>${ALERT_LEVELS[lvl].desc}<br>Tension : ${Math.round(state.tension)} / 100`;
    date.textContent = formatDate(state).label;
    pause.innerHTML = icon(ui.speed ? 'pause' : 'play', 16);
    pause.classList.toggle('active', !ui.speed);
    speedBtns.forEach((b, i) => b.classList.toggle('active', ui.speed === i + 1));
    soundBtn.innerHTML = icon(audio.muted ? 'mute' : 'sound', 18);
  }

  return { el, update };
}

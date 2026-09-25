// Modal windows: inbox (events, proposals, calls to arms), menu, confirmations, end of game.
import { eventDef } from '../engine/events.js';
import { answerInbox, inboxText, inboxTitle, gdpShare } from '../engine/sim.js';
import { fac, formatDate } from '../engine/query.js';
import { SLOTS, listSaves, loadGame, saveGame } from '../engine/save.js';
import { eventImage, leaderImage } from '../assetSources.js';
import { h, esc, fmt } from './dom.js';
import { emblemSvg } from './emblems.js';
import { helpModal } from './help.js';
import { audio } from '../audio/audio.js';

let open = null;

export const isModalOpen = () => !!open;

export function closeModal() {
  if (open) open.remove();
  open = null;
}

export function modal({ title, image = null, emblem = null, body, actions = [], wide = false, dismissable = false }) {
  closeModal();
  const overlay = h('div', { class: 'overlay', onclick: (e) => { if (dismissable && e.target === overlay) closeModal(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}` },
      image ? h('img', { class: 'modal-img', src: image, alt: '' }) : null,
      h('div', { class: 'modal-head' }, emblem, h('h3', {}, title)),
      h('div', { class: 'modal-body' }, body),
      actions.length ? h('div', { class: 'modal-actions' }, actions) : null,
    ));
  document.getElementById('ui').append(overlay);
  open = overlay;
  return overlay;
}

function action(label, tip, onclick, cls = '') {
  return h('button', { class: `btn ${cls}`, onclick }, label, tip ? h('span', { class: 'tip' }, tip) : null);
}

export function showInbox(ui, item) {
  const state = ui.state;
  audio.notify();
  const done = (choice) => {
    closeModal();
    audio.click();
    answerInbox(state, item.id, choice);
    ui.map.dirty = true;
    ui.refreshAll();
    ui.flushNews();
    ui.checkInbox();
  };
  if (item.kind === 'event') {
    const def = eventDef(item);
    modal({
      title: def.title,
      image: eventImage(item.event),
      body: h('p', {}, def.text(state, state.player, item.ctx)),
      actions: def.options.map((o, i) => action(o.label, o.tip, () => done(i), i === 0 ? 'primary' : '')),
    });
    return;
  }
  const from = item.from ? fac(state, item.from) : null;
  const img = from ? leaderImage(from.leader) : null;
  const yes = { treaty: 'Accepter', peace: 'Signer la paix', call: 'Honorer l’alliance', peacekeeping: 'Rejoindre la force de paix' }[item.kind];
  const no = { treaty: 'Refuser', peace: 'Rejeter', call: 'Refuser (l’alliance sera rompue)', peacekeeping: 'Rester neutre' }[item.kind];
  modal({
    title: inboxTitle(state, item),
    emblem: from ? h('span', { class: 'emblem', style: { width: '40px', height: '40px' }, html: emblemSvg(from, 26) }) : null,
    body: h('div', { class: 'row', style: { alignItems: 'flex-start', gap: '12px' } },
      img ? h('img', { class: 'portrait', src: img, alt: '' }) : null,
      h('p', { style: { margin: 0 } }, inboxText(state, item))),
    actions: [action(yes, null, () => done(0), 'primary'), action(no, null, () => done(1))],
  });
}

export function confirmModal(ui, title, text, onOk) {
  modal({
    title,
    body: h('p', {}, text),
    dismissable: true,
    actions: [action('Confirmer', null, () => { closeModal(); onOk(); }, 'danger'), action('Annuler', null, () => closeModal())],
  });
}

export function showGameOver(ui) {
  const state = ui.state;
  const go = state.gameOver;
  const f = fac(state, state.player);
  const win = go.result === 'victory';
  if (win) audio.playTheme();
  modal({
    title: win ? 'VICTOIRE' : 'DÉFAITE',
    emblem: h('span', { class: 'emblem', style: { width: '44px', height: '44px' }, html: emblemSvg(f, 28) }),
    body: h('div', { class: 'stack' },
      h('p', { style: { fontSize: '16px' } }, go.reason),
      h('div', { class: 'muted' }, `${formatDate(state).label} · ${Math.round(gdpShare(state, state.player) * 100)} % de la richesse galactique · ${fmt(f.stats.kills)} cr de pertes infligées`)),
    actions: [
      win ? action('Continuer à jouer', 'La partie continue en mode libre.', () => closeModal(), 'primary') : null,
      action('Retour au menu principal', null, () => { closeModal(); quitToTitle(ui); }),
    ].filter(Boolean),
  });
}

export function quitToTitle(ui) {
  ui.quit();
  ui.app.showTitle();
}

export function openMenu(ui) {
  const wasSpeed = ui.speed;
  ui.setSpeed(0);
  const saves = listSaves();
  const slotRow = (slot) => {
    const meta = saves.find((m) => m.slot === slot);
    return h('div', { class: 'row between card', style: { padding: '6px 10px' } },
      h('div', {}, h('b', {}, slot === 'auto' ? 'Automatique' : `Emplacement ${slot}`),
        h('div', { class: 'muted small' }, meta ? `${esc(meta.name)} · jour ${meta.day} · ${new Date(meta.savedAt).toLocaleString('fr-FR')}` : 'vide')),
      h('div', { class: 'row' },
        slot !== 'auto' ? h('button', { class: 'btn small', onclick: () => { if (saveGame(ui.state, slot)) { ui.flash('Partie sauvegardée.', true); openMenu(ui); } else ui.flash('Sauvegarde impossible (stockage plein ?)'); } }, 'Sauver') : null,
        meta ? h('button', { class: 'btn small', onclick: () => {
          const state = loadGame(slot);
          if (!state) return;
          closeModal();
          ui.quit();
          ui.app.startGame(state, { fresh: false });
        } }, 'Charger') : null));
  };
  modal({
    title: 'Menu',
    dismissable: true,
    body: h('div', { class: 'stack' }, SLOTS.map(slotRow)),
    actions: [
      action('Reprendre', null, () => { closeModal(); ui.setSpeed(wasSpeed); }, 'primary'),
      action('Comment jouer', null, () => helpModal(ui.app)),
      action('Quitter vers le menu principal', 'La partie en cours est sauvegardée automatiquement.', () => { saveGame(ui.state, 'auto'); closeModal(); quitToTitle(ui); }),
    ],
  });
}

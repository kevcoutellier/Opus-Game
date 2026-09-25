// In-game controller: real-time loop with pause and speeds, map input, notifications and autosave.
import { advanceDay } from '../engine/sim.js';
import { refreshEconomy } from '../engine/economy.js';
import { planPath, orderMove } from '../engine/military.js';
import { playerSees } from '../engine/news.js';
import { saveGame } from '../engine/save.js';
import { staticSystem } from '../engine/query.js';
import { h, clear, hideTooltip } from './dom.js';
import { preloadEmblems } from './emblems.js';
import { buildHud } from './hud.js';
import { PANELS, renderPanel } from './panels.js';
import { renderDetails } from './details.js';
import { showInbox, showGameOver, isModalOpen } from './modals.js';
import { helpModal } from './help.js';
import { MAP_MODES } from '../render/map.js';
import { audio } from '../audio/audio.js';

const SPEEDS = [0, 1, 2.5, 6, 14, 30]; // Days per second.

export async function startGame(app, state, { fresh }) {
  await preloadEmblems(Object.values(state.factions));
  const ui = new GameUI(app, state);
  app.game = ui;
  ui.mount();
  if (fresh) ui.toast({ text: 'La partie est en pause. Appuyez sur Espace ou choisissez une vitesse pour lancer le temps.', kind: 'info' });
}

export class GameUI {
  constructor(app, state) {
    this.app = app;
    this.map = app.map;
    this.state = state;
    this.player = state.player;
    this.speed = 0;
    this.lastSpeed = 2;
    this.panel = null;
    this.selection = null;
    this.moveMode = false;
    this.acc = 0;
    this.newsSeen = state.news.length;
    this.lastPanelRefresh = 0;
    this.frame = 0;
    this.pointers = new Map();
  }

  // ------------------------------------------------------------ setup

  mount() {
    const root = clear(this.app.root);
    this.hud = buildHud(this);
    this.nav = h('nav', { id: 'nav' });
    this.left = h('section', { class: 'side left', style: { display: 'none' } });
    this.right = h('section', { class: 'side right', style: { display: 'none' } });
    this.toasts = h('div', { id: 'toasts' });
    this.minimap = h('canvas', { id: 'minimap', width: 340, height: 340 });
    this.modes = h('div', { class: 'modes' });
    this.tickerMsg = h('span', { class: 'msg' }, '');
    this.bottom = h('div', { id: 'bottom' },
      this.modes,
      h('div', { class: 'ticker', onclick: () => this.openPanel('news'), 'data-tip': 'Journal HoloNet' }, h('span', { class: 'holo' }, 'HOLONET'), this.tickerMsg),
    );
    root.append(this.hud.el, this.nav, this.left, this.right, this.bottom, this.minimap, this.toasts);
    this.buildNav();
    this.buildModes();
    this.map.setState(this.state);
    this.map.selection = null;
    const cap = this.state.factions[this.player].capital;
    if (cap) this.map.centerOn(cap, 1.05);
    this.bindInput();
    this.updateTicker();
    audio.stopTheme();
    audio.startAmbient();
    refreshEconomy(this.state);
    this.hud.update();
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.loop(t));
    this.checkInbox();
  }

  buildNav() {
    clear(this.nav);
    this.navButtons = {};
    for (const [id, p] of Object.entries(PANELS)) {
      if (p.hidden) continue;
      const btn = h('button', { class: this.panel === id ? 'active' : '', onclick: () => this.togglePanel(id), 'data-tip': `<b>${p.title}</b><br>${p.tip}` },
        h('span', { html: p.icon }), p.short);
      this.navButtons[id] = btn;
      this.nav.append(btn);
    }
  }

  buildModes() {
    clear(this.modes);
    for (const [id, label] of Object.entries(MAP_MODES)) {
      if (id === 'sympathy' && !this.state.insurgency) continue;
      this.modes.append(h('button', {
        class: `btn small ${this.map.mode === id ? 'active' : ''}`,
        onclick: () => {
          this.map.mode = id;
          this.map.dirty = true;
          this.buildModes();
        },
      }, label));
    }
  }

  // ------------------------------------------------------------ loop

  loop(t) {
    if (!this.running) return;
    const dt = Math.min(0.25, (t - this.lastTime) / 1000);
    this.lastTime = t;
    if (this.speed > 0 && !isModalOpen() && !this.state.gameOverPending) {
      this.acc += dt * SPEEDS[this.speed];
      let steps = Math.floor(this.acc);
      this.acc -= steps;
      steps = Math.min(steps, 3);
      for (let i = 0; i < steps; i++) {
        advanceDay(this.state);
        this.afterDay();
        if (isModalOpen() || this.speed === 0) break;
      }
    }
    this.consumeFx();
    this.map.draw();
    if (this.frame++ % 6 === 0) this.map.drawMinimap(this.minimap);
    requestAnimationFrame((time) => this.loop(time));
  }

  afterDay() {
    const state = this.state;
    this.hud.update();
    this.flushNews();
    if (state.day % 90 === 0) saveGame(state, 'auto');
    if (performance.now() - this.lastPanelRefresh > 900) this.refreshPanels();
    this.checkInbox();
    if (state.gameOver && !state.gameOver.shown) {
      state.gameOver.shown = true;
      this.setSpeed(0);
      showGameOver(this);
    }
  }

  consumeFx() {
    const fx = this.state.fx;
    if (!fx?.length) return;
    const vis = this.map.visible();
    for (const e of fx) {
      this.map.addEffect(e);
      const seen = vis.has(e.sys) || vis.has(e.to);
      if (e.type === 'superlaser') audio.superlaser();
      else if (e.type === 'explosion' && e.big) audio.explosion(true);
      else if (seen && (e.type === 'battle' || e.type === 'ground')) audio.laser();
      else if (e.type === 'bdz' && seen) audio.explosion(false);
    }
    this.state.fx = [];
  }

  setSpeed(speed) {
    if (speed > 0) this.lastSpeed = speed;
    this.speed = speed;
    this.hud.update();
    if (speed > 0) audio.ensure();
  }

  togglePause() {
    this.setSpeed(this.speed ? 0 : this.lastSpeed);
  }

  // ------------------------------------------------------------ news, toasts, inbox

  flushNews() {
    const items = this.state.news;
    if (this.newsSeen > items.length) this.newsSeen = 0;
    for (let i = this.newsSeen; i < items.length; i++) {
      const item = items[i];
      if (!playerSees(this.state, item)) continue;
      if (item.important) {
        this.toast(item);
        if (item.kind === 'war' && item.text.includes(this.state.factions[this.player].name)) audio.klaxon();
        else if (item.kind === 'alert') audio.klaxon();
        else audio.notify();
      }
    }
    this.newsSeen = items.length;
    this.updateTicker();
  }

  updateTicker() {
    const last = [...this.state.news].reverse().find((n) => playerSees(this.state, n));
    this.tickerMsg.textContent = last ? last.text : '';
  }

  toast(item) {
    const el = h('div', { class: `toast ${item.kind || ''}`, onclick: () => {
      if (item.onclick) item.onclick();
      else if (item.sys) this.focusSystem(item.sys);
      el.remove();
    } }, item.text);
    this.toasts.prepend(el);
    while (this.toasts.children.length > 4) this.toasts.lastChild.remove();
    setTimeout(() => el.remove(), 7000);
  }

  flash(msg, ok = false) {
    this.toast({ text: msg, kind: ok ? 'peace' : 'war' });
    if (ok) audio.confirm();
    else audio.error();
  }

  /** Events, peace offers and calls to arms open a window (and pause); treaty offers wait in the Diplomacy panel. */
  checkInbox() {
    for (const item of this.state.inbox) {
      if (item.kind === 'treaty' && !item.notified) {
        item.notified = true;
        this.toast({ text: `${this.state.factions[item.from].name} vous propose un traité (voir Diplomatie).`, kind: 'senate', onclick: () => this.openPanel('diplomacy') });
        audio.notify();
        this.refreshPanels(true);
      }
    }
    if (isModalOpen()) return;
    const blocking = this.state.inbox.find((i) => i.kind !== 'treaty');
    if (blocking) showInbox(this, blocking);
  }

  // ------------------------------------------------------------ commands

  /** Runs a player command returning { ok, msg } and refreshes the interface. */
  command(fn, success = null) {
    const res = fn() || { ok: true };
    if (res.ok === false) this.flash(res.msg || 'Action impossible.');
    else {
      if (res.accepted === false) this.flash(res.msg || 'Proposition refusée.');
      else if (success || res.accepted) this.flash(success || 'Proposition acceptée !', true);
      else audio.confirm();
    }
    refreshEconomy(this.state);
    this.map.dirty = true;
    this.refreshAll();
    this.checkInbox();
    return res;
  }

  refreshAll() {
    this.hud.update();
    this.refreshPanels(true);
  }

  refreshPanels(force = false) {
    this.lastPanelRefresh = performance.now();
    const busy = (el) => el.contains(document.activeElement) && ['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName);
    if (this.panel && (force || (!busy(this.left) && !this.leftPointer))) renderPanel(this, this.panel, this.left);
    if (this.selection && (force || (!busy(this.right) && !this.rightPointer))) renderDetails(this, this.selection, this.right);
    for (const [id, btn] of Object.entries(this.navButtons)) {
      btn.classList.toggle('active', this.panel === id);
      const badge = PANELS[id].badge?.(this);
      const existing = btn.querySelector('.badge');
      if (badge && !existing) btn.append(h('span', { class: 'badge' }, badge));
      else if (badge && existing) existing.textContent = badge;
      else if (!badge && existing) existing.remove();
    }
  }

  togglePanel(id) {
    audio.click();
    if (this.panel === id) this.closePanel();
    else this.openPanel(id);
  }

  openPanel(id) {
    this.panel = id;
    this.left.style.display = 'flex';
    this.refreshPanels(true);
  }

  closePanel() {
    this.panel = null;
    this.left.style.display = 'none';
    this.refreshPanels(true);
  }

  select(selection) {
    this.selection = selection;
    this.map.selection = selection;
    this.moveMode = false;
    this.map.pathPreview = null;
    if (selection) {
      this.right.style.display = 'flex';
      renderDetails(this, selection, this.right);
    } else this.right.style.display = 'none';
  }

  focusSystem(sysId) {
    this.map.centerOn(sysId, Math.max(this.map.cam.zoom, 1.2));
    this.select({ type: 'system', id: sysId });
  }

  focusStack(stackId) {
    const st = this.state.stacks[stackId];
    if (!st) return;
    this.map.centerOn(st.move ? st.move.to : st.sys, Math.max(this.map.cam.zoom, 1.2));
    this.select({ type: 'stack', id: stackId });
  }

  startMove() {
    this.moveMode = true;
    this.toast({ text: 'Cliquez sur le système de destination (ou clic droit).', kind: 'info' });
  }

  moveSelectedTo(sysId) {
    const st = this.selection?.type === 'stack' ? this.state.stacks[this.selection.id] : null;
    if (!st || st.owner !== this.player) return false;
    const res = orderMove(this.state, st.id, sysId);
    if (!res.ok) this.flash(res.msg);
    else {
      audio.select();
      this.toast({ text: `${st.name} fait route vers ${staticSystem(sysId).name} (${res.days} j).`, kind: 'info' });
    }
    this.moveMode = false;
    this.map.pathPreview = null;
    renderDetails(this, this.selection, this.right);
    return true;
  }

  quit() {
    this.running = false;
    audio.stopAmbient();
    hideTooltip();
    window.removeEventListener('keydown', this.onKey);
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const canvas = this.map.canvas;
    const pos = (e) => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    this.left.addEventListener('pointerdown', () => { this.leftPointer = true; });
    this.right.addEventListener('pointerdown', () => { this.rightPointer = true; });
    window.addEventListener('pointerup', () => {
      this.leftPointer = false;
      this.rightPointer = false;
    });
    canvas.onpointerdown = (e) => {
      canvas.setPointerCapture(e.pointerId);
      const [x, y] = pos(e);
      this.pointers.set(e.pointerId, { x, y, sx: x, sy: y, moved: false, button: e.button });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      }
    };
    canvas.onpointermove = (e) => {
      const [x, y] = pos(e);
      const p = this.pointers.get(e.pointerId);
      if (!p) {
        this.hover(x, y);
        return;
      }
      if (this.pointers.size === 2 && this.pinch) {
        p.x = x;
        p.y = y;
        const [a, b] = [...this.pointers.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        this.map.zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / this.pinch.dist);
        this.pinch.dist = dist;
        p.moved = true;
        return;
      }
      if (Math.hypot(x - p.sx, y - p.sy) > 5) p.moved = true;
      if (p.moved && p.button === 0) this.map.pan(x - p.x, y - p.y);
      p.x = x;
      p.y = y;
    };
    canvas.onpointerup = (e) => {
      const p = this.pointers.get(e.pointerId);
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinch = null;
      if (!p || p.moved) return;
      const [x, y] = pos(e);
      if (p.button === 2) this.rightClick(x, y);
      else if (p.button === 0) this.leftClick(x, y);
    };
    canvas.oncontextmenu = (e) => e.preventDefault();
    canvas.onwheel = (e) => {
      e.preventDefault();
      const [x, y] = pos(e);
      this.map.zoomAt(x, y, e.deltaY < 0 ? 1.15 : 1 / 1.15);
    };
    canvas.ondblclick = (e) => {
      const [x, y] = pos(e);
      this.map.zoomAt(x, y, 1.6);
    };
    this.minimap.onpointerdown = (e) => {
      const r = this.minimap.getBoundingClientRect();
      const [wx, wy] = this.map.minimapToWorld(e.clientX - r.left, e.clientY - r.top, this.minimap);
      this.map.cam.x = wx;
      this.map.cam.y = wy;
    };
    this.onKey = (e) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName)) return;
      const step = 60 / this.map.cam.zoom;
      switch (e.key) {
        case ' ': e.preventDefault(); this.togglePause(); break;
        case '1': case '2': case '3': case '4': case '5': this.setSpeed(Number(e.key)); break;
        case '0': this.setSpeed(0); break;
        case 'Escape': if (this.moveMode) this.moveMode = false; else if (this.selection) this.select(null); else this.closePanel(); break;
        case 'ArrowLeft': case 'q': case 'a': this.map.cam.x -= step; break;
        case 'ArrowRight': case 'd': this.map.cam.x += step; break;
        case 'ArrowUp': case 'z': case 'w': this.map.cam.y -= step; break;
        case 'ArrowDown': case 's': this.map.cam.y += step; break;
        case '+': case '=': this.map.zoomAt(this.map.w / 2, this.map.h / 2, 1.2); break;
        case '-': this.map.zoomAt(this.map.w / 2, this.map.h / 2, 1 / 1.2); break;
        case 'F1': case '?': e.preventDefault(); helpModal(this.app); break;
        case 'm': {
          const modes = Object.keys(MAP_MODES);
          this.map.mode = modes[(modes.indexOf(this.map.mode) + 1) % modes.length];
          this.map.dirty = true;
          this.buildModes();
          break;
        }
        default: {
          const panel = Object.entries(PANELS).find(([, p]) => p.key === e.key);
          if (panel) this.togglePanel(panel[0]);
        }
      }
    };
    window.addEventListener('keydown', this.onKey);
  }

  hover(x, y) {
    const sys = this.map.pickSystem(x, y);
    if (sys === this.map.hoverSys) return;
    this.map.hoverSys = sys;
    const st = this.selection?.type === 'stack' ? this.state.stacks[this.selection.id] : null;
    this.map.pathPreview = st && st.owner === this.player && sys && sys !== st.sys ? planPath(this.state, st, sys) : null;
    const s = sys ? this.state.systems[sys] : null;
    this.map.canvas.style.cursor = st && st.owner === this.player && sys ? (this.map.pathPreview ? 'crosshair' : 'not-allowed') : s ? 'pointer' : 'default';
  }

  leftClick(x, y) {
    const hit = this.map.pick(x, y);
    if (this.moveMode && hit?.type === 'system') {
      this.moveSelectedTo(hit.id);
      return;
    }
    audio.click();
    this.select(hit);
  }

  rightClick(x, y) {
    const sys = this.map.pickSystem(x, y);
    if (sys && this.selection?.type === 'stack' && this.state.stacks[this.selection.id]?.owner === this.player) this.moveSelectedTo(sys);
  }
}

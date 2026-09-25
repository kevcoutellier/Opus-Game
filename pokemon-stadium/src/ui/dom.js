import { assetUrl } from '../render/assets.js';

/** Tiny hyperscript helper: h('div.panel#id', { onclick }, child, 'text'). */
export function h(selector, attrs = {}, ...children) {
  const [tag, ...rest] = selector.split(/(?=[.#])/);
  const el = document.createElement(tag || 'div');
  for (const part of rest) {
    if (part.startsWith('.')) el.classList.add(part.slice(1));
    else if (part.startsWith('#')) el.id = part.slice(1);
  }
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs);
    attrs = {};
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function typeBadge(data, type) {
  const t = data.types[type];
  return h('span.type-badge', { style: { background: t?.color || '#888' } }, t?.fr || type);
}

export function statusBadge(status) {
  if (!status) return null;
  const label = { par: 'PAR', psn: 'PSN', tox: 'PSN', brn: 'BRU', frz: 'GEL', slp: 'SOM' }[status];
  return h(`span.status-badge.status-${status}`, label);
}

export function icon(num, kind = 'icons') {
  return h('img', { src: assetUrl(kind, num), alt: '', loading: 'lazy', draggable: 'false' });
}

/** FireRed/LeafGreen trainer picture (64x64 pixel art) as an <img>. */
export function trainerPortrait(pic, className = 'trainer-portrait') {
  if (!pic) return null;
  return h(`img.${className}`, { src: assetUrl('trainers', pic), alt: '', draggable: 'false' });
}

export function hpColor(ratio) {
  if (ratio > 0.5) return 'var(--hp-green)';
  if (ratio > 0.2) return 'var(--hp-yellow)';
  return 'var(--hp-red)';
}

let toastTimer;
export function toast(text, ms = 1800) {
  const el = document.getElementById('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/**
 * Arrow-key / gamepad-style navigation over the focusable items of a screen.
 * Items are elements matching `[data-nav]`; Enter/Space clicks, Escape calls onBack.
 */
export function keyboardNav(root, { onBack, onKey } = {}) {
  let index = -1;
  const items = () => [...root.querySelectorAll('[data-nav]')].filter((el) => !el.disabled && el.offsetParent !== null);
  const focus = (i) => {
    const list = items();
    if (!list.length) return;
    index = (i + list.length) % list.length;
    list.forEach((el) => el.classList.remove('focused'));
    const el = list[index];
    el.classList.add('focused');
    el.scrollIntoView?.({ block: 'nearest' });
    el.dispatchEvent(new CustomEvent('navfocus'));
  };
  const nearest = (dir) => {
    const list = items();
    const cur = list[index];
    if (!cur) return focus(0);
    const a = cur.getBoundingClientRect();
    let best = null;
    let bestScore = Infinity;
    list.forEach((el, i) => {
      if (el === cur) return;
      const b = el.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const along = { left: -dx, right: dx, up: -dy, down: dy }[dir];
      if (along <= 4) return;
      const across = dir === 'left' || dir === 'right' ? Math.abs(dy) : Math.abs(dx);
      const score = along + across * 2.5;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best !== null) focus(best);
  };
  const handler = (e) => {
    if (e.target instanceof HTMLInputElement && !['Escape', 'Enter', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
    if (onKey?.(e)) return;
    const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
    if (dirs[e.key]) {
      e.preventDefault();
      if (index < 0) focus(0);
      else nearest(dirs[e.key]);
    } else if (e.key === 'Enter' || e.key === ' ') {
      const el = items()[index];
      if (el) {
        e.preventDefault();
        el.click();
      }
    } else if (e.key === 'Escape' || e.key === 'Backspace') {
      if (onBack) {
        e.preventDefault();
        onBack();
      }
    }
  };
  window.addEventListener('keydown', handler);
  return {
    focus,
    reset: () => {
      index = -1;
    },
    destroy: () => window.removeEventListener('keydown', handler),
  };
}

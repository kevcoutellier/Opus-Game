// Small DOM helpers, number formatting, icons and tooltips.

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(el.style, value);
    else if (key === 'html') el.innerHTML = value;
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

export function fmt(n) {
  if (!Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e6) return `${nf1.format(n / 1e6)} M`;
  if (a >= 1e4) return `${nf1.format(n / 1e3)} k`;
  return nf.format(n);
}

export function fmt1(n) {
  return Number.isFinite(n) ? nf1.format(n) : '—';
}

export function signed(n, digits = 0) {
  const s = digits ? nf1.format(Math.abs(n)) : fmt(Math.abs(n));
  return `${n < 0 ? '−' : '+'}${s}`;
}

export function pop(billions) {
  if (billions >= 1000) return `${nf1.format(billions / 1000)} billion${billions >= 2000 ? 's' : ''}`;
  if (billions >= 1) return `${nf1.format(billions)} milliard${billions >= 2 ? 's' : ''}`;
  if (billions >= 0.001) return `${nf.format(billions * 1000)} millions`;
  return billions > 0 ? 'quelques milliers' : 'inhabité';
}

export function bar(value, max = 100, color = null) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return h('div', { class: 'bar' }, h('div', { class: 'bar-fill', style: { width: `${pct}%`, ...(color ? { background: color } : {}) } }));
}

// Simple stroke icons (24x24).
const ICONS = {
  economy: '<circle cx="12" cy="12" r="8"/><path d="M9 9.5c0-1.4 1.3-2 3-2s3 .8 3 2-1 1.6-3 2-3 .8-3 2.1 1.3 2 3 2 3-.6 3-2M12 5.5v13"/>',
  military: '<path d="M12 3l8 5-8 13L4 8z"/><path d="M4 8h16M12 3v18"/>',
  diplomacy: '<path d="M3 12l4-4 5 3 5-3 4 4-9 7z"/><path d="M8 11l4 3 4-3"/>',
  intel: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  research: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 14h9"/>',
  senate: '<path d="M3 20h18M5 20V10M9 20V10M15 20V10M19 20V10M2 10l10-6 10 6z"/>',
  politics: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18v.5"/>',
  ledger: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sound: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12"/>',
  mute: '<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7M12 16.5v.5"/>',
  save: '<path d="M5 3h11l3 3v15H5z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
};

export function icon(name, size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
}

// ---------------------------------------------------------------- tooltips

let tip = null;

export function initTooltips() {
  tip = h('div', { id: 'tooltip' });
  document.body.append(tip);
  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest?.('[data-tip]');
    if (!target) {
      tip.style.display = 'none';
      return;
    }
    tip.innerHTML = target.dataset.tip;
    tip.style.display = 'block';
    place(e);
  });
  document.addEventListener('mousemove', (e) => {
    if (tip.style.display === 'block') place(e);
  });
}

function place(e) {
  const pad = 14;
  const rect = tip.getBoundingClientRect();
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = e.clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = e.clientY - rect.height - pad;
  tip.style.left = `${Math.max(4, x)}px`;
  tip.style.top = `${Math.max(4, y)}px`;
}

export function hideTooltip() {
  if (tip) tip.style.display = 'none';
}

export function esc(text) {
  return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ---------------------------------------------------------------- holograms

// The Aurebesh font only has unaccented Latin letters and digits.
export function aurebesh(text, cls = '') {
  const plain = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ');
  return h('span', { class: `aurebesh ${cls}`.trim(), 'aria-hidden': 'true' }, plain.toLowerCase());
}

// A portrait projected as a blue hologram.
export function holoPic(src, { width = 88, height = 116, contain = false, alt = '' } = {}) {
  const px = (v) => (typeof v === 'number' ? `${v}px` : v);
  return h('div', { class: `holo-pic ${contain ? 'contain' : ''}`, style: { width: px(width), height: px(height) } },
    h('img', { src, alt, onerror: (e) => { e.target.parentElement.style.display = 'none'; } }));
}

// Replays the projection animation on an element (panels opening, new selection).
export function project(el) {
  if (document.body.classList.contains('no-holo')) return;
  el.classList.remove('holo-in');
  void el.offsetWidth;
  el.classList.add('holo-in');
  const done = (e) => {
    if (e.target !== el) return;
    el.classList.remove('holo-in');
    el.removeEventListener('animationend', done);
  };
  el.addEventListener('animationend', done);
}

// Head bar of a side panel: optional icon, title with its Aurebesh transliteration, then extra nodes.
export function holoHead(title, { lead = null, extra = [] } = {}) {
  return h('div', { class: 'side-head' }, lead, h('div', { class: 'titles' }, h('h2', {}, title), aurebesh(title)), extra);
}

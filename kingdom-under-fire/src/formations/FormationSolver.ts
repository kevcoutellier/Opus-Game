import { hash2 } from '../core/Random';
import type { FormationType } from './FormationType';

/**
 * Slot layout of a formation in its local frame: `lateral` (to the right of the front) and `forward`
 * (towards the enemy), centred on the formation anchor. Row 0 is the front rank (the outer ring for a
 * circle). `facing` is each slot's facing relative to the formation (outward on squares and circles).
 */
export interface SlotLayout {
  count: number;
  lateral: Float32Array;
  forward: Float32Array;
  row: Int16Array;
  facing: Float32Array;
  /** Sort key inside a row: lateral position, or angle for rings. */
  key: Float32Array;
  columns: number;
}

/** Default number of files of a line: about 5 wide for 1 deep. */
export function autoColumns(type: FormationType, count: number): number {
  switch (type) {
    case 'COLUMN':
      return Math.min(count, count >= 12 ? 4 : 3);
    case 'SQUARE':
      return Math.ceil(Math.sqrt(count));
    case 'SCATTERED':
      return Math.max(1, Math.round(Math.sqrt(count * 2)));
    default:
      return Math.max(1, Math.min(count, Math.round(Math.sqrt(count * 5))));
  }
}

/** Number of files fitting a front of `width` metres. */
export function columnsForWidth(width: number, spacing: number, count: number): number {
  return Math.max(1, Math.min(count, Math.round(width / spacing) + 1));
}

export function computeSlots(type: FormationType, count: number, spacing: number, columns: number | null = null): SlotLayout {
  const layout: SlotLayout = {
    count,
    lateral: new Float32Array(count),
    forward: new Float32Array(count),
    row: new Int16Array(count),
    facing: new Float32Array(count),
    key: new Float32Array(count),
    columns: 1,
  };
  if (count === 0) return layout;
  switch (type) {
    case 'WEDGE':
      wedge(layout, spacing);
      break;
    case 'CIRCLE':
      circle(layout, spacing);
      break;
    default:
      grid(layout, type, spacing, columns ?? autoColumns(type, count));
  }
  // Centre the layout on the anchor.
  let ml = 0;
  let mf = 0;
  for (let i = 0; i < count; i++) {
    ml += layout.lateral[i];
    mf += layout.forward[i];
  }
  ml /= count;
  mf /= count;
  for (let i = 0; i < count; i++) {
    layout.lateral[i] -= ml;
    layout.forward[i] -= mf;
    if (type !== 'CIRCLE') layout.key[i] = layout.lateral[i];
  }
  return layout;
}

function grid(layout: SlotLayout, type: FormationType, spacing: number, columns: number): void {
  const n = layout.count;
  const cols = Math.max(1, Math.min(n, columns));
  const rows = Math.ceil(n / cols);
  const scattered = type === 'SCATTERED';
  const step = scattered ? spacing * 2.3 : spacing;
  const depth = type === 'COLUMN' ? spacing * 1.1 : spacing;
  layout.columns = cols;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / cols);
    const inRow = Math.min(cols, n - r * cols);
    const j = i - r * cols;
    let lateral = (j - (inRow - 1) / 2) * step;
    let forward = -r * (scattered ? step : depth);
    if (scattered) {
      lateral += (hash2(i, 1, 77) - 0.5) * step * 0.6;
      forward += (hash2(i, 2, 77) - 0.5) * step * 0.6;
    }
    layout.lateral[i] = lateral;
    layout.forward[i] = forward;
    layout.row[i] = r;
    if (type === 'SQUARE') {
      // The outer ranks face outwards (front, back, flanks and corners).
      const front = r === 0;
      const back = r === rows - 1 && rows > 1;
      const left = j === 0 && inRow > 1;
      const right = j === inRow - 1 && inRow > 1;
      let facing = 0;
      if (front && left) facing = -Math.PI / 4;
      else if (front && right) facing = Math.PI / 4;
      else if (back && left) facing = (-3 * Math.PI) / 4;
      else if (back && right) facing = (3 * Math.PI) / 4;
      else if (back) facing = Math.PI;
      else if (left) facing = -Math.PI / 2;
      else if (right) facing = Math.PI / 2;
      layout.facing[i] = facing;
    }
  }
}

function wedge(layout: SlotLayout, spacing: number): void {
  const n = layout.count;
  let i = 0;
  for (let r = 0; i < n; r++) {
    const inRow = Math.min(2 * r + 1, n - i);
    for (let j = 0; j < inRow; j++, i++) {
      layout.lateral[i] = (j - (inRow - 1) / 2) * spacing;
      layout.forward[i] = -r * spacing * 0.85;
      layout.row[i] = r;
    }
  }
  layout.columns = 2 * layout.row[n - 1] + 1;
}

function circle(layout: SlotLayout, spacing: number): void {
  const n = layout.count;
  // Rings from the inside out, then numbered from the outside in (row 0 = outer ring, facing out).
  const rings: { radius: number; slots: number }[] = [];
  let placed = 0;
  if (n === 1) rings.push({ radius: 0, slots: 1 });
  for (let k = 0; placed < n && n > 1; k++) {
    const radius = spacing * (k + 1.2);
    const capacity = Math.max(1, Math.floor((2 * Math.PI * radius) / spacing));
    const slots = Math.min(capacity, n - placed);
    rings.push({ radius, slots });
    placed += slots;
  }
  let i = 0;
  for (let k = rings.length - 1; k >= 0; k--) {
    const { radius, slots } = rings[k];
    for (let s = 0; s < slots; s++, i++) {
      const angle = (s / slots) * Math.PI * 2;
      layout.lateral[i] = Math.sin(angle) * radius;
      layout.forward[i] = Math.cos(angle) * radius;
      layout.row[i] = rings.length - 1 - k;
      layout.facing[i] = angle;
      layout.key[i] = angle;
    }
  }
  layout.columns = rings[rings.length - 1].slots;
}

/**
 * Assigns units to slots without making files cross: units are ranked front to back (in the frame of the
 * new front) and dealt row by row, each row sorted left to right (or by angle for rings). `priority`
 * sends lower values to the front ranks (melee before ranged). Returns, for each slot, the index of the
 * unit (into the given arrays) that takes it.
 */
export function assignSlots(
  layout: SlotLayout,
  type: FormationType,
  xs: ArrayLike<number>,
  zs: ArrayLike<number>,
  priority: ArrayLike<number>,
  facing: number,
): Int32Array {
  const n = layout.count;
  let cx = 0;
  let cz = 0;
  for (let i = 0; i < n; i++) {
    cx += xs[i];
    cz += zs[i];
  }
  cx /= n;
  cz /= n;
  const sin = Math.sin(facing);
  const cos = Math.cos(facing);
  const lat = new Float32Array(n);
  const fwd = new Float32Array(n);
  const key = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - cx;
    const dz = zs[i] - cz;
    lat[i] = dx * cos - dz * sin;
    fwd[i] = dx * sin + dz * cos;
    key[i] = type === 'CIRCLE' ? normaliseAngle(Math.atan2(lat[i], fwd[i])) : lat[i];
  }
  // Rank order: priority, then front-most (or outer-most for rings) first.
  const depth = (i: number) => (type === 'CIRCLE' ? -Math.hypot(lat[i], fwd[i]) : -fwd[i]);
  const units = Array.from({ length: n }, (_, i) => i).sort((a, b) => priority[a] - priority[b] || depth(a) - depth(b) || a - b);

  const slotsByRow = new Map<number, number[]>();
  for (let s = 0; s < n; s++) {
    const list = slotsByRow.get(layout.row[s]);
    if (list) list.push(s);
    else slotsByRow.set(layout.row[s], [s]);
  }
  const result = new Int32Array(n);
  let cursor = 0;
  for (const row of [...slotsByRow.keys()].sort((a, b) => a - b)) {
    const slots = slotsByRow.get(row)!;
    const slotKey = (s: number) => (type === 'CIRCLE' ? normaliseAngle(layout.key[s]) : layout.key[s]);
    slots.sort((a, b) => slotKey(a) - slotKey(b));
    const rowUnits = units.slice(cursor, cursor + slots.length).sort((a, b) => key[a] - key[b] || a - b);
    cursor += slots.length;
    for (let k = 0; k < slots.length; k++) result[slots[k]] = rowUnits[k];
  }
  return result;
}

function normaliseAngle(a: number): number {
  const t = a % (Math.PI * 2);
  return t < 0 ? t + Math.PI * 2 : t;
}

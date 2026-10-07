import { z } from 'zod';

/**
 * Buttons of the pad in action mode (The Crusaders): X attacks, A is the second attack (strong combo,
 * thrust), Y the special attack, B counters or evades.
 */
export const BUTTONS = ['X', 'A', 'Y', 'B'] as const;
export type Button = (typeof BUTTONS)[number];

/** Animation of a move: an overhead swing, a thrust, or a whirl of the whole body. */
export const MOVE_STYLES = ['swing', 'thrust', 'spin'] as const;
export type MoveStyle = (typeof MOVE_STYLES)[number];

export const MOVE_IDS = [
  'weak1',
  'weak2',
  'weak3',
  'weak4',
  'weak5',
  'strong2',
  'strong3',
  'strong4',
  'strong5',
  'thrust',
  'heavy',
  'special',
  'smash',
  'counter',
  'repel',
] as const;
export type MoveId = (typeof MOVE_IDS)[number];

const MoveSchema = z.object({
  id: z.enum(MOVE_IDS),
  /** Shown by the combo counter. */
  label: z.string(),
  /** Seconds of the whole move. */
  duration: z.number().positive(),
  /** Fraction of the move at which the blow lands. */
  impact: z.number().min(0).max(1),
  /** From this fraction on, a button pressed during the move starts the next move of the chain. */
  cancel: z.number().min(0).max(1),
  /** Damage, as a multiple of the hero's attack. */
  damage: z.number().nonnegative(),
  /** Reach added to the hero's (m). */
  reach: z.number().nonnegative().default(0),
  /** Cosine of the half-angle of the arc struck in front (-1: all around). */
  arc: z.number().min(-1).max(1),
  /** Most enemies struck, the nearest first. */
  targets: z.number().int().positive(),
  /** Outward push given to the victims (m/s). */
  knockback: z.number().nonnegative().default(0),
  /** Seconds the victims can neither move nor strike. */
  stun: z.number().nonnegative().default(0),
  /** Speed (m/s) at which the hero is carried forward until the blow lands. */
  lunge: z.number().nonnegative().default(0),
  style: z.enum(MOVE_STYLES),
  /** SP spent to perform it. */
  sp: z.number().nonnegative().default(0),
  /** Seconds, from its start, during which no blow can touch the hero. */
  invulnerable: z.number().nonnegative().default(0),
  /** Move started when a button is pressed during this one (the chains of the combos). */
  next: z.partialRecord(z.enum(BUTTONS), z.enum(MOVE_IDS)).default({}),
});
export type MoveDef = z.infer<typeof MoveSchema>;

/**
 * The moves of a hero in action mode. What the guides of The Crusaders describe: the weak combo (X X X X X),
 * the strong combo (X then A A A A, stick at rest), the thrust (A with the stick towards the enemy), the
 * special attack (Y) and the Smash (Y Y, 180 SP), the counter-attack (B as an enemy strikes) and the
 * knockback (B when hit). Timings and damage are ours: no source gives them.
 */
const RAW_MOVES = [
  { id: 'weak1', label: 'Combo faible', duration: 0.4, impact: 0.42, cancel: 0.55, damage: 1, arc: 0.4, targets: 3, lunge: 1.2, style: 'swing', next: { X: 'weak2', A: 'strong2' } },
  { id: 'weak2', label: 'Combo faible', duration: 0.4, impact: 0.42, cancel: 0.55, damage: 1, arc: 0.4, targets: 3, lunge: 1.2, style: 'thrust', next: { X: 'weak3' } },
  { id: 'weak3', label: 'Combo faible', duration: 0.42, impact: 0.42, cancel: 0.55, damage: 1.1, arc: 0.4, targets: 3, lunge: 1.2, style: 'swing', next: { X: 'weak4' } },
  { id: 'weak4', label: 'Combo faible', duration: 0.42, impact: 0.42, cancel: 0.55, damage: 1.25, arc: 0.4, targets: 3, lunge: 1.2, style: 'thrust', next: { X: 'weak5' } },
  { id: 'weak5', label: 'Combo faible', duration: 0.62, impact: 0.5, cancel: 0.8, damage: 1.8, arc: 0.1, targets: 5, knockback: 4, stun: 0.6, lunge: 1.5, style: 'swing' },
  { id: 'strong2', label: 'Combo fort', duration: 0.58, impact: 0.48, cancel: 0.62, damage: 1.6, arc: 0.25, targets: 4, knockback: 2, stun: 0.3, lunge: 2, style: 'swing', next: { A: 'strong3' } },
  { id: 'strong3', label: 'Combo fort', duration: 0.58, impact: 0.48, cancel: 0.62, damage: 1.75, arc: 0.25, targets: 4, knockback: 2, stun: 0.3, lunge: 2, style: 'thrust', next: { A: 'strong4' } },
  { id: 'strong4', label: 'Combo fort', duration: 0.6, impact: 0.48, cancel: 0.62, damage: 1.95, arc: 0.25, targets: 5, knockback: 3, stun: 0.4, lunge: 2, style: 'swing', next: { A: 'strong5' } },
  { id: 'strong5', label: 'Combo fort', duration: 0.8, impact: 0.5, cancel: 0.85, damage: 2.8, reach: 0.8, arc: -1, targets: 8, knockback: 6, stun: 1, lunge: 1, style: 'spin' },
  { id: 'thrust', label: 'Estoc', duration: 0.55, impact: 0.5, cancel: 0.7, damage: 2.2, reach: 1.2, arc: 0.8, targets: 3, knockback: 3, stun: 0.4, lunge: 8, style: 'thrust' },
  { id: 'heavy', label: 'Coup puissant', duration: 0.65, impact: 0.5, cancel: 0.7, damage: 1.8, arc: 0.3, targets: 4, knockback: 3, stun: 0.4, lunge: 1, style: 'swing' },
  { id: 'special', label: 'Attaque spéciale', duration: 0.7, impact: 0.5, cancel: 0.55, damage: 1.4, reach: 0.6, arc: -1, targets: 8, knockback: 5, stun: 0.6, style: 'spin', next: { Y: 'smash' } },
  { id: 'smash', label: 'Smash', duration: 1, impact: 0.55, cancel: 0.9, damage: 3.2, reach: 3, arc: -1, targets: 16, knockback: 9, stun: 1.5, style: 'swing', sp: 180, invulnerable: 0.6 },
  { id: 'counter', label: 'Contre-attaque', duration: 0.5, impact: 0.3, cancel: 0.7, damage: 2.6, reach: 0.4, arc: 0.2, targets: 2, knockback: 3, stun: 1.2, style: 'thrust', invulnerable: 0.45 },
  { id: 'repel', label: 'Repousser', duration: 0.5, impact: 0.25, cancel: 0.7, damage: 0.6, reach: 1.6, arc: -1, targets: 10, knockback: 8, stun: 0.5, style: 'spin', invulnerable: 0.4 },
] as const;

function parseMoves(raw: readonly unknown[]): ReadonlyMap<MoveId, MoveDef> {
  const moves = new Map<MoveId, MoveDef>();
  raw.forEach((entry, i) => {
    const result = MoveSchema.safeParse(entry);
    if (!result.success) throw new Error(`Invalid move ${(entry as { id?: string })?.id ?? `#${i}`}: ${z.prettifyError(result.error)}`);
    if (moves.has(result.data.id)) throw new Error(`Duplicate move ${result.data.id}`);
    // A move followed before its blow lands would never strike.
    if (result.data.cancel < result.data.impact) throw new Error(`Move ${result.data.id} can be followed before its impact`);
    moves.set(result.data.id, result.data);
  });
  for (const id of MOVE_IDS) if (!moves.has(id)) throw new Error(`Move ${id} is not defined`);
  return moves;
}

export const MOVES = parseMoves(RAW_MOVES);

export function move(id: MoveId): MoveDef {
  return MOVES.get(id)!;
}

/** The stick counts as pushed (towards the enemy) beyond this length. */
const STICK_PUSHED = 0.5;

/**
 * Move started by a button: alone (`current` null) or during a move, following its chain. B is resolved by
 * the hero system (counter, knockback or dodge) and starts nothing here. A with the stick pushed is the
 * thrust, even within a chain.
 */
export function nextMove(current: MoveDef | null, button: Button, stick: number): MoveId | null {
  if (button === 'B') return null;
  if (button === 'A' && stick > STICK_PUSHED) return 'thrust';
  if (current) return current.next[button] ?? null;
  if (button === 'X') return 'weak1';
  if (button === 'A') return 'heavy';
  return 'special';
}

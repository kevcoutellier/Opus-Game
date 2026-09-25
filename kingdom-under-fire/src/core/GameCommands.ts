import type { FormationType } from '../formations/FormationType';

/** Commands understood by the simulation (see core/Commands.ts). Unit lists are entity ids. */
export type GameCommand =
  | {
      kind: 'formationMove';
      team: number;
      units: number[];
      x: number;
      z: number;
      /** Direction the front faces on arrival (radians), null = direction of travel. */
      facing: number | null;
      /** Front width in metres (right-drag), null = automatic. */
      width: number | null;
      formation: FormationType | null;
      attackMove: boolean;
    }
  | { kind: 'attack'; team: number; units: number[]; target: number }
  | { kind: 'hold'; team: number; units: number[] }
  | { kind: 'setFormation'; team: number; units: number[]; formation: FormationType }
  /** Casts ability `slot` (0–3) of a hero at the ground point (x, z) (ignored by `self` abilities). */
  | { kind: 'cast'; team: number; hero: number; slot: number; x: number; z: number }
  /** Takes (direct = true) or gives back direct third-person control of a hero. */
  | { kind: 'heroControl'; team: number; hero: number; direct: boolean }
  /** Direct control: wanted direction of travel (x, z) in world space (length 0–1) and aim (radians). */
  | { kind: 'heroSteer'; team: number; hero: number; x: number; z: number; aim: number }
  /** Direct control: a blow in the aim direction, heavy or quick. */
  | { kind: 'heroStrike'; team: number; hero: number; heavy: boolean }
  /** Direct control: a dodge roll in the direction (x, z). */
  | { kind: 'heroDodge'; team: number; hero: number; x: number; z: number };

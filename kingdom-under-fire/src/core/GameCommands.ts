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
  | { kind: 'setFormation'; team: number; units: number[]; formation: FormationType };

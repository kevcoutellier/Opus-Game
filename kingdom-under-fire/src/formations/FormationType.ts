export const FORMATION_TYPES = ['LINE', 'COLUMN', 'SQUARE', 'WEDGE', 'CIRCLE', 'SCATTERED'] as const;
export type FormationType = (typeof FORMATION_TYPES)[number];

export const FORMATION_LABELS: Record<FormationType, string> = {
  LINE: 'Ligne',
  COLUMN: 'Colonne',
  SQUARE: 'Carré',
  WEDGE: 'Coin',
  CIRCLE: 'Cercle',
  SCATTERED: 'Dispersée',
};

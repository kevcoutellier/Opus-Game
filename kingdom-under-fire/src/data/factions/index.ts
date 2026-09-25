import { parseFactionDefs, type FactionDef } from '../../factions/Faction';
import { UNIT_INDEX } from '../units';

// The two sides of the Second War of Heroes in Bersia (Kingdom Under Fire: A War of Heroes).
const RAW_FACTIONS = [
  {
    id: 'human_alliance',
    name: 'Alliance Humaine',
    description:
      'Hironeiden et Azilla sous le roi Gernot, rejoints par les elfes de la forêt d’Essex et les nains du Hall des Pierres. Infanterie disciplinée, chevaliers et mages.',
    color: '#2f5fa8',
    trim: '#c9ccd4',
    units: ['human_footman', 'human_spearman'],
  },
  {
    id: 'dark_legion',
    name: 'Légion Noire',
    description:
      'Orcs et ogres de Hexter, vampires de Vellond, elfes noirs et morts-vivants, unis sous l’Empereur noir Rick Blood pour rebâtir l’Autel de Destruction.',
    color: '#8e1f1b',
    trim: '#2a2522',
    units: ['orc_warrior', 'orc_spearman'],
  },
] as const;

export const FACTIONS: readonly FactionDef[] = parseFactionDefs(RAW_FACTIONS, new Set(UNIT_INDEX.keys()));

export function faction(id: string): FactionDef {
  const def = FACTIONS.find((f) => f.id === id);
  if (!def) throw new Error(`Unknown faction ${id}`);
  return def;
}

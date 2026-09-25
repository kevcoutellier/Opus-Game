import { parseFactionDefs, type FactionDef } from '../../factions/Faction';
import { UNIT_INDEX } from '../units';

// Original factions of « Bannières de Cendre ». Two are playable in the first prototype; two more
// (sylvan mystics and an ash necropolis) are planned for the faction milestone.
const RAW_FACTIONS = [
  {
    id: 'valdrenne',
    name: 'Royaume de Valdrenne',
    description: 'Couronne des plaines du Sud. Infanterie disciplinée, chevaliers lourds, foi en la Flamme Blanche.',
    color: '#2f5fa8',
    trim: '#c9ccd4',
    units: ['swordsman', 'spearman'],
  },
  {
    id: 'vhorsk',
    name: 'Clans de Vhorsk',
    description: 'Clans des marches cendrées du Nord. Guerriers farouches, assauts brutaux, moral volatil.',
    color: '#9c2a24',
    trim: '#7a6a58',
    units: ['swordsman', 'spearman'],
  },
] as const;

export const FACTIONS: readonly FactionDef[] = parseFactionDefs(RAW_FACTIONS, new Set(UNIT_INDEX.keys()));

export function faction(id: string): FactionDef {
  const def = FACTIONS.find((f) => f.id === id);
  if (!def) throw new Error(`Unknown faction ${id}`);
  return def;
}

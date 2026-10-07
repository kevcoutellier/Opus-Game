import type { Mission } from '../../missions/Mission';
import { CHARACTERS } from '../story/lore';
import { GERALD_MISSIONS } from './gerald';

/** The missions of the campaigns, in order. */
export const MISSIONS: readonly Mission[] = [...GERALD_MISSIONS];

for (const m of MISSIONS) {
  for (const id of [...m.allies, ...m.enemies]) {
    if (!CHARACTERS.some((c) => c.id === id)) throw new Error(`Mission ${m.id} names unknown character ${id}`);
  }
}

export function mission(id: string): Mission | undefined {
  return MISSIONS.find((m) => m.id === id);
}

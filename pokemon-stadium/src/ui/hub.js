import { menuScreen } from './menuScreen.js';
import { stadiumScreen } from './stadiumScreen.js';
import { castleScreen } from './castleScreen.js';

/** The screen a run was started from: where "Back" / "Quit" should lead. */
export function hubFor(run) {
  if (run?.kind === 'cup') return stadiumScreen;
  if (run?.kind === 'castle') return castleScreen;
  return menuScreen;
}

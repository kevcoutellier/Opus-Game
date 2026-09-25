// Saved progression: cup trophies (per rank), gym badges, Elite Four and Hall of Fame.
// Stored in localStorage; every access is guarded so private browsing still works.

import { RANKS } from './rules.js';

const KEY = 'opus-stadium-progress';
const HALL_OF_FAME_SIZE = 30;

export function emptyProgress() {
  return { trophies: {}, badges: {}, elite: false, hallOfFame: [] };
}

export function loadProgress(storage = globalThis.localStorage) {
  try {
    return { ...emptyProgress(), ...JSON.parse(storage?.getItem(KEY) || '{}') };
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(progress, storage = globalThis.localStorage) {
  try {
    storage?.setItem(KEY, JSON.stringify(progress));
  } catch {
    // storage unavailable: progress only lasts for this session
  }
}

export const trophyKey = (cupId, rankId) => `${cupId}:${rankId}`;

export function hasTrophy(progress, cupId, rankId) {
  return !!progress.trophies[trophyKey(cupId, rankId)];
}

/** Stadium unlocks the next ball only once the previous one is won. */
export function rankUnlocked(progress, cupId, rankIndex) {
  return rankIndex === 0 || hasTrophy(progress, cupId, RANKS[rankIndex - 1].id);
}

export function badgeCount(progress) {
  return Object.values(progress.badges).filter(Boolean).length;
}

/** Records a completed run; returns true if it is a new trophy/badge. */
export function recordVictory(progress, reward, entry) {
  let isNew = false;
  if (reward.type === 'cup') {
    const key = trophyKey(reward.cup, reward.rank);
    isNew = !progress.trophies[key];
    progress.trophies[key] = progress.trophies[key] || entry.date;
  } else if (reward.type === 'badge') {
    isNew = !progress.badges[reward.gym];
    progress.badges[reward.gym] = true;
  } else if (reward.type === 'elite') {
    isNew = !progress.elite;
    progress.elite = true;
  }
  progress.hallOfFame.unshift(entry);
  progress.hallOfFame.length = Math.min(progress.hallOfFame.length, HALL_OF_FAME_SIZE);
  return isNew;
}

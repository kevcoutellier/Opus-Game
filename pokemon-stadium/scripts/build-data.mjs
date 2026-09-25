// Generates src/data/gen1.json: the 151 Gen 1 species, their moves and the
// Gen 1 type chart, following Pokémon Stadium mechanics.
//
// Sources:
//  - pokemon-showdown (npm, MIT): "gen1stadium" mod for base stats, moves,
//    learnsets and type chart; gen1 random-battle sets for the rental movesets.
//  - PokeAPI CSV data (GitHub, BSD-3): French species, genus and move names.
//
// Usage: npm run data

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = join(root, '.cache');
const POKEAPI_CSV = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv';
const FR = '5';

const { Dex } = require('pokemon-showdown');
const randomSets = require('pokemon-showdown/dist/data/random-battles/gen1/data.json');
const dex = Dex.mod('gen1stadium');

async function fetchCsv(name) {
  mkdirSync(cacheDir, { recursive: true });
  const file = join(cacheDir, `${name}.csv`);
  if (!existsSync(file)) {
    const res = await fetch(`${POKEAPI_CSV}/${name}.csv`);
    if (!res.ok) throw new Error(`${name}.csv: HTTP ${res.status}`);
    writeFileSync(file, await res.text());
  }
  const [header, ...lines] = readFileSync(file, 'utf8').trim().split('\n');
  const cols = header.split(',');
  // Names never contain commas in these files, except the genus column which
  // is last, so a split-and-rejoin is enough.
  return lines.map((line) => {
    const cells = line.split(',');
    const row = {};
    cols.forEach((c, i) => {
      row[c] = i === cols.length - 1 ? cells.slice(i).join(',') : cells[i];
    });
    return row;
  });
}

const TYPES_FR = {
  Normal: 'Normal', Fighting: 'Combat', Flying: 'Vol', Poison: 'Poison', Ground: 'Sol',
  Rock: 'Roche', Bug: 'Insecte', Ghost: 'Spectre', Fire: 'Feu', Water: 'Eau',
  Grass: 'Plante', Electric: 'Électrik', Psychic: 'Psy', Ice: 'Glace', Dragon: 'Dragon',
};
const TYPE_COLORS = {
  Normal: '#a8a878', Fighting: '#c03028', Flying: '#a890f0', Poison: '#a040a0',
  Ground: '#e0c068', Rock: '#b8a038', Bug: '#a8b820', Ghost: '#705898', Fire: '#f08030',
  Water: '#6890f0', Grass: '#78c850', Electric: '#f8d030', Psychic: '#f85888',
  Ice: '#98d8d8', Dragon: '#7038f8',
};

// Showdown splits the Gen 1 "Special" stat in spa/spd; the game only has one.
function toGen1Boosts(boosts) {
  if (!boosts) return undefined;
  const out = {};
  for (const [stat, value] of Object.entries(boosts)) {
    if (stat === 'spd') continue;
    out[stat === 'spa' ? 'spc' : stat] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

function convertSecondary(sec) {
  if (!sec) return undefined;
  const out = { chance: sec.chance ?? 100 };
  if (sec.status) out.status = sec.status;
  if (sec.volatileStatus) out.volatile = sec.volatileStatus;
  if (sec.boosts) out.boosts = toGen1Boosts(sec.boosts);
  return out;
}

function convertMove(m, frNames) {
  const flags = m.flags || {};
  const move = {
    id: m.id,
    num: m.num,
    name: m.name,
    nameFr: frNames.get(String(m.num)) || m.name,
    type: m.type === '???' ? 'Normal' : m.type,
    category: m.category,
    power: m.basePower || 0,
    accuracy: m.accuracy === true ? null : m.accuracy,
    pp: m.pp,
    priority: m.priority || 0,
    target: m.target === 'self' ? 'self' : 'foe',
  };
  if (m.critRatio === 2) move.highCrit = true;
  const secondary = convertSecondary(m.secondary);
  if (secondary) move.secondary = secondary;
  if (m.boosts) move.boosts = toGen1Boosts(m.boosts);
  if (m.self?.boosts) move.selfBoosts = toGen1Boosts(m.self.boosts);
  if (m.status) move.status = m.status;
  if (m.volatileStatus) move.volatile = m.volatileStatus;
  if (m.multihit) move.multihit = m.multihit;
  if (m.recoil) move.recoil = m.recoil[0] / m.recoil[1];
  if (m.drain) move.drain = m.drain[0] / m.drain[1];
  if (m.heal) move.heal = m.heal[0] / m.heal[1];
  if (m.damage) move.fixedDamage = m.damage;
  if (m.ohko) move.ohko = true;
  if (m.selfdestruct) move.selfdestruct = true;
  if (flags.charge) move.charge = true;
  if (flags.recharge) move.recharge = true;
  if (m.self?.volatileStatus === 'lockedmove') move.rampage = true;
  if (m.volatileStatus === 'partiallytrapped') move.trap = true;
  if (m.id === 'fly' || m.id === 'dig') move.semiInvulnerable = true;
  return move;
}

function gen1Learnset(species) {
  const moves = new Set();
  for (let s = species; s && s.exists; s = s.prevo ? dex.species.get(s.prevo) : null) {
    const entry = dex.data.Learnsets[s.id]?.learnset || {};
    for (const [moveId, sources] of Object.entries(entry)) {
      if (sources.some((src) => src.startsWith('1'))) moves.add(moveId);
    }
  }
  return [...moves].sort();
}

function rentalMoves(species, learnset, moves) {
  const set = randomSets[species.id];
  if (set) {
    const ordered = [
      ...(set.moves || []),
      ...(set.essentialMoves || []),
      ...(set.exclusiveMoves || []),
      ...(set.comboMoves || []),
    ];
    return { level: set.level, moves: [...new Set(ordered)].slice(0, 4) };
  }
  // Species absent from random battles (Caterpie, Metapod, Magikarp...):
  // strongest attacks first, then whatever utility moves remain.
  const known = learnset.filter((id) => moves[id]);
  const attacks = known
    .filter((id) => moves[id].power > 1)
    .sort((a, b) => moves[b].power - moves[a].power);
  const others = known.filter((id) => !attacks.includes(id));
  return { level: 100, moves: [...attacks, ...others].slice(0, 4) };
}

async function main() {
  const [speciesNames, moveNames] = await Promise.all([
    fetchCsv('pokemon_species_names'),
    fetchCsv('move_names'),
  ]);
  const frSpecies = new Map();
  for (const row of speciesNames) {
    if (row.local_language_id === FR) frSpecies.set(row.pokemon_species_id, row);
  }
  const frMoves = new Map();
  for (const row of moveNames) {
    if (row.local_language_id === FR) frMoves.set(row.move_id, row.name);
  }

  const moves = {};
  for (const m of dex.moves.all()) {
    if (m.num >= 1 && m.num <= 165 && !m.isNonstandard) moves[m.id] = convertMove(m, frMoves);
  }
  moves.struggle = convertMove(dex.moves.get('struggle'), frMoves);

  const typeNames = Object.keys(TYPES_FR);
  const typeChart = {};
  for (const atk of typeNames) {
    typeChart[atk] = {};
    for (const def of typeNames) {
      let mult = 1;
      if (!dex.getImmunity(atk, def)) mult = 0;
      else mult = 2 ** dex.getEffectiveness(atk, def);
      if (mult !== 1) typeChart[atk][def] = mult;
    }
  }

  const species = dex.species
    .all()
    .filter((s) => s.num >= 1 && s.num <= 151 && !s.forme)
    .sort((a, b) => a.num - b.num)
    .map((s) => {
      const learnset = gen1Learnset(s);
      const fr = frSpecies.get(String(s.num));
      return {
        id: s.id,
        num: s.num,
        name: s.name,
        nameFr: fr?.name || s.name,
        genusFr: fr?.genus || '',
        types: s.types,
        base: {
          hp: s.baseStats.hp, atk: s.baseStats.atk, def: s.baseStats.def,
          spc: s.baseStats.spa, spe: s.baseStats.spe,
        },
        heightm: s.heightm,
        weightkg: s.weightkg,
        prevo: s.prevo ? dex.species.get(s.prevo).num : null,
        learnset,
        rental: rentalMoves(s, learnset, moves),
      };
    });

  const data = {
    source: 'pokemon-showdown gen1stadium + PokeAPI (noms FR)',
    types: Object.fromEntries(typeNames.map((t) => [t, { fr: TYPES_FR[t], color: TYPE_COLORS[t] }])),
    typeChart,
    moves,
    species,
  };
  const out = join(root, 'src/data/gen1.json');
  writeFileSync(out, JSON.stringify(data));
  const rentalMoveIds = new Set(species.flatMap((s) => s.rental.moves));
  console.log(`[data] ${species.length} species, ${Object.keys(moves).length} moves -> ${out}`);
  console.log(`[data] moves used by rentals (${rentalMoveIds.size}): ${[...rentalMoveIds].sort().join(', ')}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

// Remote locations of the third-party assets, shared by scripts/fetch-assets.mjs
// (download) and the game (fallback when a file was not downloaded).
// raw.githubusercontent.com serves CORS headers, so the game can load them directly.

const RAW = 'https://raw.githubusercontent.com';
const FRLG = `${RAW}/pret/pokefirered/master/graphics`;
const pad3 = (n) => String(n).padStart(3, '0');

/** Assets indexed by National Dex number (1-151). */
export const ASSET_SOURCES = {
  // Animated models (idle, walk, run, attack, happy, sleep) — ~3 MB each.
  animated: {
    ext: 'glb',
    url: (n) => `${RAW}/06wj/pokemon/master/public/models/${pad3(n)}/model.glb`,
    credit: '06wj/pokemon',
  },
  // Lighter models (Draco + WebP), few animations — ~170 KB each.
  models: {
    ext: 'glb',
    url: (n) => `${RAW}/Pokemon-3D-api/assets/main/models/opt/regular/${n}.glb`,
    credit: 'Pokemon-3D-api/assets',
  },
  cries: {
    ext: 'ogg',
    url: (n) => `${RAW}/PokeAPI/cries/main/cries/pokemon/legacy/${n}.ogg`,
    credit: 'PokeAPI/cries',
  },
  icons: {
    ext: 'png',
    url: (n) => `${RAW}/PokeAPI/sprites/master/sprites/pokemon/versions/generation-vii/icons/${n}.png`,
    credit: 'PokeAPI/sprites',
  },
  sprites: {
    ext: 'png',
    url: (n) =>
      `${RAW}/PokeAPI/sprites/master/sprites/pokemon/versions/generation-i/red-blue/transparent/${n}.png`,
    credit: 'PokeAPI/sprites',
  },
};

// Move effect sprites of Pokémon Showdown's battle animations.
const FX = [
  'alpha', 'angry', 'blackwisp', 'bluefireball', 'bone', 'bottombite', 'caltrop', 'electroball', 'energyball',
  'feather', 'fireball', 'fist', 'fist1', 'flareball', 'foot', 'gear', 'greenmetal1', 'greenmetal2', 'heart',
  'hitmarker', 'iceball', 'icicle-pink', 'icicle', 'impact', 'leaf1', 'leaf2', 'leftchop', 'leftclaw',
  'leftslash', 'lightning', 'mistball', 'moon', 'mudwisp', 'omega', 'petal', 'pointer', 'poisoncaltrop',
  'pokeball', 'purplewisp', 'rainbow', 'rightchop', 'rightclaw', 'rightslash', 'rock1', 'rock2', 'rock3',
  'rocks', 'shadowball', 'shell', 'shine', 'stare', 'sword', 'topbite', 'ultra', 'waterwisp', 'web', 'wisp',
  'z-symbol',
];

// FireRed/LeafGreen trainer pictures (64x64): classes, gym leaders, Elite Four, rival, player.
export const TRAINER_PICS = [
  'youngster', 'lass', 'bug_catcher', 'fisherman', 'swimmer_f', 'swimmer_m', 'hiker', 'black_belt', 'biker',
  'bird_keeper', 'scientist', 'channeler', 'juggler', 'tamer', 'beauty', 'cool_trainer_m', 'cool_trainer_f',
  'sailor', 'burglar', 'engineer', 'rocker', 'super_nerd', 'gentleman', 'psychic_m', 'psychic_f', 'camper',
  'picnicker', 'gamer', 'rocket_grunt_m', 'leader_brock', 'leader_misty', 'leader_lt_surge', 'leader_erika',
  'leader_koga', 'leader_sabrina', 'leader_blaine', 'leader_giovanni', 'elite_four_lorelei', 'elite_four_bruno',
  'elite_four_agatha', 'elite_four_lance', 'champion_rival', 'red', 'leaf', 'professor_oak',
  // back pictures (5 frames of 64x64: Poké Ball throw)
  'red_back', 'leaf_back',
];

// FireRed/LeafGreen overworld NPCs (16x32 frames) who fill the stands.
export const CROWD_PEOPLE = [
  'balding_man', 'beauty', 'black_belt', 'boy', 'bug_catcher', 'cameraman', 'camper', 'channeler', 'chef', 'clerk',
  'cooltrainer_f', 'cooltrainer_m', 'crush_girl', 'fat_man', 'fisher', 'gentleman', 'gym_guy', 'hiker', 'lass', 'man',
  'old_man_1', 'old_woman', 'picnicker', 'poke_maniac', 'policeman', 'rich_boy', 'rocker', 'sailor', 'scientist',
  'swimmer_f_land', 'swimmer_m_land', 'woman_1', 'woman_2', 'woman_3', 'worker_f', 'worker_m', 'youngster',
];

/** Assets indexed by name. */
export const NAMED_ASSETS = {
  fx: {
    ext: 'png',
    names: FX,
    url: (name) => `${RAW}/smogon/pokemon-showdown-client/master/play.pokemonshowdown.com/fx/${name}.png`,
    credit: 'smogon/pokemon-showdown-client',
  },
  trainers: {
    ext: 'png',
    names: TRAINER_PICS,
    url: (name) =>
      name.endsWith('_back') ? `${FRLG}/trainers/back_pics/${name}_pic.png` : `${FRLG}/trainers/front_pics/${name}_front_pic.png`,
    credit: 'pret/pokefirered',
  },
  people: {
    ext: 'png',
    names: CROWD_PEOPLE,
    url: (name) => `${FRLG}/object_events/pics/people/${name}.png`,
    credit: 'pret/pokefirered',
  },
  // CC0 HDRIs from Poly Haven, mirrored in the 06wj/pokemon repository.
  env: {
    ext: 'hdr',
    names: ['forest_slope_1k', 'studio_small_09_1k'],
    url: (name) => `${RAW}/06wj/pokemon/master/public/environments/${name}.hdr`,
    credit: 'Poly Haven (CC0) via 06wj/pokemon',
  },
};

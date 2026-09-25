// Which Pokémon Showdown effect sprite (public/assets/fx/<name>.png) each move uses.

/** Sprite popped on the target when a contact move connects. */
export const CONTACT_SPRITES = {
  megapunch: 'fist', cometpunch: 'fist', firepunch: 'fist', icepunch: 'fist', thunderpunch: 'fist', dizzypunch: 'fist',
  submission: 'fist1', seismictoss: 'fist1', counter: 'fist1',
  doublekick: 'foot', jumpkick: 'foot', highjumpkick: 'foot', megakick: 'foot', rollingkick: 'foot', lowkick: 'foot', stomp: 'foot',
  slash: 'rightslash', cut: 'leftslash', scratch: 'rightclaw', furyswipes: 'leftclaw',
  karatechop: 'rightchop', vicegrip: 'leftchop', guillotine: 'leftchop', crabhammer: 'rightchop',
  bite: 'bite', hyperfang: 'bite', superfang: 'bite',
  peck: 'hitmarker', drillpeck: 'hitmarker', hornattack: 'hitmarker', furyattack: 'hitmarker', horndrill: 'hitmarker',
  wingattack: 'feather',
};

/** Projectile / stream sprite for ranged moves. */
export const MOVE_PROJECTILES = {
  swift: 'shine', payday: 'shine', razorleaf: 'leaf1', petaldance: 'petal', solarbeam: 'energyball',
  megadrain: 'energyball', absorb: 'energyball', leechlife: 'energyball', dreameater: 'mistball',
  bubblebeam: 'waterwisp', bubble: 'waterwisp', watergun: 'waterwisp', hydropump: 'waterwisp', surf: 'waterwisp',
  aurorabeam: 'rainbow', psybeam: 'mistball', confusion: 'mistball', psychic: 'mistball', nightshade: 'shadowball',
  dragonrage: 'bluefireball', bonemerang: 'bone', boneclub: 'bone', poisonsting: 'poisoncaltrop',
  pinmissile: 'caltrop', spikecannon: 'caltrop', twineedle: 'caltrop', sludge: 'purplewisp', acid: 'purplewisp',
  smog: 'purplewisp', sandattack: 'mudwisp', gust: 'feather', razorwind: 'wisp', eggbomb: 'energyball',
  barrage: 'energyball', blizzard: 'icicle', icebeam: 'iceball', flamethrower: 'fireball', ember: 'fireball',
  fireblast: 'flareball', firespin: 'fireball', thundershock: 'electroball', thunderbolt: 'electroball',
  thunder: 'electroball', hyperbeam: 'wisp', skyattack: 'shine', triattack: 'shine', sonicboom: 'wisp',
};

export const TYPE_PROJECTILES = {
  Fire: 'fireball', Water: 'waterwisp', Electric: 'electroball', Grass: 'leaf1', Ice: 'iceball', Psychic: 'mistball',
  Ghost: 'shadowball', Poison: 'purplewisp', Ground: 'mudwisp', Rock: 'rock1', Bug: 'caltrop', Dragon: 'bluefireball',
  Flying: 'feather', Fighting: 'fist', Normal: 'wisp',
};

/** Status moves shown with a sprite on the user (or target). */
export const STATUS_SPRITES = {
  swordsdance: 'sword', leer: 'stare', glare: 'stare', focusenergy: 'angry', lovelykiss: 'heart',
  metronome: 'pointer', stringshot: 'web', meditate: 'shine', sharpen: 'shine', growth: 'energyball',
};

// Glowing sprites are blended additively; solid ones (rocks, fists...) normally.
const GLOW = new Set([
  'wisp', 'purplewisp', 'waterwisp', 'mudwisp', 'blackwisp', 'fireball', 'bluefireball', 'flareball', 'electroball',
  'energyball', 'mistball', 'shadowball', 'iceball', 'lightning', 'shine', 'rainbow', 'moon', 'ultra', 'z-symbol',
]);

export function isGlow(name) {
  return GLOW.has(name);
}

export function projectileSprite(move) {
  return MOVE_PROJECTILES[move.id] || TYPE_PROJECTILES[move.type] || 'wisp';
}

// Remote locations of the third-party assets, shared by scripts/fetch-assets.mjs
// (download) and the game (fallback when a file was not downloaded).
// raw.githubusercontent.com serves CORS headers, so the game can load them directly.

const RAW = 'https://raw.githubusercontent.com';

export const ASSET_SOURCES = {
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

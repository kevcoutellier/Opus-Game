// Official Star Wars artwork used by the interface. Nothing is versioned: `npm run assets` downloads the files
// into public/assets/ (see scripts/fetch-assets.mjs) and a missing file is loaded straight from GitHub.
//
// Sources:
//  - starwars.com databank pictures indexed by SWAPI id, archived in github.com/breatheco-de/swapi-images;
//  - official emblems redrawn as SVG by Font Awesome (brands icons, CC BY 4.0);
//  - Wookieepedia page images for everything else (only through `npm run assets`).

export const SWAPI_BASE = 'https://raw.githubusercontent.com/breatheco-de/swapi-images/master/public/images';
export const FA_BASE = 'https://raw.githubusercontent.com/FortAwesome/Font-Awesome/6.x/svgs/brands';

// SWAPI planet ids of the systems of the map.
export const PLANETS = {
  tatooine: 1, alderaan: 2, yavin: 3, hoth: 4, dagobah: 5, bespin: 6, endor: 7, naboo: 8, coruscant: 9, kamino: 10,
  geonosis: 11, utapau: 12, mustafar: 13, kashyyyk: 14, polis_massa: 15, mygeeto: 16, felucia: 17, cato_neimoidia: 18,
  saleucami: 19, eriadu: 21, corellia: 22, rodia: 23, nal_hutta: 24, dantooine: 25, ord_mantell: 27, trandosha: 29,
  mon_cala: 31, chandrila: 32, sullust: 33, toydaria: 34, malastare: 35, dathomir: 36, ryloth: 37, iridonia: 45,
  serenno: 52, concord_dawn: 53, muunilinst: 57, umbara: 60, jakku: 61,
};

// Wookieepedia article titles for the systems without a SWAPI picture.
export const WOOKIEEPEDIA_PLANETS = {
  byss: 'Byss (Deep Core)', tython: 'Tython', prakith: 'Prakith', empress_teta: 'Empress Teta', corulag: 'Corulag',
  anaxes: 'Anaxes', brentaal: 'Brentaal IV', kuat: 'Kuat', duro: 'Duro', hosnian: 'Hosnian Prime', ralltiir: 'Ralltiir',
  humbarine: 'Humbarine', esseles: 'Esseles', metellos: 'Metellos', grizmallt: 'Grizmallt', carida: 'Carida',
  commenor: 'Commenor', abregado: 'Abregado-rae', fondor: 'Fondor', neimoidia: 'Neimoidia', rendili: 'Rendili',
  balmorra: 'Balmorra', ghorman: 'Ghorman', tangenine: 'Tangenine', axum: 'Axum', onderon: 'Onderon', hapes: 'Hapes',
  terephon: 'Terephon', gallinore: 'Gallinore', charubah: 'Charubah', denon: 'Denon', thyferra: 'Thyferra',
  vardos: 'Vardos', ord_ibanna: 'Ord Ibanna', kafrene: 'Kafrene', devaron: 'Devaron', lianna: 'Lianna',
  aldhani: 'Aldhani', ansion: 'Ansion', bothawui: 'Bothawui', kothlis: 'Kothlis', sluis_van: 'Sluis Van',
  jedha: 'Jedha', ithor: 'Ithor', mimban: 'Mimban', vandor: 'Vandor-1', wobani: 'Wobani', kijimi: 'Kijimi',
  takodana: 'Takodana', rothana: 'Rothana', bracca: 'Bracca', christophsis: 'Christophsis', anoat: 'Anoat',
  scarif: 'Scarif', eadu: 'Eadu', kalevala: 'Kalevala', mandalore: 'Mandalore', kessel: 'Kessel', oba_diah: 'Oba Diah',
  lothal: 'Lothal', garel: 'Garel', moraband: 'Moraband', rishi: 'Rishi', cantonica: 'Cantonica', ferrix: 'Ferrix',
  jabiim: 'Jabiim', crait: 'Crait', dqar: "D'Qar", batuu: 'Batuu', zygerria: 'Zygerria', nevarro: 'Nevarro',
  lah_mu: "Lah'mu", nar_shaddaa: 'Nar Shaddaa', ylesia: 'Ylesia', klatooine: 'Klatooine', sriluur: 'Sriluur',
  teth: 'Teth', florrum: 'Florrum', etti: 'Etti IV', bonadan: 'Bonadan', ammuud: 'Ammuud', orron: 'Orron III',
  duroon: 'Duroon', kir: 'Kir', csilla: 'Csilla', naplou: 'Naplou', rentor: 'Rentor', sposia: 'Sposia',
  avidich: 'Avidich', copero: 'Copero', ilum: 'Ilum', raxus: 'Raxus',
};

// Official emblems (Font Awesome brand icons).
export const EMBLEMS = {
  empire: 'empire', rebels: 'rebel', resistance: 'rebel', firstorder: 'first-order', newrepublic: 'galactic-republic',
  cis: 'trade-federation', mandalore: 'mandalorian', crimson: 'sith', adelhard: 'empire',
};
export const EXTRA_ICONS = ['galactic-senate', 'jedi-order', 'old-republic', 'first-order-alt'];

// Wookieepedia articles whose main picture is the emblem of the faction.
export const WOOKIEEPEDIA_EMBLEMS = {
  hutts: 'Hutt Clan', chiss: 'Chiss Ascendancy', csa: 'Corporate Sector Authority', hapes: 'Hapes Consortium',
  pykes: 'Pyke Syndicate', blacksun: 'Black Sun', bothans: 'Bothan SpyNet', cloudcity: 'Cloud City',
  takodana: "Maz Kanata's castle", batuu: 'Black Spire Outpost', kijimi: 'Kijimi City', cantonica: 'Canto Bight',
  kashyyyk: 'Wookiee', crimson: 'Crimson Dawn', newrepublic: 'New Republic',
};

// Leaders: SWAPI people ids, or Wookieepedia articles.
export const LEADERS = {
  'Empereur Palpatine': 21, 'Mon Mothma': 28, 'Chancelière Mon Mothma': 28, 'Jabba le Hutt': 16, 'Lando Calrissian': 25,
  Lobot: 26, 'Générale Leia Organa': 5, Maul: 44, 'Chef Tarfful': 80, 'Grand Conseil hutt': 16,
};
export const WOOKIEEPEDIA_LEADERS = {
  'Grande Amirale Rae Sloane': 'Rae Sloane', 'Suprême Leader Snoke': 'Snoke', 'Bo-Katan Kryze': 'Bo-Katan Kryze',
  'Gar Saxon': 'Gar Saxon', 'Prince Xizor': 'Xizor', 'Marg Krim': 'Marg Krim', 'Lom Pyke': 'Lom Pyke',
  'Maz Kanata': 'Maz Kanata', 'Oga Garra': 'Oga Garra', 'Général Kalani': 'Kalani', 'Borsk Fey’lya': "Borsk Fey'lya",
  'Chancelière Lanever Villecham': 'Lanever Villecham', 'Gouverneur Adelhard': 'Adelhard', 'Directeur Hirken': 'Mirkovig Hirken',
  'Aristocra Formbi': 'Chaf\'orm\'bintrano', 'Reine-Mère Ta’a Chume': "Ta'a Chume", 'Reine-Mère Tenel Ka': 'Tenel Ka Djo',
};

// Illustrations of the unit classes for each style: [collection, SWAPI id].
const V = (id) => ['vehicles', id];
const S = (id) => ['starships', id];
const P = (id) => ['people', id];
const GENERIC = {
  infantry: V(7), armor: V(14), artillery: V(4), fighter: S(39), bomber: S(11), gunship: S(5), frigate: S(23),
  raider: S(10), capital: S(31), superdestroyer: S(40), battlestation: S(9),
};
export const UNIT_ART = {
  imperial: { infantry: V(30), armor: V(18), artillery: V(19), fighter: V(8), bomber: V(16), gunship: S(5), frigate: S(22), raider: V(26), capital: S(15), superdestroyer: S(15), battlestation: S(9) },
  clone: { infantry: V(30), armor: V(18), artillery: V(19), fighter: S(48), bomber: S(11), gunship: S(5), frigate: S(31), raider: S(31), capital: S(43), superdestroyer: S(15), battlestation: S(9) },
  rebel: { infantry: V(7), armor: V(14), artillery: V(14), fighter: S(12), bomber: S(11), gunship: S(28), frigate: S(23), raider: S(10), capital: S(27), superdestroyer: S(27), battlestation: S(9) },
  newrepublic: { infantry: V(7), armor: V(14), artillery: V(14), fighter: S(12), bomber: S(29), gunship: S(28), frigate: S(23), raider: S(10), capital: S(27), superdestroyer: S(27), battlestation: S(9) },
  resistance: { infantry: V(7), armor: V(14), artillery: V(14), fighter: S(12), bomber: S(29), gunship: S(28), frigate: S(23), raider: S(10), capital: S(27), superdestroyer: S(27), battlestation: S(9) },
  firstorder: { infantry: V(30), armor: V(18), artillery: V(19), fighter: V(8), bomber: V(16), gunship: S(22), frigate: S(22), raider: V(26), capital: S(15), superdestroyer: S(15), battlestation: S(9) },
  separatist: { infantry: V(36), armor: V(35), artillery: V(34), fighter: V(33), bomber: S(41), gunship: V(37), frigate: S(47), raider: S(41), capital: S(43), superdestroyer: S(40), battlestation: S(9) },
  hutt: { infantry: V(25), armor: V(24), artillery: V(4), fighter: S(21), bomber: S(21), gunship: V(25), frigate: S(47), raider: S(10), capital: S(47), superdestroyer: V(24), battlestation: S(9) },
  criminal: { infantry: V(42), armor: V(20), artillery: V(4), fighter: S(21), bomber: S(21), gunship: V(20), frigate: S(47), raider: S(10), capital: S(47), superdestroyer: S(47), battlestation: S(9) },
  mando: { ...GENERIC, infantry: P(69), fighter: S(21), raider: S(21) },
  wookiee: { ...GENERIC, infantry: P(13) },
  chiss: GENERIC,
  corporate: GENERIC,
  hapes: { ...GENERIC, capital: S(40) },
  generic: GENERIC,
};

// Illustrations of events.
export const EVENT_ART = {
  miners_strike: V(4), corruption: P(33), kyber_find: S(48), bounty_hunter: P(22), pirates: P(24), hutt_offer: P(45),
  spice_smugglers: S(10), jedi_ruins: P(20), banking_crisis: P(77), trade_boom: S(47), peace_protests: P(35),
  independence_movement: P(68), defector: P(81), shipyard_accident: S(15), refugees: S(47), riots: V(36),
  blue_shadow: P(83), ion_storm: S(23),
  scarif_plans: S(9), dissolve_imperial_senate: P(59), tarkin_demonstration: P(12), order66: P(20),
  wookiee_enslavement: P(80), hosnian_strike: P(88), jakku_battle: ['planets', 61],
};

// ---------------------------------------------------------------- resolution

let manifest = { files: {} };

export const getManifest = () => manifest;

export async function loadManifest() {
  try {
    const res = await fetch('assets/manifest.json', { cache: 'no-cache' });
    if (res.ok) manifest = await res.json();
  } catch {
    // No local assets: everything is loaded from GitHub.
  }
}

/** URL of an asset: the local copy when downloaded, else the remote source (or null). */
function resolve(key, remote) {
  const local = manifest.files[key];
  if (local) return `assets/${local}`;
  return remote;
}

const swapiUrl = ([collection, id]) => resolve(`${collection}/${id}`, `${SWAPI_BASE}/${collection}/${id}.jpg`);

export function planetImage(sysId) {
  if (PLANETS[sysId]) return swapiUrl(['planets', PLANETS[sysId]]);
  return resolve(`wookieepedia/planets/${sysId}`, null);
}

export function leaderImage(name) {
  if (LEADERS[name]) return swapiUrl(['people', LEADERS[name]]);
  return resolve(`wookieepedia/leaders/${slug(name)}`, null);
}

export function unitImage(style, type) {
  const ref = (UNIT_ART[style] || GENERIC)[type] || GENERIC[type];
  return ref ? swapiUrl(ref) : null;
}

export function eventImage(id) {
  const ref = EVENT_ART[id];
  return ref ? swapiUrl(ref) : null;
}

/** Emblem of a faction: { url, svg } — SVG icons are recoloured with the faction colour. */
export function emblemIcon(factionId) {
  const wook = manifest.files[`wookieepedia/emblems/${factionId}`];
  if (wook) return { url: `assets/${wook}`, svg: wook.endsWith('.svg') };
  const icon = EMBLEMS[factionId];
  if (icon) return { url: resolve(`emblems/${icon}`, `${FA_BASE}/${icon}.svg`), svg: true };
  return null;
}

export function iconUrl(name) {
  return resolve(`emblems/${name}`, `${FA_BASE}/${name}.svg`);
}

export function slug(text) {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

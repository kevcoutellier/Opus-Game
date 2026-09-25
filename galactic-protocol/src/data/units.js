// Unit classes. The original game has land, air and sea units; here ground troops, starfighters and starships.
// atk = damage rating against each category (air = starfighters, ship = starships and stations, ground = troops
// and planetary garrisons). Costs are paid when the order is placed; upkeep is paid every day.

export const UNIT_CATS = {
  ground: 'Troupes au sol',
  air: 'Chasseurs',
  ship: 'Vaisseaux',
  station: 'Station de combat',
};

export const UNIT_TYPES = {
  infantry: {
    cat: 'ground', label: 'Infanterie', hp: 60, atk: { air: 1, ship: 0, ground: 6 }, def: 2, speed: 18,
    cost: { cr: 40, dura: 4 }, mp: 8, upkeep: 0.2, use: { bacta: 0.01 }, days: 20,
    desc: 'Troupes d’occupation bon marché, indispensables pour prendre et tenir une planète.',
  },
  armor: {
    cat: 'ground', label: 'Blindés', hp: 100, atk: { air: 1, ship: 0, ground: 12 }, def: 5, speed: 16,
    cost: { cr: 110, dura: 25 }, mp: 5, upkeep: 0.5, use: { bacta: 0.01 }, days: 35,
    desc: 'Marcheurs et chars à répulseurs : le fer de lance des assauts planétaires.',
  },
  artillery: {
    cat: 'ground', label: 'Artillerie', hp: 50, atk: { air: 2, ship: 0, ground: 15 }, def: 1, speed: 15,
    cost: { cr: 90, dura: 20 }, mp: 4, upkeep: 0.4, use: {}, days: 30, siege: 1.6,
    desc: 'Pièces lourdes, redoutables contre les garnisons et les boucliers planétaires.',
  },
  fighter: {
    cat: 'air', label: 'Chasseurs', hp: 25, atk: { air: 8, ship: 1.5, ground: 1.5 }, def: 2, speed: 24,
    cost: { cr: 45, dura: 6, tib: 2 }, mp: 1, upkeep: 0.2, use: { tib: 0.03 }, days: 20,
    desc: 'Supériorité spatiale : abattent chasseurs et bombardiers ennemis.',
  },
  bomber: {
    cat: 'air', label: 'Bombardiers', hp: 35, atk: { air: 2, ship: 9, ground: 7 }, def: 2, speed: 20,
    cost: { cr: 70, dura: 10, tib: 3 }, mp: 1, upkeep: 0.3, use: { tib: 0.03 }, days: 25,
    desc: 'Torpilles à protons contre les vaisseaux capitaux.',
  },
  gunship: {
    cat: 'air', label: 'Transports d’assaut', hp: 45, atk: { air: 3, ship: 1, ground: 11 }, def: 3, speed: 20,
    cost: { cr: 65, dura: 10, tib: 2 }, mp: 2, upkeep: 0.3, use: { tib: 0.03 }, days: 25,
    desc: 'Appui rapproché des troupes au sol pendant l’invasion.',
  },
  frigate: {
    cat: 'ship', label: 'Frégates', hp: 160, atk: { air: 11, ship: 7, ground: 3 }, def: 6, speed: 28,
    cost: { cr: 220, dura: 60, tib: 15 }, mp: 3, upkeep: 1.1, use: { tib: 0.12 }, days: 60,
    desc: 'Escorteurs rapides, efficaces contre les chasseurs.',
  },
  raider: {
    cat: 'ship', label: 'Corsaires', hp: 120, atk: { air: 3, ship: 12, ground: 2 }, def: 4, speed: 32,
    cost: { cr: 200, dura: 45, tib: 12 }, mp: 2, upkeep: 0.9, use: { tib: 0.1 }, days: 55, stealth: true, raid: true,
    desc: 'Furtifs : invisibles sans renseignement, ils pillent le commerce des systèmes ennemis.',
  },
  capital: {
    cat: 'ship', label: 'Vaisseaux capitaux', hp: 650, atk: { air: 12, ship: 28, ground: 16 }, def: 12, speed: 22,
    cost: { cr: 900, dura: 240, tib: 60, kyb: 6 }, mp: 10, upkeep: 4.5, use: { tib: 0.5 }, days: 140, hangar: 6, bombard: true,
    desc: 'Destroyers et croiseurs : puissance de feu et hangars pour 6 escadrilles.',
  },
  superdestroyer: {
    cat: 'ship', label: 'Super-cuirassés', hp: 3200, atk: { air: 40, ship: 110, ground: 60 }, def: 20, speed: 15,
    cost: { cr: 5000, dura: 1400, tib: 300, kyb: 40 }, mp: 40, upkeep: 25, use: { tib: 2.5 }, days: 420, hangar: 24, bombard: true,
    requires: { tech: 'fleet_dreadnought', tag: 'major-yard' },
    desc: 'Vaisseau amiral colossal. Exige un chantier naval majeur.',
  },
  battlestation: {
    cat: 'station', label: 'Station de combat', hp: 9000, atk: { air: 60, ship: 220, ground: 120 }, def: 30, speed: 14,
    cost: { cr: 0 }, mp: 0, upkeep: 60, use: { tib: 6, kyb: 1 }, days: 0, hangar: 60, bombard: true, superlaser: true, unique: true,
    desc: 'Arme ultime capable de détruire une planète entière.',
  },
};

// Hull classes used by combat to split damage.
export const isSpace = (type) => UNIT_TYPES[type].cat !== 'ground';
export const isGround = (type) => UNIT_TYPES[type].cat === 'ground';

export function unitPower(type) {
  const u = UNIT_TYPES[type];
  return Math.sqrt(u.hp * (u.atk.air + u.atk.ship + u.atk.ground));
}

// Names of every unit class depending on the faction's style.
export const UNIT_NAMES = {
  imperial: {
    infantry: 'Stormtroopers', armor: 'Marcheurs AT-AT', artillery: 'Artillerie SPMA-T', fighter: 'Chasseurs TIE',
    bomber: 'Bombardiers TIE', gunship: 'Transports d’assaut TIE', frigate: 'Croiseurs Arquitens', raider: 'Corvettes Raider',
    capital: 'Destroyers stellaires', superdestroyer: 'Super-destroyers stellaires', battlestation: 'Étoile de la Mort',
  },
  clone: {
    infantry: 'Soldats clones', armor: 'Marcheurs AT-TE', artillery: 'Artillerie SPHA-T', fighter: 'Chasseurs ARC-170',
    bomber: 'Bombardiers Y-wing BTL-B', gunship: 'Canonnières LAAT', frigate: 'Frégates Pelta', raider: 'Corvettes CR90',
    capital: 'Destroyers stellaires Venator', superdestroyer: 'Cuirassés Mandator', battlestation: 'Étoile de la Mort',
  },
  rebel: {
    infantry: 'Soldats de l’Alliance', armor: 'Chars T2-B', artillery: 'Artillerie 1.4 FD', fighter: 'X-wings',
    bomber: 'Y-wings', gunship: 'U-wings', frigate: 'Frégates Nebulon-B', raider: 'Corvettes CR90',
    capital: 'Croiseurs Mon Calamari', superdestroyer: 'Croiseurs stellaires lourds', battlestation: 'Station de combat',
  },
  newrepublic: {
    infantry: 'Soldats de la Nouvelle République', armor: 'Chars à répulseurs', artillery: 'Artillerie lourde', fighter: 'X-wings T-70',
    bomber: 'Bombardiers B-wing', gunship: 'Canonnières U-wing', frigate: 'Frégates Nebulon-C', raider: 'Corvettes Hammerhead',
    capital: 'Croiseurs MC80', superdestroyer: 'Croiseurs Starhawk', battlestation: 'Station de combat',
  },
  resistance: {
    infantry: 'Soldats de la Résistance', armor: 'Speeders à skis', artillery: 'Canons anti-véhicules', fighter: 'X-wings T-70',
    bomber: 'Bombardiers MG-100', gunship: 'Transports U-wing', frigate: 'Frégates médicales', raider: 'Corvettes Hammerhead',
    capital: 'Croiseurs MC85', superdestroyer: 'Croiseurs lourds', battlestation: 'Station de combat',
  },
  firstorder: {
    infantry: 'Stormtroopers du Premier Ordre', armor: 'Marcheurs AT-M6', artillery: 'Artillerie lourde', fighter: 'Chasseurs TIE/fo',
    bomber: 'Bombardiers TIE', gunship: 'Navettes Upsilon', frigate: 'Frégates du Premier Ordre', raider: 'Corvettes furtives',
    capital: 'Destroyers stellaires Resurgent', superdestroyer: 'Cuirassés de siège', battlestation: 'Base Starkiller',
  },
  separatist: {
    infantry: 'Droïdes de combat B1', armor: 'Chars AAT', artillery: 'Artillerie droïde', fighter: 'Chasseurs Vulture',
    bomber: 'Bombardiers Hyena', gunship: 'Canonnières HMP', frigate: 'Frégates Munificent', raider: 'Destroyers Recusant',
    capital: 'Croiseurs Providence', superdestroyer: 'Cuirassés Subjugator', battlestation: 'Station de combat',
  },
  hutt: {
    infantry: 'Mercenaires gamorréens', armor: 'Barges blindées', artillery: 'Canons de siège', fighter: 'Chasseurs Kimogila',
    bomber: 'Bombardiers pirates', gunship: 'Canonnières', frigate: 'Frégates marchandes armées', raider: 'Corsaires',
    capital: 'Cuirassés hutts', superdestroyer: 'Palais de guerre hutts', battlestation: 'Station de combat',
  },
  criminal: {
    infantry: 'Hommes de main', armor: 'Speeders blindés', artillery: 'Artillerie légère', fighter: 'Chasseurs StarViper',
    bomber: 'Bombardiers de contrebande', gunship: 'Canonnières', frigate: 'Frégates de contrebande', raider: 'Corsaires',
    capital: 'Croiseurs lourds', superdestroyer: 'Cuirassés', battlestation: 'Station de combat',
  },
  chiss: {
    infantry: 'Phalanges chiss', armor: 'Blindés chiss', artillery: 'Artillerie chiss', fighter: 'Chasseurs Clawcraft',
    bomber: 'Bombardiers chiss', gunship: 'Canonnières chiss', frigate: 'Frégates de piquet', raider: 'Patrouilleurs furtifs',
    capital: 'Croiseurs lourds chiss', superdestroyer: 'Vaisseaux amiraux chiss', battlestation: 'Station de combat',
  },
  mando: {
    infantry: 'Guerriers mandaloriens', armor: 'Blindés mandaloriens', artillery: 'Artillerie mandalorienne', fighter: 'Chasseurs Fang',
    bomber: 'Bombardiers Kom’rk', gunship: 'Transports Gauntlet', frigate: 'Frégates Kandosii', raider: 'Chasseurs de primes',
    capital: 'Croiseurs mandaloriens', superdestroyer: 'Cuirassés mandaloriens', battlestation: 'Station de combat',
  },
  corporate: {
    infantry: 'Espos', armor: 'Blindés de sécurité', artillery: 'Artillerie corporative', fighter: 'Chasseurs Z-95',
    bomber: 'Bombardiers corporatifs', gunship: 'Canonnières', frigate: 'Frégates de sécurité', raider: 'Corvettes',
    capital: 'Croiseurs de sécurité', superdestroyer: 'Cuirassés corporatifs', battlestation: 'Station de combat',
  },
  hapes: {
    infantry: 'Gardes royaux', armor: 'Blindés hapiens', artillery: 'Artillerie hapienne', fighter: 'Chasseurs Miy’til',
    bomber: 'Bombardiers hapiens', gunship: 'Canonnières', frigate: 'Frégates Nova', raider: 'Corvettes',
    capital: 'Dragons de bataille', superdestroyer: 'Dragons royaux', battlestation: 'Station de combat',
  },
  wookiee: {
    infantry: 'Guerriers wookiees', armor: 'Catamarans blindés', artillery: 'Balistes wookiees', fighter: 'Chasseurs Auzituck',
    bomber: 'Bombardiers', gunship: 'Canonnières', frigate: 'Frégates', raider: 'Corvettes',
    capital: 'Croiseurs', superdestroyer: 'Cuirassés', battlestation: 'Station de combat',
  },
  generic: {
    infantry: 'Milices', armor: 'Blindés', artillery: 'Artillerie', fighter: 'Chasseurs Z-95',
    bomber: 'Bombardiers', gunship: 'Canonnières', frigate: 'Frégates', raider: 'Corvettes',
    capital: 'Croiseurs', superdestroyer: 'Cuirassés', battlestation: 'Station de combat',
  },
};

// Share of each unit class in a faction's starting forces and in the AI's orders.
export const DOCTRINES = {
  imperial: { infantry: 6, armor: 3, artillery: 1, fighter: 5, bomber: 2, gunship: 1, frigate: 3, raider: 1, capital: 2 },
  rebel: { infantry: 4, armor: 1, artillery: 1, fighter: 6, bomber: 3, gunship: 2, frigate: 3, raider: 2, capital: 1 },
  criminal: { infantry: 6, armor: 1, artillery: 1, fighter: 4, bomber: 1, gunship: 1, frigate: 2, raider: 3, capital: 0.6 },
  balanced: { infantry: 5, armor: 2, artillery: 1, fighter: 4, bomber: 2, gunship: 1, frigate: 2, raider: 1, capital: 1 },
  defensive: { infantry: 7, armor: 2, artillery: 2, fighter: 4, bomber: 1, gunship: 1, frigate: 2, raider: 0.5, capital: 0.8 },
};

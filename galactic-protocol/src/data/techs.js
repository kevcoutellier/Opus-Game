// Technology tree: 47 technologies in 7 branches, like the 47 technologies of the original game.
// `mods` are faction-wide modifiers summed by research.js (see techMods()).

export const BRANCHES = {
  eco: 'Économie',
  army: 'Armée de terre',
  fleet: 'Flotte',
  log: 'Hyperespace & logistique',
  intel: 'Renseignement',
  soc: 'Société',
  super: 'Superarmes & défense',
};

export const TIER_COST = [0, 220, 480, 900, 1500, 2300];

const T = (id, branch, tier, name, req, mods, desc) => ({ id, branch, tier, name, req, mods, desc, cost: TIER_COST[tier] });

export const TECHS = [
  // Économie
  T('eco_droids', 'eco', 1, 'Droïdes ouvriers', [], { output: 0.08 }, '+8 % de production.'),
  T('eco_mining', 'eco', 1, 'Extraction orbitale', [], { extract: 0.25 }, '+25 % d’extraction de ressources.'),
  T('eco_credit', 'eco', 2, 'Crédit galactique', ['eco_droids'], { taxEff: 0.08 }, '+8 % d’efficacité fiscale.'),
  T('eco_trade', 'eco', 2, 'Guildes marchandes', ['eco_droids'], { trade: 0.5, fee: -0.04 }, 'Commerce plus rentable, frais de marché réduits.'),
  T('eco_factories', 'eco', 3, 'Usines automatisées', ['eco_credit'], { output: 0.12, buildCost: -0.15 }, '+12 % de production, bâtiments 15 % moins chers.'),
  T('eco_terraform', 'eco', 3, 'Terraformation', ['eco_mining'], { slots: 1, growth: 0.3 }, '+1 emplacement de bâtiment par système.'),
  T('eco_megacorp', 'eco', 4, 'Mégacorporations', ['eco_factories', 'eco_trade'], { output: 0.15, taxEff: 0.05 }, '+15 % de production.'),

  // Armée de terre
  T('army_blasters', 'army', 1, 'Fusils blasters lourds', [], { 'atk.infantry': 0.2 }, '+20 % d’attaque de l’infanterie.'),
  T('army_repulsor', 'army', 1, 'Blindés à répulseurs', [], { 'atk.armor': 0.15, 'hp.armor': 0.15 }, '+15 % d’attaque et de PV des blindés.'),
  T('army_walkers', 'army', 2, 'Marcheurs lourds', ['army_repulsor'], { 'atk.armor': 0.25, 'hp.armor': 0.2 }, 'Marcheurs de combat : blindés renforcés.'),
  T('army_doctrine', 'army', 2, 'Doctrine d’assaut planétaire', ['army_blasters'], { 'def.ground': 0.15, invasion: 0.15 }, '+15 % de défense et +15 % en invasion.'),
  T('army_artillery', 'army', 3, 'Artillerie à turbolaser', ['army_doctrine'], { 'atk.artillery': 0.4 }, '+40 % d’attaque de l’artillerie.'),
  T('army_siege', 'army', 3, 'Guerre de siège', ['army_doctrine'], { siege: 0.35 }, '+35 % de dégâts contre garnisons et boucliers.'),
  T('army_elite', 'army', 4, 'Troupes d’élite', ['army_artillery', 'army_walkers'], { 'atk.ground': 0.2, 'hp.ground': 0.2 }, 'Commandos et troupes de choc : +20 % à toutes les troupes.'),

  // Flotte
  T('fleet_turbolasers', 'fleet', 1, 'Turbolasers lourds', [], { 'atk.ship': 0.15 }, '+15 % d’attaque des vaisseaux.'),
  T('fleet_shields', 'fleet', 1, 'Boucliers déflecteurs', [], { 'hp.ship': 0.15 }, '+15 % de PV des vaisseaux.'),
  T('fleet_fighters', 'fleet', 2, 'Chasseurs d’interception', ['fleet_turbolasers'], { 'atk.fighter': 0.3, 'hp.fighter': 0.2 }, 'Chasseurs de nouvelle génération.'),
  T('fleet_torpedoes', 'fleet', 2, 'Torpilles à protons', ['fleet_turbolasers'], { 'atk.bomber': 0.35 }, '+35 % d’attaque des bombardiers.'),
  T('fleet_capitals', 'fleet', 3, 'Destroyers de nouvelle classe', ['fleet_shields'], { 'atk.capital': 0.25, 'hp.capital': 0.2 }, 'Vaisseaux capitaux améliorés.'),
  T('fleet_interdictor', 'fleet', 3, 'Champs d’interdiction', ['fleet_shields'], { interdict: 1 }, 'Les flottes ennemies ne peuvent plus fuir un combat contre vos vaisseaux capitaux.'),
  T('fleet_dreadnought', 'fleet', 4, 'Super-cuirassés', ['fleet_capitals'], { unlock: 'superdestroyer' }, 'Débloque les super-cuirassés (chantier majeur requis).'),

  // Hyperespace & logistique
  T('log_hyperdrive', 'log', 1, 'Hyperpropulseurs classe 1', [], { speed: 0.15 }, '+15 % de vitesse de déplacement.'),
  T('log_supply', 'log', 1, 'Chaînes logistiques', [], { upkeep: -0.1 }, '-10 % d’entretien des unités.'),
  T('log_navicomp', 'log', 2, 'Ordinateurs de navigation', ['log_hyperdrive'], { speed: 0.15 }, '+15 % de vitesse.'),
  T('log_mapping', 'log', 2, 'Cartographie des hyperroutes', ['log_hyperdrive'], { vision: 1, trade: 0.25 }, 'Vision étendue et commerce accru.'),
  T('log_prefab', 'log', 3, 'Construction préfabriquée', ['log_supply'], { buildTime: -0.25, prodTime: -0.15 }, 'Chantiers et bâtiments plus rapides.'),
  T('log_depots', 'log', 3, 'Ravitaillement en profondeur', ['log_supply'], { attrition: -1, heal: 0.3 }, 'Aucune attrition en territoire ennemi, soins accélérés.'),
  T('log_class05', 'log', 4, 'Hyperpropulseurs classe 0,5', ['log_navicomp', 'log_prefab'], { speed: 0.3 }, '+30 % de vitesse.'),

  // Renseignement
  T('intel_slicing', 'intel', 1, 'Piratage (slicing)', [], { opSuccess: 8 }, '+8 % de réussite des opérations.'),
  T('intel_informants', 'intel', 1, 'Réseaux d’informateurs', [], { agents: 1, ip: 0.15 }, '+1 agent, +15 % de renseignement.'),
  T('intel_counter', 'intel', 2, 'Contre-espionnage avancé', ['intel_informants'], { counter: 15 }, '+15 au contre-espionnage.'),
  T('intel_holonet', 'intel', 2, 'Surveillance HoloNet', ['intel_slicing'], { vision: 1, stability: 2 }, 'Vision étendue et contrôle de l’information.'),
  T('intel_sleepers', 'intel', 3, 'Agents dormants', ['intel_counter'], { agents: 1, opCost: -0.2 }, '+1 agent, opérations 20 % moins chères.'),
  T('intel_stygium', 'intel', 4, 'Occultation au stygium', ['intel_sleepers', 'intel_holonet'], { opSuccess: 12, stealth: 1 }, 'Vos corsaires deviennent indétectables.'),

  // Société
  T('soc_bacta', 'soc', 1, 'Traitements au bacta', [], { stability: 3, heal: 0.5 }, '+3 de stabilité, soins accélérés.'),
  T('soc_propaganda', 'soc', 1, 'Propagande HoloNet', [], { stability: 3, sympathy: -0.03 }, '+3 de stabilité, freine l’insurrection.'),
  T('soc_academies', 'soc', 2, 'Académies galactiques', ['soc_bacta'], { rp: 0.2 }, '+20 % de recherche.'),
  T('soc_sectors', 'soc', 2, 'Administration sectorielle', ['soc_propaganda'], { stability: 4, occupation: 0.3 }, 'Moffs et gouverneurs : les territoires conquis s’intègrent plus vite.'),
  T('soc_conscription', 'soc', 3, 'Registres de conscription', ['soc_sectors'], { manpower: 0.4 }, '+40 % d’effectifs.'),
  T('soc_unity', 'soc', 4, 'Unité galactique', ['soc_academies', 'soc_conscription'], { stability: 8 }, '+8 de stabilité nationale.'),

  // Superarmes & défense
  T('def_shields', 'super', 1, 'Boucliers planétaires lourds', [], { shield: 0.5 }, '+50 % de résistance des boucliers planétaires.'),
  T('def_ion', 'super', 2, 'Canons à ions planétaires', ['def_shields'], { unlock: 'ion_cannon' }, 'Débloque le canon à ions planétaire.'),
  T('super_kyber', 'super', 2, 'Amplification kyber', [], { 'extract.kyb': 0.5 }, '+50 % d’extraction de kyber.'),
  T('super_bdz', 'super', 3, 'Doctrine Base Delta Zéro', ['super_kyber'], { unlock: 'bdz' }, 'Autorise le bombardement orbital total d’une planète.'),
  T('def_fortress', 'super', 3, 'Mondes-forteresses', ['def_ion'], { garrison: 0.4 }, '+40 % de garnison planétaire.'),
  T('super_laser', 'super', 4, 'Superlaser', ['super_bdz'], { unlock: 'battlestation' }, 'Débloque le mégaprojet de station de combat.'),
  T('super_starkiller', 'super', 5, 'Projet Starkiller', ['super_laser'], { superCharge: -0.4 }, 'Rechargement des superarmes 40 % plus rapide.'),
];

export const TECH_BY_ID = Object.fromEntries(TECHS.map((t) => [t.id, t]));

// Star systems of the galaxy (the "provinces" of the game).
//
// Positions are derived from the canon galactic grid (column letter + row number): the grid square gives
// the direction from the galactic centre, the region gives the distance band, and `frac` places the system
// inside that band. galaxy.js then relaxes the layout so that no two systems overlap.
//
// Columns: id, name, grid, region, frac, pop (billions), dev (1-10), size (1-6), deposits, tags, description.
// Deposits: d = durasteel, t = tibanna, k = kyber, b = bacta, s = épice, followed by a level 1-5.

export const REGIONS = {
  deep: { name: 'Noyau Profond', band: [0, 115] },
  core: { name: 'Mondes du Noyau', band: [120, 240] },
  colonies: { name: 'Colonies', band: [245, 340] },
  inner: { name: 'Bordure Intérieure', band: [345, 445] },
  expansion: { name: "Région d'Expansion", band: [450, 540] },
  mid: { name: 'Bordure Médiane', band: [545, 720] },
  outer: { name: 'Bordure Extérieure', band: [725, 1000] },
  hutt: { name: 'Espace Hutt', band: [600, 900] },
  corporate: { name: 'Secteur Corporatif', band: [760, 1000] },
  unknown: { name: 'Régions Inconnues', band: [830, 1080] },
};

const RAW = [
  // Noyau Profond
  ['byss', 'Byss', 'L10', 'deep', 0.65, 3, 6, 3, 'd2', [], 'Monde-forteresse caché du Noyau Profond, refuge de l’Empereur.'],
  ['tython', 'Tython', 'L11', 'deep', 0.7, 0.3, 3, 2, 'k2', ['jedi'], 'Berceau légendaire de l’Ordre Jedi.'],
  ['prakith', 'Prakith', 'M10', 'deep', 0.75, 2, 5, 3, 'd2', [], ''],
  ['empress_teta', 'Empress Teta', 'K10', 'deep', 0.7, 4, 6, 3, 'd3', [], 'Monde minier et industriel du Noyau Profond.'],

  // Mondes du Noyau
  ['coruscant', 'Coruscant', 'L9', 'core', 0.3, 1000, 10, 6, '', ['ecumenopolis'], 'Planète-ville, siège du pouvoir galactique depuis des millénaires.'],
  ['chandrila', 'Chandrila', 'L8', 'core', 0.6, 2, 7, 4, 'b1', ['culture'], 'Monde agricole paisible, patrie de Mon Mothma.'],
  ['corulag', 'Corulag', 'M9', 'core', 0.5, 5, 7, 3, '', ['academy'], 'Siège d’une académie militaire impériale.'],
  ['anaxes', 'Anaxès', 'K9', 'core', 0.6, 3, 6, 3, 'd1', ['shipyard'], 'Chantiers navals de la Flotte depuis la Guerre des Clones.'],
  ['brentaal', 'Brentaal IV', 'K10', 'core', 0.55, 6, 8, 3, '', ['trade'], 'Carrefour commercial de la Route Perlemienne.'],
  ['alderaan', 'Alderaan', 'M10', 'core', 0.6, 2, 8, 4, 'b1', ['culture'], 'Monde pacifique renommé pour sa culture et sa diplomatie.'],
  ['kuat', 'Kuat', 'N10', 'core', 0.55, 3, 9, 4, 'd3', ['shipyard', 'major-yard'], 'Chantiers Kuat Drive Yards : les plus grands de la galaxie.'],
  ['corellia', 'Corellia', 'M11', 'core', 0.55, 15, 9, 5, 'd2', ['shipyard', 'major-yard'], 'Chantiers de la Corellian Engineering Corporation, patrie des pilotes.'],
  ['duro', 'Duro', 'N11', 'core', 0.8, 4, 7, 3, 'd2', ['shipyard'], 'Monde pollué, orbites couvertes de cités-stations.'],
  ['hosnian', 'Hosnian Prime', 'K11', 'core', 0.7, 20, 8, 4, '', ['ecumenopolis'], 'Monde urbanisé du Noyau.'],
  ['ralltiir', 'Ralltiir', 'K8', 'core', 0.5, 3, 7, 3, '', ['banking'], 'Place financière réputée du Noyau.'],
  ['humbarine', 'Humbarine', 'N9', 'core', 0.6, 5, 7, 3, '', [], ''],
  ['esseles', 'Esseles', 'N12', 'core', 0.45, 3, 7, 3, '', [], ''],
  ['metellos', 'Metellos', 'L8', 'core', 0.25, 10, 7, 3, '', [], 'Monde voisin de Coruscant.'],
  ['grizmallt', 'Grizmallt', 'J10', 'core', 0.5, 2, 6, 3, 'd1', [], ''],

  // Colonies
  ['carida', 'Carida', 'M12', 'colonies', 0.5, 1, 6, 3, '', ['academy'], 'Académie militaire de l’Empire, monde à haute gravité.'],
  ['commenor', 'Commenor', 'L12', 'colonies', 0.5, 3, 7, 3, '', ['trade'], ''],
  ['abregado', 'Abregado-rae', 'K12', 'colonies', 0.5, 2, 6, 3, '', ['trade'], ''],
  ['fondor', 'Fondor', 'O11', 'colonies', 0.5, 3, 8, 3, 'd2', ['shipyard', 'major-yard'], 'Chantiers orbitaux géants.'],
  ['cato_neimoidia', 'Cato Neimoidia', 'O9', 'colonies', 0.5, 2, 8, 3, '', ['trade'], 'Monde-trésor des Neimoidiens.'],
  ['neimoidia', 'Neimoidia', 'N8', 'colonies', 0.6, 3, 7, 3, 'd1', [], ''],
  ['rendili', 'Rendili', 'M8', 'colonies', 0.5, 2, 7, 3, 'd1', ['shipyard'], 'Rendili StarDrive, constructeur de croiseurs.'],
  ['balmorra', 'Balmorra', 'K8', 'colonies', 0.75, 1, 6, 3, 'd2', [], 'Usines d’armement et de droïdes.'],
  ['ghorman', 'Ghorman', 'J11', 'colonies', 0.5, 2, 6, 3, '', ['culture'], 'Monde textile fier de son indépendance.'],
  ['tangenine', 'Tangenine', 'J9', 'colonies', 0.5, 1, 5, 3, '', [], ''],
  ['axum', 'Axum', 'L13', 'colonies', 0.4, 1, 5, 3, '', [], ''],

  // Bordure Intérieure
  ['onderon', 'Onderon', 'O8', 'inner', 0.5, 2, 5, 3, 'd1', [], 'Monde de jungles, berceau des partisans de Saw Gerrera.'],
  ['hapes', 'Hapès', 'P10', 'inner', 0.5, 6, 8, 4, 'k1', ['shipyard'], 'Capitale du Consortium d’Hapès, monarchie isolationniste.'],
  ['terephon', 'Terephon', 'P9', 'inner', 0.65, 1, 6, 2, '', [], ''],
  ['gallinore', 'Gallinore', 'P11', 'inner', 0.65, 1, 6, 2, 'b2', [], ''],
  ['charubah', 'Charubah', 'Q10', 'inner', 0.9, 1, 5, 2, 'd1', [], ''],
  ['denon', 'Denon', 'N13', 'inner', 0.5, 30, 8, 4, '', ['trade', 'ecumenopolis'], 'Planète-ville au croisement de la Voie Hydienne et du Couloir Corellien.'],
  ['thyferra', 'Thyferra', 'J8', 'inner', 0.5, 1, 6, 3, 'b5', ['bacta'], 'Premier producteur de bacta de la galaxie.'],
  ['vardos', 'Vardos', 'K7', 'inner', 0.5, 1, 6, 3, '', [], ''],
  ['ord_ibanna', 'Ord Ibanna', 'L7', 'inner', 0.5, 0.5, 4, 2, 't3', ['gas'], 'Géante gazeuse riche en tibanna.'],

  // Région d'Expansion
  ['kafrene', 'Kafrene', 'O13', 'expansion', 0.5, 1, 5, 2, 'd2', ['trade'], 'L’Anneau de Kafrene, avant-poste minier et commercial.'],
  ['devaron', 'Devaron', 'O14', 'expansion', 0.5, 2, 5, 3, '', [], ''],
  ['lianna', 'Lianna', 'N14', 'expansion', 0.5, 3, 7, 3, 'd1', ['shipyard'], 'Siège de Sienar Fleet Systems, constructeur des TIE.'],
  ['aldhani', 'Aldhani', 'J13', 'expansion', 0.5, 0.1, 2, 2, '', [], 'Plateaux sacrés et garnison impériale.'],
  ['ansion', 'Ansion', 'I12', 'expansion', 0.5, 0.5, 3, 2, 'b1', [], ''],
  ['umbara', 'Umbara', 'M7', 'expansion', 0.5, 2, 6, 3, 'd1', [], 'Monde plongé dans l’ombre de la Nébuleuse Fantôme.'],

  // Bordure Médiane
  ['kashyyyk', 'Kashyyyk', 'P9', 'mid', 0.45, 0.5, 4, 4, 'd1', ['homeworld'], 'Monde forestier des Wookiees.'],
  ['trandosha', 'Trandosha', 'P8', 'mid', 0.4, 0.5, 4, 2, '', [], 'Patrie des chasseurs trandoshans.'],
  ['bothawui', 'Bothawui', 'R14', 'mid', 0.4, 3, 7, 3, '', ['spynet'], 'Cœur du réseau d’espions bothan.'],
  ['kothlis', 'Kothlis', 'R13', 'mid', 0.5, 0.5, 5, 2, '', [], ''],
  ['naboo', 'Naboo', 'O17', 'mid', 0.4, 4, 7, 4, 'b1', ['culture'], 'Monde verdoyant, patrie de Palpatine.'],
  ['malastare', 'Malastare', 'N16', 'mid', 0.5, 2, 5, 3, 't2', [], 'Réserves de carburant et courses de modules.'],
  ['ord_mantell', 'Ord Mantell', 'L7', 'mid', 0.3, 1, 5, 3, 'd1', ['criminal'], 'Monde de ferrailleurs et de contrebandiers.'],
  ['sluis_van', 'Sluis Van', 'M16', 'mid', 0.5, 1, 7, 3, 'd1', ['shipyard'], 'Chantiers de réparation du Secteur Sluis.'],
  ['jedha', 'Jedha', 'Q8', 'mid', 0.5, 0.01, 2, 2, 'k4', ['kyber', 'holy'], 'Lune sainte riche en cristaux kyber.'],
  ['ithor', 'Ithor', 'M15', 'mid', 0.5, 1, 4, 3, 'b1', [], ''],
  ['rodia', 'Rodia', 'Q16', 'mid', 0.7, 1, 4, 2, '', [], ''],
  ['mimban', 'Mimban', 'I14', 'mid', 0.5, 0.1, 2, 2, 't1 d2', [], 'Monde boueux riche en hypercarburant.'],
  ['vandor', 'Vandor', 'H12', 'mid', 0.3, 0.1, 2, 2, 't1', [], ''],
  ['wobani', 'Wobani', 'K15', 'mid', 0.5, 0.1, 2, 2, '', ['prison'], 'Camp de travail impérial.'],
  ['iridonia', 'Iridonia', 'P14', 'mid', 0.5, 1, 4, 2, '', [], ''],
  ['kijimi', 'Kijimi', 'J7', 'mid', 0.6, 0.1, 3, 2, 's2', ['criminal'], 'Cité enneigée de voleurs et de contrebandiers d’épice.'],
  ['takodana', 'Takodana', 'G9', 'mid', 0.4, 0.01, 3, 2, '', ['neutral'], 'Château de Maz Kanata, refuge neutre des voyageurs.'],
  ['jakku', 'Jakku', 'H12', 'mid', 0.75, 0.01, 1, 2, 'd2', ['graveyard'], 'Désert jonché d’épaves de vaisseaux.'],
  ['rothana', 'Rothana', 'N6', 'mid', 0.4, 0.5, 6, 2, 'd2', ['shipyard'], 'Rothana Heavy Engineering.'],
  ['bracca', 'Bracca', 'I10', 'mid', 0.55, 0.1, 3, 2, 'd3', [], 'Chantiers de démolition de vaisseaux.'],

  // Bordure Extérieure
  ['tatooine', 'Tatooine', 'R16', 'outer', 0.45, 0.2, 2, 2, '', ['desert'], 'Monde désertique aux deux soleils, fief de Jabba.'],
  ['geonosis', 'Géonosis', 'R16', 'outer', 0.25, 10, 5, 3, 'd4', ['foundry'], 'Fonderies de droïdes souterraines.'],
  ['ryloth', 'Ryloth', 'R17', 'outer', 0.4, 1.5, 4, 3, 's3', [], 'Patrie des Twi’leks, riche en ryll.'],
  ['christophsis', 'Christophsis', 'S17', 'outer', 0.5, 1, 5, 3, 'k1', [], 'Monde de cristal.'],
  ['hoth', 'Hoth', 'K18', 'outer', 0.6, 0, 1, 2, '', ['ice'], 'Planète de glace glaciale et isolée.'],
  ['bespin', 'Bespin', 'K18', 'outer', 0.4, 0.01, 5, 2, 't5', ['gas'], 'Cité des Nuages, mine de tibanna.'],
  ['anoat', 'Anoat', 'J18', 'outer', 0.5, 0.1, 2, 2, 'd1', [], ''],
  ['endor', 'Endor', 'H16', 'outer', 0.6, 0.03, 1, 2, '', ['forest'], 'Lune forestière des Ewoks.'],
  ['dagobah', 'Dagobah', 'M19', 'outer', 0.7, 0, 1, 1, '', ['swamp'], 'Marais brumeux, fort dans la Force.'],
  ['mustafar', 'Mustafar', 'L19', 'outer', 0.5, 0.02, 3, 2, 'd3', ['lava'], 'Monde volcanique, mines de minerais rares.'],
  ['utapau', 'Utapau', 'N19', 'outer', 0.5, 0.1, 3, 2, '', [], ''],
  ['sullust', 'Sullust', 'M17', 'outer', 0.3, 18, 6, 3, 'd2', ['shipyard'], 'SoroSuub Corporation, monde volcanique.'],
  ['eriadu', 'Eriadu', 'M18', 'outer', 0.3, 22, 7, 4, 'd2', ['shipyard'], 'Monde industriel, patrie de Tarkin.'],
  ['scarif', 'Scarif', 'T17', 'outer', 0.5, 0.01, 5, 2, '', ['archive'], 'Archives impériales derrière un bouclier planétaire.'],
  ['eadu', 'Eadu', 'T15', 'outer', 0.5, 0, 3, 1, '', ['research'], 'Laboratoires secrets d’armement.'],
  ['yavin', 'Yavin', 'P6', 'outer', 0.5, 0, 1, 2, '', ['temple'], 'Géante gazeuse et sa quatrième lune, couverte de temples.'],
  ['dantooine', 'Dantooine', 'L4', 'outer', 0.5, 0.01, 2, 3, '', [], 'Plaines paisibles, ancienne base rebelle.'],
  ['dathomir', 'Dathomir', 'O5', 'outer', 0.5, 0.01, 2, 2, '', [], 'Monde des Sœurs de la Nuit.'],
  ['mandalore', 'Mandalore', 'O7', 'outer', 0.3, 4, 6, 3, 'd3', ['beskar'], 'Patrie des Mandaloriens, source du beskar.'],
  ['concord_dawn', 'Concord Dawn', 'O7', 'outer', 0.5, 0.1, 3, 2, 'd1', [], ''],
  ['kalevala', 'Kalevala', 'N7', 'outer', 0.4, 0.5, 5, 2, '', [], ''],
  ['mon_cala', 'Mon Cala', 'U6', 'outer', 0.5, 10, 7, 4, '', ['shipyard', 'major-yard'], 'Monde océanique, chantiers des croiseurs Mon Calamari.'],
  ['kessel', 'Kessel', 'T10', 'outer', 0.4, 0.01, 3, 2, 's5 t1', ['spice'], 'Mines d’épice et de coaxium.'],
  ['oba_diah', 'Oba Diah', 'T9', 'outer', 0.6, 0.5, 3, 2, 's2', [], 'Siège du Syndicat Pyke.'],
  ['lothal', 'Lothal', 'S4', 'outer', 0.5, 0.5, 4, 3, 'd1', [], 'Monde agricole militarisé par l’Empire.'],
  ['garel', 'Garel', 'S5', 'outer', 0.65, 1, 5, 2, '', ['trade'], ''],
  ['felucia', 'Félucia', 'R6', 'outer', 0.5, 0.1, 2, 3, 'b2', [], 'Jungle de champignons géants.'],
  ['saleucami', 'Saleucami', 'Q5', 'outer', 0.5, 0.2, 2, 2, '', [], ''],
  ['mygeeto', 'Mygeeto', 'K3', 'outer', 0.5, 0.5, 6, 2, 'k3', ['banking'], 'Monde de cristal, coffres du Clan Bancaire.'],
  ['muunilinst', 'Muunilinst', 'K5', 'outer', 0.4, 5, 9, 3, '', ['banking'], 'Siège du Clan Bancaire InterGalactique.'],
  ['serenno', 'Serenno', 'M3', 'outer', 0.5, 1, 6, 3, '', [], 'Fief aristocratique du comte Dooku.'],
  ['raxus', 'Raxus', 'N3', 'outer', 0.6, 2, 6, 3, '', [], 'Ancienne capitale de la Confédération.'],
  ['moraband', 'Moraband', 'R5', 'outer', 0.85, 0, 1, 1, 'k1', ['sith'], 'Monde-tombeau des Seigneurs Sith.'],
  ['kamino', 'Kamino', 'S15', 'outer', 0.9, 0.1, 7, 2, '', ['cloning'], 'Planète océan, installations de clonage.'],
  ['rishi', 'Rishi', 'S15', 'outer', 0.65, 0, 2, 1, '', [], ''],
  ['cantonica', 'Cantonica', 'U12', 'outer', 0.4, 0.1, 8, 2, '', ['casino'], 'Canto Bight, ville-casino des marchands d’armes.'],
  ['ferrix', 'Ferrix', 'T13', 'outer', 0.4, 0.01, 3, 2, 'd2', [], 'Monde de récupérateurs.'],
  ['jabiim', 'Jabiim', 'P3', 'outer', 0.5, 0.5, 3, 2, 'd1', [], ''],
  ['crait', 'Crait', 'F13', 'outer', 0.2, 0, 1, 1, 'd1', ['mine'], 'Planète de sel et de minerai rouge.'],
  ['dqar', "D'Qar", 'E11', 'outer', 0.15, 0, 1, 2, '', [], 'Monde de jungle isolé.'],
  ['batuu', 'Batuu', 'E8', 'outer', 0.1, 0.01, 3, 2, '', ['outpost'], 'Avant-poste de Black Spire, dernier arrêt avant l’Espace Sauvage.'],
  ['zygerria', 'Zygerria', 'V9', 'outer', 0.5, 1, 4, 2, '', ['slavers'], 'Royaume des esclavagistes zygerriens.'],
  ['polis_massa', 'Polis Massa', 'M20', 'outer', 0.5, 0, 3, 1, 'd1', ['medical'], 'Avant-poste médical dans un champ d’astéroïdes.'],
  ['nevarro', 'Nevarro', 'H14', 'outer', 0.7, 0.01, 2, 2, '', [], 'Monde volcanique de chasseurs de primes.'],
  ['lah_mu', "Lah'mu", 'I17', 'outer', 0.7, 0, 1, 1, '', [], ''],

  // Espace Hutt
  ['nal_hutta', 'Nal Hutta', 'S12', 'hutt', 0.45, 3, 5, 4, 's2', [], 'Joyau glorieux des Hutts, capitale du Cartel.'],
  ['nar_shaddaa', 'Nar Shaddaa', 'S12', 'hutt', 0.55, 20, 6, 3, 's3', ['ecumenopolis', 'criminal'], 'La Lune des Contrebandiers.'],
  ['ylesia', 'Ylesia', 'T12', 'hutt', 0.7, 0.1, 2, 2, 's4', [], ''],
  ['toydaria', 'Toydaria', 'R12', 'hutt', 0.2, 1, 4, 2, '', [], ''],
  ['klatooine', 'Klatooine', 'S11', 'hutt', 0.5, 0.5, 2, 2, '', [], ''],
  ['sriluur', 'Sriluur', 'T13', 'hutt', 0.3, 0.5, 3, 2, 's1', [], ''],
  ['teth', 'Teth', 'S13', 'hutt', 0.75, 0, 2, 1, '', [], ''],
  ['florrum', 'Florrum', 'T11', 'hutt', 0.85, 0, 2, 1, 't1', ['pirates'], 'Repaire de pirates.'],

  // Secteur Corporatif
  ['etti', 'Etti IV', 'U4', 'corporate', 0.5, 5, 8, 3, '', ['trade'], 'Capitale de l’Autorité du Secteur Corporatif.'],
  ['bonadan', 'Bonadan', 'T3', 'corporate', 0.45, 3, 7, 3, 'd3', ['shipyard'], 'Monde-usine et spatioport géant.'],
  ['ammuud', 'Ammuud', 'U5', 'corporate', 0.75, 0.5, 5, 2, 'd1', [], ''],
  ['orron', 'Orron III', 'V5', 'corporate', 0.5, 1, 6, 2, 'b1', [], ''],
  ['duroon', 'Duroon', 'T4', 'corporate', 0.9, 0.5, 5, 2, 'd2', [], ''],
  ['kir', 'Kir', 'U3', 'corporate', 0.9, 0.2, 4, 2, 't1', [], ''],

  // Régions Inconnues
  ['csilla', 'Csilla', 'C10', 'unknown', 0.55, 5, 8, 4, 'd2', [], 'Monde glacé, capitale de l’Ascendance Chiss.'],
  ['naplou', 'Naplou', 'C9', 'unknown', 0.35, 1, 6, 2, '', [], ''],
  ['rentor', 'Rentor', 'D11', 'unknown', 0.35, 1, 6, 2, 'd1', [], ''],
  ['sposia', 'Sposia', 'C11', 'unknown', 0.8, 0.5, 5, 2, 't1', [], ''],
  ['avidich', 'Avidich', 'D9', 'unknown', 0.55, 0.5, 5, 2, 'k1', [], ''],
  ['copero', 'Copero', 'B10', 'unknown', 0.9, 0.3, 5, 2, 'd1', [], ''],
  ['ilum', 'Ilum', 'G7', 'unknown', 0.15, 0, 1, 2, 'k5', ['kyber'], 'Monde de glace aux cavernes de cristaux kyber.'],
];

// Great trade routes: waypoints joined by the shortest path on the hyperlane network (see galaxy.js).
export const TRADE_ROUTES = [
  { name: 'Couloir Corellien', waypoints: ['coruscant', 'corellia', 'duro', 'denon', 'devaron', 'rodia', 'ryloth', 'christophsis'] },
  { name: 'Voie Hydienne', waypoints: ['etti', 'lothal', 'onderon', 'denon', 'lianna', 'sluis_van', 'sullust', 'eriadu', 'polis_massa'] },
  { name: 'Route Perlemienne', waypoints: ['coruscant', 'brentaal', 'ralltiir', 'ord_mantell', 'muunilinst', 'mygeeto'] },
  { name: 'Route de Rimma', waypoints: ['abregado', 'ghorman', 'aldhani', 'wobani', 'sullust', 'anoat', 'hoth'] },
  { name: 'Épine Commerciale Corellienne', waypoints: ['corellia', 'esseles', 'ithor', 'naboo', 'utapau'] },
  { name: 'Route de Triellus', waypoints: ['coruscant', 'kuat', 'hapes', 'kashyyyk', 'nal_hutta', 'kessel'] },
];

const RES_CODES = { d: 'dura', t: 'tib', k: 'kyb', b: 'bacta', s: 'spice' };

function parseDeposits(code) {
  const res = {};
  for (const token of code.split(/\s+/).filter(Boolean)) res[RES_CODES[token[0]]] = Number(token.slice(1));
  return res;
}

export const SYSTEMS = RAW.map(([id, name, grid, region, frac, pop, dev, size, deposits, tags, desc]) => ({
  id,
  name,
  grid,
  region,
  frac,
  pop,
  dev,
  size,
  res: parseDeposits(deposits),
  tags,
  desc,
}));

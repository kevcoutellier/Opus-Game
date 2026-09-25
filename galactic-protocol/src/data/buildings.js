// Buildings, grouped in the same categories as the original game: economy, military, infrastructure,
// research, social, defence and intelligence. Each system has `size + 1` building slots.
// `fx` keys are read by the engine (see economy.js, combat.js and espionage.js).

export const BUILDING_CATS = {
  eco: 'Économie',
  mil: 'Militaire',
  infra: 'Infrastructure',
  sci: 'Recherche',
  soc: 'Social',
  def: 'Défense',
  intel: 'Renseignement',
  mega: 'Mégaprojet',
};

export const BUILDINGS = {
  industry: {
    cat: 'eco', name: 'Complexe industriel', cost: { cr: 300, dura: 60 }, days: 60, upkeep: 1,
    fx: { output: 0.2 }, desc: '+20 % de production du système.',
  },
  spaceport: {
    cat: 'eco', name: 'Spatioport commercial', cost: { cr: 250, dura: 40 }, days: 50, upkeep: 0.8,
    fx: { output: 0.1, trade: 0.02 }, desc: '+10 % de production et revenus commerciaux accrus.',
  },
  bank: {
    cat: 'eco', name: 'Succursale du Clan Bancaire', cost: { cr: 400, dura: 30 }, days: 60, upkeep: 1,
    fx: { tax: 0.12 }, minDev: 5, desc: '+12 % d’efficacité fiscale dans le système (dév. 5 min.).',
  },
  dura_mine: {
    cat: 'eco', name: 'Mine de durasteel', cost: { cr: 180, dura: 20 }, days: 45, upkeep: 0.5,
    fx: { extract: 'dura' }, deposit: 'dura', desc: 'Double l’extraction de durasteel.',
  },
  tib_refinery: {
    cat: 'eco', name: 'Raffinerie de tibanna', cost: { cr: 200, dura: 30 }, days: 45, upkeep: 0.5,
    fx: { extract: 'tib' }, deposit: 'tib', desc: 'Double l’extraction de gaz tibanna (carburant des flottes).',
  },
  kyber_mine: {
    cat: 'eco', name: 'Mine de kyber', cost: { cr: 350, dura: 40 }, days: 70, upkeep: 1,
    fx: { extract: 'kyb' }, deposit: 'kyb', desc: 'Double l’extraction de cristaux kyber.',
  },
  bacta_farm: {
    cat: 'eco', name: 'Cuves de bacta', cost: { cr: 200, dura: 20 }, days: 45, upkeep: 0.5,
    fx: { extract: 'bacta' }, deposit: 'bacta', desc: 'Double la production de bacta.',
  },
  spice_refinery: {
    cat: 'eco', name: 'Raffinerie d’épice', cost: { cr: 200, dura: 20 }, days: 45, upkeep: 0.5,
    fx: { extract: 'spice' }, deposit: 'spice', desc: 'Double la production d’épice.',
  },
  arcology: {
    cat: 'eco', name: 'Arcologies', cost: { cr: 350, dura: 80 }, days: 80, upkeep: 0.8,
    fx: { growth: 1, stability: 2 }, desc: 'Double la croissance du développement du système.',
  },
  barracks: {
    cat: 'mil', name: 'Caserne', cost: { cr: 150, dura: 30 }, days: 40, upkeep: 0.6,
    fx: { lines: { ground: 1 }, mp: 1 }, desc: 'Recrutement de troupes au sol, +1 effectif par jour.',
  },
  fighter_base: {
    cat: 'mil', name: 'Base de chasseurs', cost: { cr: 200, dura: 50 }, days: 45, upkeep: 0.8,
    fx: { lines: { air: 1 } }, desc: 'Production de chasseurs, bombardiers et transports d’assaut.',
  },
  shipyard: {
    cat: 'mil', name: 'Chantier naval', cost: { cr: 700, dura: 200 }, days: 120, upkeep: 2,
    fx: { lines: { air: 1, ship: 1 }, repair: 1 }, desc: 'Construction et réparation des vaisseaux.',
  },
  academy: {
    cat: 'mil', name: 'Académie militaire', cost: { cr: 300, dura: 30 }, days: 60, upkeep: 1,
    fx: { xp: 25, mp: 0.5 }, desc: 'Les unités formées ici commencent avec de l’expérience.',
  },
  holonet: {
    cat: 'infra', name: 'Relais HoloNet', cost: { cr: 150, dura: 20 }, days: 30, upkeep: 0.4,
    fx: { stability: 4, counter: 2 }, desc: '+4 de stabilité locale, contre-espionnage accru.',
  },
  nav_beacon: {
    cat: 'infra', name: 'Balise de navigation', cost: { cr: 150, dura: 30 }, days: 30, upkeep: 0.4,
    fx: { speed: 0.3 }, desc: '+30 % de vitesse sur les hyperroutes partant du système.',
  },
  depot: {
    cat: 'infra', name: 'Dépôt de ravitaillement', cost: { cr: 180, dura: 40 }, days: 40, upkeep: 0.6,
    fx: { repair: 1, supply: 1 }, desc: 'Répare les unités et étend le ravitaillement aux systèmes voisins.',
  },
  lab: {
    cat: 'sci', name: 'Laboratoire de recherche', cost: { cr: 250, dura: 30 }, days: 50, upkeep: 1,
    fx: { rp: 2 }, desc: '+2 points de recherche par jour.',
  },
  university: {
    cat: 'sci', name: 'Université', cost: { cr: 400, dura: 40 }, days: 80, upkeep: 1.5,
    fx: { rp: 3, stability: 2 }, minDev: 6, desc: '+3 points de recherche par jour (dév. 6 min.).',
  },
  medical: {
    cat: 'soc', name: 'Centre médical', cost: { cr: 200, dura: 20 }, days: 40, upkeep: 0.6,
    fx: { stability: 5, repair: 1 }, use: { bacta: 0.15 }, desc: '+5 de stabilité, soigne les troupes. Consomme du bacta.',
  },
  culture: {
    cat: 'soc', name: 'Centre culturel', cost: { cr: 180, dura: 20 }, days: 40, upkeep: 0.5,
    fx: { stability: 4, sympathy: -0.05 }, desc: '+4 de stabilité et freine la sympathie insurgée.',
  },
  shield: {
    cat: 'def', name: 'Bouclier planétaire', cost: { cr: 500, dura: 120 }, days: 90, upkeep: 1.5,
    fx: { shield: 900 }, desc: 'Protège contre les bombardements et affaiblit les invasions tant qu’il tient.',
  },
  turbolaser: {
    cat: 'def', name: 'Batteries de turbolasers', cost: { cr: 300, dura: 80 }, days: 50, upkeep: 1,
    fx: { garrison: 300, gatk: 20, satk: 10 }, desc: 'Renforce la garnison et tire sur les vaisseaux en orbite.',
  },
  ion_cannon: {
    cat: 'def', name: 'Canon à ions planétaire', cost: { cr: 600, dura: 120, kyb: 10 }, days: 90, upkeep: 1.5,
    fx: { satk: 45 }, tech: 'def_ion', desc: 'Neutralise les vaisseaux en orbite (canon v-150).',
  },
  bunker: {
    cat: 'def', name: 'Forteresse', cost: { cr: 350, dura: 120 }, days: 70, upkeep: 1,
    fx: { garrison: 500, gdef: 0.25 }, desc: 'Garnison fortifiée : +500 PV et -25 % de dégâts subis.',
  },
  intel_center: {
    cat: 'intel', name: 'Centre de renseignement', cost: { cr: 300, dura: 20 }, days: 60, upkeep: 1.2,
    fx: { ip: 1.5, agents: 1 }, desc: '+1,5 point de renseignement par jour et un agent de plus.',
  },
  counter_center: {
    cat: 'intel', name: 'Bureau de contre-espionnage', cost: { cr: 250, dura: 20 }, days: 50, upkeep: 1,
    fx: { counter: 10 }, desc: '+10 au contre-espionnage national.',
  },
  listening: {
    cat: 'intel', name: 'Station d’écoute', cost: { cr: 200, dura: 30 }, days: 40, upkeep: 0.6,
    fx: { vision: 2, ip: 0.5 }, desc: 'Révèle les mouvements ennemis dans un rayon de 2 sauts.',
  },
  superweapon_yard: {
    cat: 'mega', name: 'Chantier de station de combat', cost: { cr: 18000, dura: 6000, kyb: 400 }, days: 720, upkeep: 20,
    fx: { mega: 'battlestation' }, tech: 'super_laser', tag: 'major-yard', unique: true,
    desc: 'Mégaprojet : assemble une station de combat dotée d’un superlaser.',
  },
};

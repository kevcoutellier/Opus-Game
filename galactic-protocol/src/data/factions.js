// Governments, intelligence agencies and faction templates. Scenarios (scenarios.js) pick factions from
// here and give them a leader, a capital and their starting territory.

export const GOVERNMENTS = {
  empire: {
    name: 'Autocratie impériale', taxEff: 0.95, stability: 4, authoritarian: true, warPenalty: 0.3,
    desc: 'Pouvoir absolu de l’Empereur, gouverneurs régionaux, répression possible.',
  },
  junta: {
    name: 'Junte militaire', taxEff: 0.9, stability: 0, authoritarian: true, warPenalty: 0.2, military: 0.1,
    desc: 'L’état-major gouverne : +10 % d’efficacité militaire.',
  },
  republic: {
    name: 'République parlementaire', taxEff: 0.85, stability: 10, elections: true, warPenalty: 1.5,
    desc: 'Sénat élu : stable, mais les guerres d’agression passent mal et des élections ont lieu tous les 3 ans.',
  },
  rebellion: {
    name: 'Gouvernement rebelle provisoire', taxEff: 0.75, stability: 16, warPenalty: 0.2, insurgent: true,
    desc: 'Mouvement idéaliste soutenu par les dons des sympathisants dans toute la galaxie.',
  },
  cartel: {
    name: 'Cartel criminel', taxEff: 1.1, stability: -4, warPenalty: 0.4, criminal: true,
    desc: 'Extorsion efficace, loyautés fragiles. Revenus de la contrebande d’épice.',
  },
  ascendancy: {
    name: 'Ascendance aristocratique', taxEff: 1, stability: 14, warPenalty: 1.2, isolationist: true,
    desc: 'Les Familles Régnantes. Très stable, répugne aux guerres d’agression.',
  },
  corporate: {
    name: 'Corporatocratie', taxEff: 1.15, stability: -4, warPenalty: 0.6,
    desc: 'Les conseils d’administration gouvernent : excellente fiscalité, peu de légitimité.',
  },
  clans: {
    name: 'Clans guerriers', taxEff: 0.8, stability: 2, warPenalty: 0, military: 0.15,
    desc: 'Culture martiale : +15 % d’efficacité militaire, aucune pénalité de guerre.',
  },
  monarchy: {
    name: 'Monarchie', taxEff: 0.9, stability: 10, warPenalty: 0.8,
    desc: 'Couronne héréditaire respectée.',
  },
  confederacy: {
    name: 'Confédération marchande', taxEff: 1.05, stability: -2, warPenalty: 0.3, droids: true,
    desc: 'Armées de droïdes : les troupes ne consomment pas d’effectifs.',
  },
  freeworld: {
    name: 'Monde indépendant', taxEff: 0.9, stability: 6, warPenalty: 0.8,
    desc: 'Petit gouvernement local jaloux de son indépendance.',
  },
};

// Intelligence agencies: bonus (in percentage points) to the success of each operation.
export const AGENCIES = {
  imperial: { name: 'Renseignement impérial & ISB', bonus: { recon: 10, steal_tech: 10, destabilize: 5 }, counter: 25, agents: 1, desc: 'Contre-espionnage redoutable (+25).' },
  bothan: { name: 'Réseau d’espions bothan', bonus: { recon: 20, steal_tech: 20, steal_plans: 25 }, counter: 10, agents: 1, cost: -0.2, desc: 'Les meilleurs voleurs de secrets de la galaxie.' },
  alliance: { name: 'Renseignement de l’Alliance', bonus: { destabilize: 20, incite: 25, sabotage: 10, steal_plans: 10 }, counter: 5, agents: 1, desc: 'Cellules rebelles : experts en soulèvements.' },
  hutt: { name: 'Informateurs hutts', bonus: { bribe: 25, sabotage: 10, assassinate: 10 }, counter: 5, agents: 0, desc: 'Corruption et pots-de-vin.' },
  blacksun: { name: 'Vigos du Soleil Noir', bonus: { assassinate: 25, bribe: 20, recon: 10 }, counter: 10, agents: 1, desc: 'Assassins et maîtres-chanteurs.' },
  pyke: { name: 'Espions du Syndicat Pyke', bonus: { sabotage: 15, bribe: 15, destabilize: 10 }, counter: 5, agents: 0, desc: 'Réseaux de contrebande.' },
  chiss: { name: 'Renseignement de la Flotte d’expansion', bonus: { recon: 25, steal_tech: 10 }, counter: 35, agents: 0, desc: 'Analyse stratégique et contre-espionnage exceptionnels.' },
  mando: { name: 'Chasseurs de primes mandaloriens', bonus: { assassinate: 30, sabotage: 10 }, counter: 10, agents: 0, desc: 'Traque et élimination de cibles.' },
  espo: { name: 'Sécurité corporative (Espos)', bonus: { sabotage: 20, steal_tech: 10 }, counter: 20, agents: 0, desc: 'Espionnage industriel.' },
  hapes: { name: 'Cour de la Reine-Mère', bonus: { bribe: 25, destabilize: 10 }, counter: 15, agents: 0, desc: 'Intrigues de cour.' },
  republic: { name: 'Renseignement républicain', bonus: { recon: 15, steal_tech: 5 }, counter: 15, agents: 1, desc: 'Service équilibré.' },
  firstorder: { name: 'Bureau de sécurité du Premier Ordre', bonus: { destabilize: 10, assassinate: 10 }, counter: 30, agents: 1, desc: 'Surveillance totale.' },
  resistance: { name: 'Réseau de la Résistance', bonus: { sabotage: 20, destabilize: 15, incite: 15 }, counter: 5, agents: 1, desc: 'Sympathisants dans toute la galaxie.' },
  cis: { name: 'Renseignement séparatiste', bonus: { sabotage: 15, steal_tech: 10 }, counter: 10, agents: 0, desc: 'Droïdes espions.' },
  crimson: { name: 'Réseau de l’Aube Écarlate', bonus: { assassinate: 20, bribe: 20, destabilize: 10 }, counter: 10, agents: 1, desc: 'Le Collectif de l’Ombre.' },
  local: { name: 'Service de renseignement local', bonus: {}, counter: 0, agents: 0, desc: 'Moyens limités.' },
};

// Faction templates. personality: aggression (war appetite), diplomacy (openness), ruthless (superweapons,
// bombardments), trade (commerce).
export const FACTIONS = {
  empire: {
    name: 'Empire Galactique', short: 'Empire', color: '#9fb6e6', emblem: 'cog', gov: 'empire', agency: 'imperial',
    style: 'imperial', doctrine: 'imperial', personality: { aggression: 0.75, diplomacy: 0.25, ruthless: 0.9, trade: 0.4 },
  },
  rebels: {
    name: 'Alliance Rebelle', short: 'Alliance', color: '#ff7b2e', emblem: 'starbird', gov: 'rebellion', agency: 'alliance',
    style: 'rebel', doctrine: 'rebel', personality: { aggression: 0.55, diplomacy: 0.8, ruthless: 0, trade: 0.5 },
  },
  hutts: {
    name: 'Cartel Hutt', short: 'Hutts', color: '#a3b83f', emblem: 'hutt', gov: 'cartel', agency: 'hutt',
    style: 'hutt', doctrine: 'criminal', personality: { aggression: 0.35, diplomacy: 0.6, ruthless: 0.3, trade: 0.9 },
  },
  chiss: {
    name: 'Ascendance Chiss', short: 'Chiss', color: '#2ec4d6', emblem: 'chiss', gov: 'ascendancy', agency: 'chiss',
    style: 'chiss', doctrine: 'defensive', personality: { aggression: 0.15, diplomacy: 0.35, ruthless: 0.2, trade: 0.3 },
  },
  csa: {
    name: 'Autorité du Secteur Corporatif', short: 'Secteur Corporatif', color: '#d9a13b', emblem: 'diamond', gov: 'corporate',
    agency: 'espo', style: 'corporate', doctrine: 'balanced', personality: { aggression: 0.3, diplomacy: 0.6, ruthless: 0.3, trade: 1 },
  },
  hapes: {
    name: 'Consortium d’Hapès', short: 'Hapès', color: '#cf5fd0', emblem: 'crown', gov: 'monarchy', agency: 'hapes',
    style: 'hapes', doctrine: 'defensive', personality: { aggression: 0.2, diplomacy: 0.4, ruthless: 0.2, trade: 0.6 },
  },
  mandalore: {
    name: 'Mandalore', short: 'Mandalore', color: '#2f9e86', emblem: 'mando', gov: 'clans', agency: 'mando',
    style: 'mando', doctrine: 'balanced', personality: { aggression: 0.65, diplomacy: 0.4, ruthless: 0.4, trade: 0.3 },
  },
  pykes: {
    name: 'Syndicat Pyke', short: 'Pykes', color: '#a0714f', emblem: 'hex', gov: 'cartel', agency: 'pyke',
    style: 'criminal', doctrine: 'criminal', personality: { aggression: 0.35, diplomacy: 0.5, ruthless: 0.4, trade: 0.9 },
  },
  blacksun: {
    name: 'Soleil Noir', short: 'Soleil Noir', color: '#b59cff', emblem: 'sun', gov: 'cartel', agency: 'blacksun',
    style: 'criminal', doctrine: 'criminal', personality: { aggression: 0.4, diplomacy: 0.5, ruthless: 0.5, trade: 0.8 },
  },
  bothans: {
    name: 'Espace Bothan', short: 'Bothans', color: '#c8b27c', emblem: 'claw', gov: 'republic', agency: 'bothan',
    style: 'generic', doctrine: 'defensive', personality: { aggression: 0.1, diplomacy: 0.8, ruthless: 0.1, trade: 0.7 },
  },
  cloudcity: {
    name: 'Cité des Nuages', short: 'Bespin', color: '#ff9b9b', emblem: 'cloud', gov: 'freeworld', agency: 'local',
    style: 'generic', doctrine: 'defensive', personality: { aggression: 0.05, diplomacy: 0.7, ruthless: 0, trade: 1 },
  },
  takodana: {
    name: 'Château de Maz Kanata', short: 'Takodana', color: '#7fe3a6', emblem: 'ring', gov: 'freeworld', agency: 'local',
    style: 'generic', doctrine: 'defensive', personality: { aggression: 0, diplomacy: 0.9, ruthless: 0, trade: 0.8 },
  },
  batuu: {
    name: 'Avant-poste de Black Spire', short: 'Batuu', color: '#9a8f7a', emblem: 'spire', gov: 'freeworld', agency: 'local',
    style: 'generic', doctrine: 'defensive', personality: { aggression: 0.05, diplomacy: 0.6, ruthless: 0, trade: 0.8 },
  },
  kijimi: {
    name: 'Cités libres de Kijimi', short: 'Kijimi', color: '#86aeb8', emblem: 'ring', gov: 'freeworld', agency: 'local',
    style: 'criminal', doctrine: 'criminal', personality: { aggression: 0.1, diplomacy: 0.5, ruthless: 0.2, trade: 0.8 },
  },
  cantonica: {
    name: 'Canto Bight', short: 'Canto Bight', color: '#ff9ee0', emblem: 'diamond', gov: 'corporate', agency: 'local',
    style: 'corporate', doctrine: 'defensive', personality: { aggression: 0, diplomacy: 0.7, ruthless: 0.1, trade: 1 },
  },
  cis: {
    name: 'Vestiges Séparatistes', short: 'Séparatistes', color: '#4d6dff', emblem: 'hexring', gov: 'confederacy', agency: 'cis',
    style: 'separatist', doctrine: 'balanced', personality: { aggression: 0.5, diplomacy: 0.3, ruthless: 0.6, trade: 0.5 },
  },
  crimson: {
    name: 'Aube Écarlate', short: 'Aube Écarlate', color: '#e0344a', emblem: 'sun', gov: 'cartel', agency: 'crimson',
    style: 'criminal', doctrine: 'criminal', personality: { aggression: 0.55, diplomacy: 0.3, ruthless: 0.7, trade: 0.6 },
  },
  kashyyyk: {
    name: 'Kashyyyk libre', short: 'Wookiees', color: '#5aa84a', emblem: 'claw', gov: 'freeworld', agency: 'local',
    style: 'wookiee', doctrine: 'defensive', personality: { aggression: 0.1, diplomacy: 0.6, ruthless: 0, trade: 0.4 },
  },
  newrepublic: {
    name: 'Nouvelle République', short: 'Nouvelle République', color: '#f2ecd8', emblem: 'newrep', gov: 'republic', agency: 'republic',
    style: 'newrepublic', doctrine: 'balanced', personality: { aggression: 0.3, diplomacy: 0.8, ruthless: 0, trade: 0.7 },
  },
  firstorder: {
    name: 'Premier Ordre', short: 'Premier Ordre', color: '#d42a36', emblem: 'firstorder', gov: 'junta', agency: 'firstorder',
    style: 'firstorder', doctrine: 'imperial', personality: { aggression: 0.9, diplomacy: 0.15, ruthless: 1, trade: 0.2 },
  },
  resistance: {
    name: 'Résistance', short: 'Résistance', color: '#ff8f3a', emblem: 'starbird', gov: 'rebellion', agency: 'resistance',
    style: 'resistance', doctrine: 'rebel', personality: { aggression: 0.5, diplomacy: 0.9, ruthless: 0, trade: 0.4 },
  },
  adelhard: {
    name: 'Blocus de fer d’Adelhard', short: 'Adelhard', color: '#6f86a0', emblem: 'cog', gov: 'junta', agency: 'imperial',
    style: 'imperial', doctrine: 'defensive', personality: { aggression: 0.4, diplomacy: 0.2, ruthless: 0.7, trade: 0.3 },
  },
};

// Names drawn when a leader dies or a government changes.
export const LEADER_POOL = [
  'Amiral Tessek', 'Chancelière Varn', 'Gouverneur Pryce', 'Moff Jerjerrod', 'Sénatrice Ossus', 'Général Madine',
  'Grand Moff Valorum', 'Amiral Ackbar', 'Dame Kalira', 'Vice-roi Dorn', 'Baronne Ottega', 'Premier ministre Arvel',
  'Commandant Sato', 'Colonel Yularen', 'Générale Syndulla', 'Amiral Piett', 'Sénateur Bail Tarsk', 'Duchesse Zyla',
];

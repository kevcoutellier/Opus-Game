// Covert operations. `base` is the success chance (%) before the agency bonus, technologies and the target's
// counter-intelligence. `target`: 'foreign' (another faction), 'self' (no agent needed).

export const OPS = {
  recon: {
    name: 'Reconnaissance', base: 80, ip: 15, cr: 40, days: 10, target: 'foreign',
    desc: 'Révèle les forces, les technologies et l’économie de la cible pendant 180 jours.',
  },
  steal_tech: {
    name: 'Vol de technologie', base: 45, ip: 55, cr: 120, days: 30, target: 'foreign',
    desc: 'Dérobe une technologie connue de la cible.',
  },
  sabotage: {
    name: 'Sabotage industriel', base: 50, ip: 40, cr: 100, days: 20, target: 'foreign',
    desc: 'Détruit un bâtiment (chantiers et usines en priorité) ou un chantier en cours.',
  },
  destabilize: {
    name: 'Déstabilisation', base: 55, ip: 40, cr: 80, days: 25, target: 'foreign',
    desc: '-8 de stabilité pendant 180 jours et hausse de la sympathie insurgée.',
  },
  incite: {
    name: 'Armer les insurgés', base: 40, ip: 70, cr: 200, days: 30, target: 'foreign',
    desc: 'Déclenche un soulèvement armé dans le système le plus instable de la cible.',
  },
  bribe: {
    name: 'Corrompre des sénateurs', base: 60, ip: 30, cr: 250, days: 8, target: 'senate',
    desc: 'Fait basculer des voix en votre faveur sur la résolution en cours au Sénat.',
  },
  assassinate: {
    name: 'Contrat de chasseur de primes', base: 22, ip: 100, cr: 400, days: 40, target: 'foreign',
    desc: 'Élimine le dirigeant de la cible : -15 de stabilité. Incident majeur en cas d’échec.',
  },
  steal_plans: {
    name: 'Voler les plans de la superarme', base: 35, ip: 80, cr: 250, days: 40, target: 'superweapon',
    desc: 'Révèle le point faible d’une superarme : vos chasseurs pourront la détruire au combat.',
  },
  election: {
    name: 'Ingérence électorale', base: 45, ip: 60, cr: 200, days: 30, target: 'democracy',
    desc: 'Fait chuter le soutien au gouvernement d’une démocratie avant ses élections.',
  },
  counter: {
    name: 'Chasse aux espions', base: 100, ip: 30, cr: 60, days: 0, target: 'self',
    desc: '+30 au contre-espionnage pendant 180 jours.',
  },
  propaganda: {
    name: 'Campagne de désinformation', base: 100, ip: 25, cr: 50, days: 0, target: 'self',
    desc: '+5 de stabilité pendant 120 jours.',
  },
};

// Random domestic crises and scripted scenario events. The player answers them in a modal window;
// AI factions pick automatically.
import {
  aliveFactions, atWar, clamp, fac, gov, neighborFactions, staticSystem,
} from './query.js';
import { addModifier } from './modifiers.js';
import { declareWar } from './diplomacy.js';
import { spawnUprising } from './politics.js';
import { chance, pick, randInt } from './rng.js';
import { newId } from './stacks.js';
import { news } from './news.js';

const rev = (state, fid) => Math.max(10, fac(state, fid).econ?.revenue || 10);
const ownSystems = (state, fid) => Object.values(state.systems).filter((s) => s.owner === fid && s.controller === fid && !s.destroyed);
const sysName = (id) => staticSystem(id).name;

function randomSystem(state, fid, filter = () => true) {
  const list = ownSystems(state, fid).filter(filter);
  return list.length ? pick(state, list) : null;
}

/**
 * Event definitions. `check(state, fid)` returns a context object when the event can fire, `mtth` is the mean
 * time to happen in days, `options` are { label, tip, apply(state, fid, ctx) }, `ai` returns the option index.
 */
export const EVENTS = {
  miners_strike: {
    title: 'Grève des mineurs',
    mtth: 1400,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => Object.keys(x.res).length);
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Les mineurs de ${sysName(ctx.sys)} cessent le travail et réclament de meilleures conditions. L’extraction est à l’arrêt.`,
    options: [
      { label: 'Accorder une hausse de salaires', tip: '-20 jours de revenus, +5 de stabilité locale', apply: (state, fid, ctx) => { fac(state, fid).treasury -= 20 * rev(state, fid); state.systems[ctx.sys].stability += 5; } },
      { label: 'Envoyer les troupes', tip: 'Stabilité locale -15, sympathie insurgée +15', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.stability = Math.max(0, s.stability - 15); s.sympathy = clamp((s.sympathy || 0) + 15, 0, 100); } },
      { label: 'Laisser pourrir la situation', tip: 'Développement local -0,5', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.dev = Math.max(1, s.dev - 0.5); } },
    ],
    ai: (state, fid) => (gov(state, fid).authoritarian ? 1 : 0),
  },
  blue_shadow: {
    title: 'Épidémie du virus de l’Ombre Bleue',
    mtth: 2200,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => x.pop > 0.5);
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Une souche du virus de l’Ombre Bleue se répand sur ${sysName(ctx.sys)}. Les centres médicaux sont débordés.`,
    options: [
      { label: 'Distribuer notre bacta', tip: '-40 bacta', apply: (state, fid) => { const f = fac(state, fid); f.res.bacta = Math.max(0, f.res.bacta - 40); } },
      { label: 'Quarantaine planétaire', tip: '-20 % de production nationale pendant 60 jours', apply: (state, fid) => addModifier(state, fid, { id: 'quarantine', name: 'Quarantaine', days: 60, output: -0.2 }) },
      { label: 'Nier l’épidémie', tip: 'Population locale -20 %, stabilité -10', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.pop *= 0.8; s.stability = Math.max(0, s.stability - 10); } },
    ],
    ai: (state, fid) => (fac(state, fid).res.bacta >= 40 ? 0 : 1),
  },
  corruption: {
    title: 'Scandale de corruption',
    mtth: 1500,
    check: () => ({}),
    text: () => 'Des holovidéos compromettantes révèlent que plusieurs ministres ont détourné des fonds publics.',
    options: [
      { label: 'Limoger les coupables', tip: '-3 de stabilité pendant 90 jours', apply: (state, fid) => addModifier(state, fid, { id: 'scandal', name: 'Scandale', days: 90, stability: -3 }) },
      { label: 'Étouffer l’affaire', tip: '-15 jours de revenus ; 40 % de risque de -10 de stabilité', apply: (state, fid) => { fac(state, fid).treasury -= 15 * rev(state, fid); if (chance(state, 0.4)) addModifier(state, fid, { id: 'coverup', name: 'Scandale étouffé révélé', days: 180, stability: -10 }); } },
    ],
    ai: (state) => (chance(state, 0.5) ? 0 : 1),
  },
  kyber_find: {
    title: 'Gisement de kyber découvert',
    mtth: 2500,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => !x.res.kyb);
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Des prospecteurs ont découvert des cristaux kyber dans les profondeurs de ${sysName(ctx.sys)}.`,
    options: [
      { label: 'Exploiter le gisement', tip: 'Gisement de kyber (niveau 2)', apply: (state, fid, ctx) => { state.systems[ctx.sys].res.kyb = 2; } },
      { label: 'Vendre la concession', tip: '+30 jours de revenus', apply: (state, fid) => { fac(state, fid).treasury += 30 * rev(state, fid); } },
    ],
    ai: () => 0,
  },
  refugees: {
    title: 'Afflux de réfugiés',
    mtth: 900,
    check: (state, fid) => {
      const warring = neighborFactions(state, fid).filter((n) => state.wars.some((w) => w.att.includes(n) || w.def.includes(n)) && !atWar(state, fid, n));
      if (!warring.length) return null;
      const s = randomSystem(state, fid);
      return s && { from: pick(state, warring), sys: s.id };
    },
    text: (state, fid, ctx) => `Des millions de réfugiés fuyant la guerre dans l’espace de ${fac(state, ctx.from).name} affluent vers ${sysName(ctx.sys)}.`,
    options: [
      { label: 'Les accueillir', tip: 'Population locale +10 %, stabilité locale -8', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.pop *= 1.1; s.stability = Math.max(0, s.stability - 8); } },
      { label: 'Fermer les hyperroutes', tip: `Relations -10 avec leur gouvernement`, apply: (state, fid, ctx) => { const key = fid < ctx.from ? `${fid}|${ctx.from}` : `${ctx.from}|${fid}`; state.rel[key] = clamp((state.rel[key] || 0) - 10, -100, 100); } },
    ],
    ai: (state, fid) => (fac(state, fid).personality.diplomacy > 0.5 ? 0 : 1),
  },
  pirates: {
    title: 'Raids de pirates',
    mtth: 1100,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => ['outer', 'mid', 'hutt'].includes(staticSystem(x.id).region));
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Des pirates attaquent les convois marchands autour de ${sysName(ctx.sys)}.`,
    options: [
      { label: 'Payer des escortes', tip: '-10 jours de revenus', apply: (state, fid) => { fac(state, fid).treasury -= 10 * rev(state, fid); } },
      { label: 'Laisser faire', tip: '-10 % de production pendant 120 jours', apply: (state, fid) => addModifier(state, fid, { id: 'pirates', name: 'Piraterie', days: 120, output: -0.1 }) },
    ],
    ai: (state, fid) => (fac(state, fid).treasury > 20 * rev(state, fid) ? 0 : 1),
  },
  peace_protests: {
    title: 'Manifestations pour la paix',
    mtth: 500,
    check: (state, fid) => (fac(state, fid).warWeariness > 35 && !gov(state, fid).authoritarian ? {} : null),
    text: () => 'Des foules immenses envahissent les places et exigent la fin de la guerre.',
    options: [
      { label: 'Promettre la paix', tip: 'Lassitude -10, mais le gouvernement cherchera la paix', apply: (state, fid) => { const f = fac(state, fid); f.warWeariness = Math.max(0, f.warWeariness - 10); f.flags.seekPeace = state.day + 180; } },
      { label: 'Ignorer la rue', tip: '-6 de stabilité pendant 180 jours', apply: (state, fid) => addModifier(state, fid, { id: 'protests', name: 'Manifestations', days: 180, stability: -6 }) },
    ],
    ai: () => 0,
  },
  bounty_hunter: {
    title: 'Un chasseur de primes propose ses services',
    mtth: 1300,
    check: () => ({}),
    text: () => 'Un chasseur de primes mandalorien à l’armure cabossée offre ses talents. Son prix est élevé, mais sa réputation impeccable.',
    options: [
      { label: 'L’engager', tip: '-25 jours de revenus, +60 points de renseignement', apply: (state, fid) => { const f = fac(state, fid); f.treasury -= 25 * rev(state, fid); f.ip += 60; } },
      { label: 'Le congédier', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: (state, fid) => (fac(state, fid).treasury > 60 * rev(state, fid) ? 0 : 1),
  },
  trade_boom: {
    title: 'Boom commercial',
    mtth: 1300,
    check: (state, fid) => (state.wars.some((w) => w.att.includes(fid) || w.def.includes(fid)) ? null : {}),
    text: () => 'La paix attire les marchands : les spatioports ne désemplissent pas.',
    options: [{ label: 'Excellent !', tip: '+8 % de production pendant 360 jours', apply: (state, fid) => addModifier(state, fid, { id: 'boom', name: 'Boom commercial', days: 360, output: 0.08 }) }],
    ai: () => 0,
  },
  ion_storm: {
    title: 'Tempête ionique',
    mtth: 1600,
    check: () => ({}),
    text: () => 'Une tempête ionique perturbe les communications et les balises de navigation.',
    options: [{ label: 'Attendre qu’elle passe', tip: '-10 % de production pendant 60 jours', apply: (state, fid) => addModifier(state, fid, { id: 'ion_storm', name: 'Tempête ionique', days: 60, output: -0.1 }) }],
    ai: () => 0,
  },
  riots: {
    title: 'Émeutes',
    mtth: 500,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => x.stability < 30);
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Des émeutes éclatent sur ${sysName(ctx.sys)}. Les bâtiments officiels sont incendiés.`,
    options: [
      { label: 'Faire des concessions', tip: '-15 jours de revenus, stabilité locale +12', apply: (state, fid, ctx) => { fac(state, fid).treasury -= 15 * rev(state, fid); state.systems[ctx.sys].stability += 12; } },
      { label: 'Réprimer', tip: 'Stabilité locale +6, sympathie insurgée +20', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.stability += 6; s.sympathy = clamp((s.sympathy || 0) + 20, 0, 100); } },
      { label: 'Ne rien faire', tip: '30 % de risque de soulèvement armé', apply: (state, fid, ctx) => { if (chance(state, 0.3)) spawnUprising(state, ctx.sys); } },
    ],
    ai: (state, fid) => (gov(state, fid).authoritarian ? 1 : 0),
  },
  independence_movement: {
    title: 'Mouvement autonomiste',
    mtth: 1800,
    check: (state, fid) => {
      const f = fac(state, fid);
      const s = randomSystem(state, fid, (x) => x.id !== f.capital && x.stability < 45);
      return ownSystems(state, fid).length > 6 && s ? { sys: s.id } : null;
    },
    text: (state, fid, ctx) => `Les élites de ${sysName(ctx.sys)} réclament une large autonomie.`,
    options: [
      { label: 'Accorder l’autonomie', tip: 'Stabilité locale +20, développement local -1', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; s.stability += 20; s.dev = Math.max(1, s.dev - 1); } },
      { label: 'Refuser', tip: 'Stabilité locale -10', apply: (state, fid, ctx) => { state.systems[ctx.sys].stability -= 10; } },
    ],
    ai: () => 0,
  },
  spice_smugglers: {
    title: 'Contrebandiers d’épice',
    mtth: 1200,
    check: () => ({}),
    text: () => 'Un réseau de contrebande d’épice prospère sous le nez de nos douanes.',
    options: [
      { label: 'Taxer le trafic', tip: '+15 jours de revenus, -3 de stabilité (180 jours)', apply: (state, fid) => { fac(state, fid).treasury += 15 * rev(state, fid); addModifier(state, fid, { id: 'spice_trade', name: 'Trafic d’épice toléré', days: 180, stability: -3 }); } },
      { label: 'Démanteler le réseau', tip: '-8 jours de revenus, +20 d’épice saisie', apply: (state, fid) => { const f = fac(state, fid); f.treasury -= 8 * rev(state, fid); f.res.spice += 20; } },
    ],
    ai: (state, fid) => (gov(state, fid).criminal ? 0 : 1),
  },
  jedi_ruins: {
    title: 'Ruines d’un temple Jedi',
    mtth: 2600,
    check: (state, fid) => {
      const s = randomSystem(state, fid);
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Des archéologues mettent au jour un ancien temple Jedi sur ${sysName(ctx.sys)}. Des holocrons y seraient cachés.`,
    options: [
      { label: 'Étudier les holocrons', tip: '+300 points de recherche', apply: (state, fid) => { const f = fac(state, fid); f.research.progress += 300; } },
      { label: 'Raser le site', tip: '+3 de stabilité pour les régimes autoritaires', apply: (state, fid) => { if (gov(state, fid).authoritarian) addModifier(state, fid, { id: 'purge_jedi', name: 'Purge des reliques', days: 180, stability: 3 }); } },
    ],
    ai: (state, fid) => (gov(state, fid).authoritarian ? 1 : 0),
  },
  shipyard_accident: {
    title: 'Accident de réacteur',
    mtth: 1800,
    check: (state, fid) => {
      const s = randomSystem(state, fid, (x) => x.buildings.includes('shipyard'));
      return s && { sys: s.id };
    },
    text: (state, fid, ctx) => `Un réacteur explose dans les chantiers navals de ${sysName(ctx.sys)}.`,
    options: [
      { label: 'Financer les réparations', tip: '-20 jours de revenus', apply: (state, fid) => { fac(state, fid).treasury -= 20 * rev(state, fid); } },
      { label: 'Abandonner le chantier', tip: 'Le chantier naval est détruit', apply: (state, fid, ctx) => { const s = state.systems[ctx.sys]; const i = s.buildings.indexOf('shipyard'); if (i >= 0) s.buildings.splice(i, 1); } },
    ],
    ai: (state, fid) => (fac(state, fid).treasury > 30 * rev(state, fid) ? 0 : 1),
  },
  banking_crisis: {
    title: 'Crise du Clan Bancaire',
    mtth: 2400,
    check: () => ({}),
    text: () => 'Le Clan Bancaire InterGalactique gèle ses lignes de crédit. Les marchés s’effondrent.',
    options: [
      { label: 'Renflouer les banques', tip: '-40 jours de revenus', apply: (state, fid) => { fac(state, fid).treasury -= 40 * rev(state, fid); } },
      { label: 'Laisser faire le marché', tip: '-12 % de production pendant 180 jours', apply: (state, fid) => addModifier(state, fid, { id: 'crisis', name: 'Crise financière', days: 180, output: -0.12 }) },
    ],
    ai: (state, fid) => (fac(state, fid).treasury > 80 * rev(state, fid) ? 0 : 1),
  },
  defector: {
    title: 'Un officier ennemi fait défection',
    mtth: 900,
    check: (state, fid) => {
      const enemies = state.wars.flatMap((w) => (w.att.includes(fid) ? w.def : w.def.includes(fid) ? w.att : []));
      return enemies.length ? { enemy: pick(state, enemies) } : null;
    },
    text: (state, fid, ctx) => `Un officier de ${fac(state, ctx.enemy).name} demande l’asile et propose de livrer des secrets militaires.`,
    options: [
      { label: 'L’accueillir', tip: 'Révèle les forces ennemies pendant 180 jours, +40 renseignement', apply: (state, fid, ctx) => { const f = fac(state, fid); f.intel[ctx.enemy] = state.day + 180; f.ip += 40; } },
      { label: 'Le livrer', tip: 'Relations +15 avec l’ennemi', apply: (state, fid, ctx) => { const key = fid < ctx.enemy ? `${fid}|${ctx.enemy}` : `${ctx.enemy}|${fid}`; state.rel[key] = clamp((state.rel[key] || 0) + 15, -100, 100); } },
    ],
    ai: () => 0,
  },
  hutt_offer: {
    title: 'Une offre des Hutts',
    mtth: 1500,
    check: (state, fid) => (state.factions.hutts?.alive && fid !== 'hutts' ? {} : null),
    text: () => 'Un émissaire hutt propose un « partenariat » : leurs contrebandiers ravitailleront vos flottes, moyennant une part des bénéfices.',
    options: [
      { label: 'Accepter', tip: '+60 tibanna, -5 % de production pendant 360 jours', apply: (state, fid) => { fac(state, fid).res.tib += 60; addModifier(state, fid, { id: 'hutt_deal', name: 'Accord avec les Hutts', days: 360, output: -0.05 }); } },
      { label: 'Refuser poliment', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: (state, fid) => (fac(state, fid).deficit.tib ? 0 : 1),
  },
};

// Scripted scenario events. `when(state)` decides when they happen (once), `faction` who receives them.
export const STORY = {
  scarif_plans: {
    scenario: 'bby0', faction: 'rebels', title: 'Les plans de l’Étoile de la Mort',
    when: (state) => state.day >= 12,
    text: () => 'Nos informateurs affirment que les plans de l’Étoile de la Mort sont conservés dans la citadelle impériale de Scarif. Une équipe de volontaires, « Rogue One », propose de s’y infiltrer.',
    options: [
      { label: 'Lancer l’opération Rogue One', tip: '60 % de chances de voler les plans ; la tension monte', apply: (state, fid) => {
        const ds = state.superweapons.find((w) => w.owner === 'empire');
        state.tension = Math.min(100, state.tension + 4);
        if (ds && chance(state, 0.6)) {
          ds.plans[fid] = true;
          news(state, { text: 'Rogue One a réussi : les plans de l’Étoile de la Mort ont été transmis à la flotte rebelle !', kind: 'intel', faction: fid, important: true });
        } else news(state, { text: 'L’opération Rogue One a échoué sur Scarif. Aucun survivant.', kind: 'intel', faction: fid, important: true });
      } },
      { label: 'Trop risqué', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: () => 0,
  },
  dissolve_imperial_senate: {
    scenario: 'bby0', faction: 'empire', title: 'Le Sénat Impérial',
    when: (state) => state.day >= 30 && state.senate && !state.senate.dissolved,
    text: () => 'Le Grand Moff Tarkin estime que le Sénat Impérial n’est plus qu’un repaire de sympathisants rebelles. L’Empereur peut le dissoudre et confier les systèmes aux gouverneurs régionaux.',
    options: [
      { label: 'Dissoudre le Sénat', tip: '+8 de stabilité (720 jours), la sympathie rebelle grimpe', apply: (state, fid) => {
        state.senate.dissolved = true;
        state.senate.current = null;
        addModifier(state, fid, { id: 'moffs', name: 'Gouverneurs régionaux', days: 720, stability: 8, sympathy: 0.15 });
        news(state, { text: 'L’Empereur a dissous le Sénat Impérial. Les derniers vestiges de l’Ancienne République ont été balayés.', kind: 'senate', faction: fid, important: true });
      } },
      { label: 'Conserver le Sénat', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: () => 0,
  },
  tarkin_demonstration: {
    scenario: 'bby0', faction: 'empire', title: 'Une démonstration de force',
    when: (state) => state.day >= 90 && state.systems.alderaan && !state.systems.alderaan.destroyed && state.superweapons.some((w) => w.owner === 'empire' && w.type === 'deathstar'),
    text: () => 'Tarkin propose de conduire l’Étoile de la Mort jusqu’à Alderaan, soupçonnée d’aider la Rébellion, pour faire un exemple. « La peur maintiendra les systèmes locaux dans le rang. »',
    options: [
      { label: 'Faire route vers Alderaan', tip: 'Mobilisation générale ; l’IA fera feu dès que possible', apply: (state, fid) => {
        state.tension = Math.max(state.tension, 62);
        const ds = state.superweapons.find((w) => w.owner === fid && w.type === 'deathstar');
        if (ds) ds.target = 'alderaan';
        fac(state, fid).flags.alderaanOrder = true;
      } },
      { label: 'Refuser', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: (state) => (chance(state, 0.7) ? 0 : 1),
  },
  order66: {
    scenario: 'bby19', faction: 'empire', title: 'L’Ordre 66',
    when: (state) => state.day >= 5,
    text: () => 'Les derniers Jedi survivants se cachent dans la Bordure. L’Inquisitorius demande des moyens pour les traquer.',
    options: [
      { label: 'Financer l’Inquisitorius', tip: '-20 jours de revenus, +8 de stabilité (360 jours)', apply: (state, fid) => { fac(state, fid).treasury -= 20 * rev(state, fid); addModifier(state, fid, { id: 'inquisition', name: 'Traque des Jedi', days: 360, stability: 8 }); } },
      { label: 'Laisser les Jedi disparaître', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: () => 0,
  },
  wookiee_enslavement: {
    scenario: 'bby19', faction: 'empire', title: 'Le sort de Kashyyyk',
    when: (state) => state.day >= 300 && state.factions.kashyyyk?.alive && !atWar(state, 'empire', 'kashyyyk'),
    text: () => 'Les ingénieurs de l’Étoile de la Mort réclament une main-d’œuvre robuste. Les Wookiees de Kashyyyk conviendraient parfaitement.',
    options: [
      { label: 'Envahir Kashyyyk', tip: 'Déclare la guerre à Kashyyyk', apply: (state, fid) => declareWar(state, fid, 'kashyyyk', { name: 'Occupation de Kashyyyk' }) },
      { label: 'Pas encore', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: () => 0,
  },
  hosnian_strike: {
    scenario: 'aby34', faction: 'firstorder', title: 'La fin de la République',
    when: (state) => state.day >= 40 && state.systems.hosnian && !state.systems.hosnian.destroyed && state.factions.newrepublic?.alive,
    text: () => 'Le Général Hux réclame l’autorisation de frapper le système Hosnian, siège du Sénat de la Nouvelle République, dès que la Base Starkiller sera chargée.',
    options: [
      { label: 'Autoriser la frappe', tip: 'Mobilisation ; l’IA fera feu dès que possible', apply: (state, fid) => {
        state.tension = Math.max(state.tension, 64);
        const sk = state.superweapons.find((w) => w.owner === fid);
        if (sk) sk.target = 'hosnian';
      } },
      { label: 'Attendre', tip: 'Aucun effet', apply: () => {} },
    ],
    ai: () => 0,
  },
  jakku_battle: {
    scenario: 'aby4', faction: 'newrepublic', title: 'La flotte impériale se rassemble',
    when: (state) => state.day >= 120 && state.systems.jakku?.controller === 'empire',
    text: () => 'Nos éclaireurs signalent que les restes de la flotte impériale se regroupent au-dessus de Jakku. Une victoire décisive pourrait briser l’Empire.',
    options: [
      { label: 'Préparer l’assaut', tip: '+15 % de production militaire (Économie de guerre, 180 jours)', apply: (state, fid) => addModifier(state, fid, { id: 'jakku_push', name: 'Offensive de Jakku', days: 180, prodTime: -0.15, milCost: -0.1 }) },
      { label: 'Consolider nos positions', tip: '+5 de stabilité (180 jours)', apply: (state, fid) => addModifier(state, fid, { id: 'consolidate', name: 'Consolidation', days: 180, stability: 5 }) },
    ],
    ai: () => 0,
  },
};

function deliver(state, fid, id, def, ctx, story) {
  const f = fac(state, fid);
  if (f.isPlayer) {
    state.inbox.push({ id: newId(state, 'i'), kind: 'event', event: id, story, ctx, day: state.day });
    return;
  }
  const choice = clamp(def.ai(state, fid, ctx) ?? 0, 0, def.options.length - 1);
  def.options[choice].apply(state, fid, ctx);
  clampStability(state);
}

function clampStability(state) {
  for (const s of Object.values(state.systems)) s.stability = clamp(s.stability, 0, 100);
}

export function eventsDay(state) {
  for (const [id, def] of Object.entries(STORY)) {
    if (def.scenario !== state.scenario || state.flags[id]) continue;
    if (!state.factions[def.faction]?.alive || !def.when(state)) continue;
    state.flags[id] = true;
    deliver(state, def.faction, id, def, {}, true);
  }
  if (state.day % 10 !== 0) return;
  const ids = Object.keys(EVENTS);
  for (const f of aliveFactions(state)) {
    if ((f.flags.lastEvent || -999) > state.day - 45) continue;
    const id = ids[randInt(state, ids.length)];
    const def = EVENTS[id];
    if (!chance(state, (10 / def.mtth) * ids.length)) continue;
    const ctx = def.check(state, f.id);
    if (!ctx) continue;
    f.flags.lastEvent = state.day;
    deliver(state, f.id, id, def, ctx, false);
  }
}

export function eventDef(item) {
  return item.story ? STORY[item.event] : EVENTS[item.event];
}

export function answerEvent(state, itemId, choice) {
  const item = state.inbox.find((i) => i.id === itemId);
  if (!item) return;
  state.inbox = state.inbox.filter((i) => i !== item);
  const def = eventDef(item);
  def.options[choice]?.apply(state, state.player, item.ctx);
  clampStability(state);
}


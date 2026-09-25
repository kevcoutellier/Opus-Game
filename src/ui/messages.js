// French battle text, built from engine events (in the style of the French games).

const STAT_FR = { atk: "l'Attaque", def: 'la Défense', spc: 'le Spécial', spe: 'la Vitesse', accuracy: 'la Précision', evasion: "l'Esquive" };
export const STATUS_FR = { par: 'PAR', psn: 'PSN', tox: 'PSN', brn: 'BRU', frz: 'GEL', slp: 'SOM' };
const CHARGE_FR = {
  fly: "s'envole !",
  dig: 'creuse un tunnel !',
  solarbeam: 'absorbe la lumière !',
  skullbash: 'baisse la tête !',
  skyattack: 'est entouré de lumière !',
  razorwind: 'crée un tourbillon !',
};

/** "Pikachu" for the player, "Dracaufeu ennemi" for the opponent. */
export function monName(ev, side = ev.side) {
  return side === 1 ? `${ev.name} ennemi` : ev.name;
}

export function describe(ev, ctx) {
  const n = ev.side !== undefined ? monName(ev) : '';
  switch (ev.type) {
    case 'switchIn':
      return ev.side === 0 ? `En avant, ${ev.name} !` : `${ctx.trainers[1]} envoie ${ev.name} !`;
    case 'switchOut':
      return ev.side === 0 ? `${ev.name}, reviens !` : `${ctx.trainers[1]} rappelle ${ev.name} !`;
    case 'move':
      if (ev.continued) return `${n} continue son attaque !`;
      return ev.called ? `Cela devient ${ev.moveName} !` : `${n} utilise ${ev.moveName} !`;
    case 'charge':
      return `${n} ${CHARGE_FR[ev.moveId] || 'se prépare !'}`;
    case 'miss':
      return `${n} rate son attaque !`;
    case 'fail':
      return ev.reason === 'weak' ? `${n} est trop faible pour créer un clone !` : 'Mais cela échoue !';
    case 'immune':
      return `Ça n'affecte pas ${monName(ev)}...`;
    case 'nothing':
      return 'Mais rien ne se passe !';
    case 'hitCount':
      return `Touché ${ev.count} fois !`;
    case 'recoil':
      return `${n} subit le contrecoup !`;
    case 'drain':
      return `L'énergie de ${monName(ev)} est drainée !`;
    case 'cant':
      switch (ev.reason) {
        case 'slp': return `${n} dort profondément.`;
        case 'frz': return `${n} est gelé !`;
        case 'par': return `${n} est paralysé ! Il ne peut pas attaquer !`;
        case 'flinch': return `${n} a peur ! Il ne peut pas attaquer !`;
        case 'recharge': return `${n} doit se recharger !`;
        case 'trapped': return `${n} ne peut pas attaquer !`;
        default: return `${n} ne peut pas attaquer !`;
      }
    case 'status':
      if (ev.rest) return `${n} s'endort et récupère des PV !`;
      return {
        par: `${n} est paralysé ! Il aura du mal à attaquer !`,
        psn: `${n} est empoisonné !`,
        tox: `${n} est gravement empoisonné !`,
        brn: `${n} est brûlé !`,
        frz: `${n} est gelé !`,
        slp: `${n} s'endort !`,
      }[ev.status];
    case 'alreadyStatus':
      return `${n} est déjà ${ { par: 'paralysé', psn: 'empoisonné', tox: 'empoisonné', brn: 'brûlé', frz: 'gelé', slp: 'endormi' }[ev.status] } !`;
    case 'cure':
      if (ev.reason === 'wake') return `${n} se réveille !`;
      if (ev.reason === 'thaw') return `${n} dégèle !`;
      return `${n} est guéri !`;
    case 'confusion':
      return `${n} est confus !`;
    case 'confused':
      return `${n} est confus...`;
    case 'hitSelf':
      return 'Il se blesse dans sa confusion !';
    case 'confusionEnd':
      return `${n} n'est plus confus !`;
    case 'fatigue':
      return `${n} est épuisé !`;
    case 'boost': {
      const stat = STAT_FR[ev.stat];
      if (ev.amount >= 2) return `${stat} de ${n} augmente beaucoup !`;
      if (ev.amount > 0) return `${stat} de ${n} augmente !`;
      if (ev.amount <= -2) return `${stat} de ${n} baisse beaucoup !`;
      return `${stat} de ${n} baisse !`;
    }
    case 'boostFail':
      return `${STAT_FR[ev.stat]} de ${n} ne peut plus ${ev.up ? 'augmenter' : 'baisser'} !`;
    case 'mistProtect':
      return `${n} est protégé par la Brume !`;
    case 'damage':
      switch (ev.source) {
        case 'psn': return `${n} souffre du poison !`;
        case 'brn': return `${n} souffre de sa brûlure !`;
        case 'leechseed': return `Vampigraine draine l'énergie de ${n} !`;
        case 'crash': return `${n} s'écrase au sol !`;
        default: return null;
      }
    case 'heal':
      return `${n} récupère des PV !`;
    case 'subDamage':
      return `Le clone encaisse les dégâts à la place de ${n} !`;
    case 'subBreak':
      return `Le clone de ${n} disparaît !`;
    case 'substitute':
      return `${n} crée un clone !`;
    case 'volatile':
      return {
        reflect: `${n} est protégé contre les attaques physiques !`,
        lightscreen: `${n} est protégé contre les attaques spéciales !`,
        mist: `${n} s'entoure de brume !`,
        focusenergy: `${n} se concentre !`,
      }[ev.volatile];
    case 'leechseed':
      return `${n} est infecté !`;
    case 'haze':
      return 'Tous les changements de stats sont annulés !';
    case 'transform':
      return `${n} se transforme en ${ev.into} !`;
    case 'conversion':
      return `${n} change de type !`;
    case 'disable':
      return `${ev.moveName} de ${n} est bloqué !`;
    case 'disableEnd':
      return `La capacité de ${n} n'est plus bloquée !`;
    case 'mimic':
      return `${n} copie ${ev.moveName} !`;
    case 'bideStart':
      return `${n} se concentre...`;
    case 'bideStore':
      return `${n} patiente...`;
    case 'bideUnleash':
      return `${n} libère son énergie !`;
    case 'trap':
      return `${n} est pris au piège !`;
    case 'trapEnd':
      return `${n} est libéré !`;
    case 'payday':
      return 'Des pièces sont éparpillées !';
    case 'clause':
      return 'Clause Sommeil : un seul Pokémon endormi à la fois !';
    case 'faint':
      return `${n} est K.O. !`;
    case 'win':
      return ev.side === 0 ? `Tu as battu ${ctx.trainers[1]} !` : `${ctx.trainers[1]} a gagné...`;
    default:
      return null;
  }
}

export function effectivenessText(eff) {
  if (eff > 1) return "C'est super efficace !";
  if (eff > 0 && eff < 1) return "Ce n'est pas très efficace...";
  return null;
}

// Stadium's commentator lines.
const LINES = {
  superEffective: ['Quel coup dévastateur !', 'Ça, ça fait mal !', 'Une attaque redoutable !'],
  crit: ['Coup critique ! Incroyable !', 'En plein dans le mille !'],
  weak: ['Ça ne fait pas grand-chose !', "L'attaque est bien encaissée !"],
  miss: ["Raté ! Quelle occasion manquée !", 'Il a esquivé !'],
  faint: ['Il est au tapis !', 'Et il s\'effondre !', 'C\'est fini pour lui !'],
  sendOut: ['Le combat commence !', 'Les deux dresseurs sont prêts !'],
  lowHp: ['Il ne tient plus qu\'à un fil !', 'Il est en mauvaise posture !'],
  win: ['Quel combat spectaculaire !', 'Une victoire magnifique !'],
};

export function commentary(kind) {
  const list = LINES[kind];
  return list ? list[Math.floor(Math.random() * list.length)] : null;
}

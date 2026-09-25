// Galactic Senate resolutions (the United Nations of the original game).
// `needsTarget`: the resolution names a faction. Effects are applied by engine/senate.js.

export const RESOLUTIONS = {
  sanctions: {
    name: 'Sanctions économiques', needsTarget: true, days: 720,
    desc: 'Embargo contre la cible : accès au marché galactique coupé, accords commerciaux suspendus.',
  },
  condemn: {
    name: 'Condamnation de l’agression', needsTarget: true, days: 360,
    desc: 'La cible perd 10 de stabilité et 20 de relations avec tous les membres.',
  },
  ban_superweapons: {
    name: 'Traité d’interdiction des superarmes', needsTarget: false, days: 1080,
    desc: 'Fait retomber la tension galactique. Tout tir de superarme devient un crime contre la galaxie.',
  },
  aid: {
    name: 'Aide humanitaire', needsTarget: true, days: 0,
    desc: 'Les membres financent la cible (crédits et bacta).',
  },
  peacekeeping: {
    name: 'Force de maintien de la paix', needsTarget: true, days: 0,
    desc: 'Les membres qui le souhaitent entrent en guerre contre la cible.',
  },
  trade_pact: {
    name: 'Pacte commercial galactique', needsTarget: false, days: 1080,
    desc: '+5 % de production pour tous les membres.',
  },
  emergency_powers: {
    name: 'Pouvoirs d’urgence', needsTarget: false, days: 720,
    desc: 'Le président du Sénat gagne +10 de stabilité et un droit de veto renforcé.',
  },
};

// "How to play" window.
import { h } from './dom.js';

export function helpModal() {
  const existing = document.querySelector('.overlay.help');
  if (existing) existing.remove();
  const rows = [
    ['Espace', 'Pause / reprise'], ['1 à 5', 'Vitesse du temps'], ['Clic', 'Sélectionner un système, une flotte'],
    ['Clic droit', 'Déplacer la flotte sélectionnée'], ['Molette / pincement', 'Zoom'], ['Glisser', 'Déplacer la carte'],
    ['Flèches / ZQSD', 'Déplacer la carte'], ['M', 'Changer de mode de carte'], ['E F G I R N P L C H', 'Panneaux (Économie, Flotte, Diplomatie…)'],
    ['Échap', 'Désélectionner / fermer'],
  ];
  const overlay = h('div', { class: 'overlay help', onclick: (e) => { if (e.target === overlay) overlay.remove(); } },
    h('div', { class: 'modal wide' },
      h('div', { class: 'modal-head' }, h('h3', {}, 'Comment jouer'), h('button', { class: 'btn small', onclick: () => overlay.remove() }, 'Fermer')),
      h('div', { class: 'modal-body stack' },
        h('p', {}, 'Galactic Protocol est une grande stratégie en temps réel pausable. Vous dirigez une faction de la galaxie Star Wars : gérez son économie, levez des flottes, négociez, espionnez et, si la tension le permet, employez des superarmes.'),
        h('div', { class: 'grid2' },
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Économie'), h('div', {}, 'Le PIB de vos systèmes est taxé. Répartissez le budget entre recherche, renseignement, programmes sociaux et infrastructures. Durasteel, tibanna, kyber, bacta et épice se produisent dans les mines et s’échangent sur le marché galactique.')),
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Armées'), h('div', {}, 'Recrutez dans vos casernes, bases de chasseurs et chantiers navals. Les flottes voyagent sur les hyperroutes (les grandes routes commerciales sont plus rapides). Pour prendre une planète, il faut la supériorité spatiale puis des troupes au sol.')),
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Diplomatie & Sénat'), h('div', {}, 'Accords commerciaux, pactes de non-agression, droits de passage, alliances et vassalités. Le Sénat vote sanctions, condamnations, aides et traités. Le score de guerre détermine les conditions de paix.')),
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Renseignement'), h('div', {}, 'Chaque faction dispose d’une agence (ISB, SpyNet bothan…) aux talents propres : reconnaissance, vol de technologie, sabotage, soulèvements, assassinats et vol des plans d’une superarme.')),
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Stabilité'), h('div', {}, 'Impôts, lassitude de guerre, distance à la capitale et occupation font chuter la stabilité. Les mondes instables se soulèvent et nourrissent l’insurrection.')),
          h('div', { class: 'card small' }, h('b', { class: 'accent' }, 'Niveau d’alerte'), h('div', {}, 'Comme le DEFCON, cinq niveaux mesurent la tension galactique. Le bombardement Base Delta Zéro exige le niveau 3, les superlasers le niveau 2.')),
        ),
        h('table', { class: 'table' }, rows.map(([k, v]) => h('tr', {}, h('td', { style: { width: '170px' } }, h('b', {}, k)), h('td', {}, v)))),
      )));
  document.getElementById('ui').append(overlay);
}

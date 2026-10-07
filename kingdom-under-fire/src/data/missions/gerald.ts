import { parseMission, type Mission } from '../../missions/Mission';

const NORTH = Math.PI;
const SOUTH = 0;

/** A ring of houses around a village square. */
function village(cx: number, cz: number): { kind: 'house' | 'hut'; x: number; z: number; rot: number }[] {
  const houses: { kind: 'house' | 'hut'; x: number; z: number; rot: number }[] = [];
  const ring = [
    [-18, -10, 0.3],
    [-2, -16, -0.1],
    [15, -11, 0.2],
    [22, 4, 1.4],
    [-22, 6, 1.2],
    [-12, 18, -0.4],
    [8, 17, 0.1],
  ] as const;
  for (const [dx, dz, rot] of ring) houses.push({ kind: 'house', x: cx + dx, z: cz + dz, rot });
  houses.push({ kind: 'hut', x: cx + 24, z: cz + 20, rot: 0 }, { kind: 'hut', x: cx - 26, z: cz + 22, rot: 0.5 }, { kind: 'hut', x: cx + 28, z: cz - 14, rot: 0.2 });
  return houses;
}

/**
 * Gerald, mission 1. Known (guides): a patrol near Greyhampton sent by General Hugh; the dwarves' airship
 * seen overhead; two green spots to reach; the cutscene of the burning village; Rithrin and his dark elves
 * nearby, a brief fight, then the report to Hugh. The map, the troops and the words are ours.
 */
const GREYHAMPTON = {
  id: 'greyhampton',
  campaign: 'gerald',
  order: 1,
  title: 'Greyhampton',
  era: 'Campagne de Gerald — mission 1',
  briefing: [
    'Le général Hugh envoie Gerald, capitaine de la Force de défense de l’Est, patrouiller jusqu’au village de Greyhampton, à la frontière de Vellond.',
    'Gerald mène sa garde, avec Rupert et Ellen, et une troupe d’archers. Rejoignez les deux points verts sur la carte, puis le village.',
    'Les troupes se commandent depuis la vue tactique (clic droit pour marcher, Q / E pour changer de troupe) ; Tab ou un zoom sur la garde de Gerald le fait combattre de vos mains.',
  ],
  objective: 'Patrouiller jusqu’à Greyhampton par les deux points verts.',
  playerFaction: 'human_alliance',
  enemyFaction: 'dark_legion',
  allies: ['gerald', 'hugh', 'rupert', 'ellen'],
  enemies: ['rithrin'],
  victory: 'Rithrin s’enfuit. Gerald retourne au camp faire son rapport au général Hugh : la Légion a brûlé Greyhampton.',
  defeat: 'La patrouille de Gerald n’est jamais rentrée.',
  sources:
    'Guides : patrouille ordonnée par Hugh, ballon des nains, deux points verts, village en flammes, Rithrin et ses elfes noirs, brève escarmouche, rapport. Carte, troupes et dialogues : reconstitution.',
  map: {
    seed: 3101,
    sites: [
      { x: 128, z: 92, radius: 40 },
      { x: 128, z: 222, radius: 18 },
      { x: 128, z: 176, radius: 14 },
      { x: 128, z: 134, radius: 14 },
    ],
    props: [
      ...village(128, 92),
      { kind: 'palisade', x: 120, z: 62, rot: 0, length: 20 },
      { kind: 'palisade', x: 98, z: 70, rot: 0.9, length: 14 },
      { kind: 'palisade', x: 156, z: 70, rot: -0.8, length: 14 },
    ],
  },
  camera: { x: 128, z: 214 },
  troops: [
    { key: 'guard', name: 'Garde de Gerald', type: 'hir_infantry', count: 15, hero: 'hero_gerald', side: 'player', x: 128, z: 222, facing: NORTH },
    { key: 'archers', name: 'Archers', type: 'hir_archer', count: 14, side: 'player', x: 128, z: 236, facing: NORTH },
    { key: 'rithrin', name: 'Archers de Rithrin', type: 'vel_archer', count: 16, side: 'enemy', x: 128, z: 68, facing: SOUTH, reserve: true, engage: 50 },
    {
      key: 'raiders',
      name: 'Infanterie elfe noire',
      type: 'vel_infantry',
      count: 16,
      side: 'enemy',
      x: 104,
      z: 116,
      facing: SOUTH,
      reserve: true,
      stance: { kind: 'advance', x: 128, z: 140, after: 0 },
      engage: 70,
    },
  ],
  events: [
    {
      id: 'start',
      when: { kind: 'start' },
      do: [
        { kind: 'objective', id: 'spot1', text: 'Rejoindre le premier point vert', state: 'active', marker: { x: 128, z: 176, radius: 10 } },
        { kind: 'objective', id: 'spot2', text: 'Rejoindre le second point vert', state: 'active', marker: { x: 128, z: 134, radius: 10 } },
        { kind: 'say', speaker: 'gerald', text: 'Le général Hugh veut des nouvelles de Greyhampton. En route, et gardez les yeux ouverts.' },
      ],
    },
    {
      id: 'spot1',
      when: { kind: 'reach', x: 128, z: 176, radius: 11 },
      do: [
        { kind: 'objective', id: 'spot1', state: 'done' },
        { kind: 'flyover', from: { x: 20, z: 236 }, to: { x: 236, z: 40 }, seconds: 26 },
        { kind: 'say', speaker: 'rupert', text: 'Gerald, là-haut ! Un ballon des nains.' },
        { kind: 'say', speaker: 'gerald', text: 'Si loin de leurs montagnes ? Pressons le pas.' },
      ],
    },
    { id: 'spot2', when: { kind: 'reach', x: 128, z: 134, radius: 11 }, do: [{ kind: 'objective', id: 'spot2', state: 'done' }] },
    {
      id: 'village',
      when: { kind: 'all', events: ['spot1', 'spot2'] },
      do: [
        { kind: 'burn', x: 128, z: 92, radius: 30 },
        { kind: 'cutscene', x: 128, z: 100 },
        { kind: 'say', speaker: null, text: 'Greyhampton n’est plus que flammes et ruines.' },
        { kind: 'say', speaker: 'gerald', text: 'Ils n’ont rien laissé debout…' },
        { kind: 'spawn', troops: ['rithrin', 'raiders'] },
        { kind: 'say', speaker: 'ellen', text: 'Des elfes noirs, près des ruines ! C’est Rithrin.' },
        { kind: 'say', speaker: 'gerald', text: 'La Légion a fait ça. Sus à eux !' },
        { kind: 'objective', id: 'rithrin', text: 'Repousser les elfes noirs de Rithrin', state: 'active' },
      ],
    },
    {
      id: 'retreat',
      when: { kind: 'broken', troops: ['raiders'] },
      do: [
        { kind: 'stance', troops: ['rithrin'], stance: { kind: 'advance', x: 128, z: 18, after: 0 } },
        { kind: 'say', speaker: 'rithrin', text: 'Repliez-vous ! Vers le nord !' },
      ],
    },
    {
      id: 'won',
      when: { kind: 'after', event: 'retreat', seconds: 8 },
      do: [
        { kind: 'objective', id: 'rithrin', state: 'done' },
        { kind: 'say', speaker: 'gerald', text: 'Qu’il fuie. Le général Hugh doit savoir ce qui s’est passé ici.' },
        { kind: 'victory' },
      ],
    },
    {
      id: 'rithrin_broken',
      when: { kind: 'broken', troops: ['rithrin'] },
      do: [{ kind: 'objective', id: 'rithrin', state: 'done' }, { kind: 'victory' }],
    },
  ],
};

/**
 * Gerald, mission 2. Known (guides): the first big battle; the order to reach the wall to save the sappers,
 * where Gerald always arrives too late; an infantry troop and an archer troop to face in tight formation,
 * the forest north of them easing the arrows; two troops attacking friendly archers by the shore, who join
 * Gerald once saved; the enemy cavalry at the next waypoint (spears hold, infantry flanks); no healing spell
 * yet. Rithrin commanded the archers of Ravenmeadow. The map, the troops and the words are ours (our maps
 * have no water: the shore becomes the eastern flank).
 */
const RAVENMEADOW = {
  id: 'ravenmeadow',
  campaign: 'gerald',
  order: 2,
  title: 'Ravenmeadow',
  era: 'Campagne de Gerald — mission 2',
  briefing: [
    'Hironeiden marche sur Ravenmeadow, place forte de Vellond. Les sapeurs sont déjà au pied du mur ; Gerald doit les rejoindre.',
    'C’est la première grande bataille de Gerald, et aucun sort de soin ne l’aidera : serrez les rangs, cherchez les chefs de troupe et abattez-les vite.',
    'Les flèches portent moins dans les bois. Gardez vos lanciers face aux cavaliers.',
  ],
  objective: 'Rejoindre le mur, briser les défenseurs de Ravenmeadow.',
  playerFaction: 'human_alliance',
  enemyFaction: 'dark_legion',
  allies: ['gerald', 'rupert', 'ellen'],
  enemies: ['rithrin'],
  victory: 'La porte de Ravenmeadow est tombée. Rithrin et ses archers fuient vers le sud.',
  defeat: 'L’assaut sur Ravenmeadow a échoué.',
  sources:
    'Guides : sapeurs au mur sauvés trop tard, infanterie et archers en formation serrée, forêt au nord qui atténue les flèches, archers alliés sauvés près de la rive qui rejoignent Gerald, cavalerie ennemie au point suivant, pas de soin. Rithrin commandait les archers de Ravenmeadow. Carte, troupes et dialogues : reconstitution.',
  map: {
    seed: 5207,
    sites: [
      { x: 128, z: 50, radius: 48 },
      { x: 128, z: 118, radius: 28 },
      { x: 204, z: 150, radius: 22 },
      { x: 128, z: 226, radius: 18 },
    ],
    props: [
      { kind: 'wall', x: 70, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 82, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 94, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 106, z: 42, rot: 0, length: 12 },
      { kind: 'tower', x: 115, z: 42 },
      { kind: 'tower', x: 141, z: 42 },
      { kind: 'wall', x: 150, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 162, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 174, z: 42, rot: 0, length: 12 },
      { kind: 'wall', x: 186, z: 42, rot: 0, length: 12 },
      { kind: 'tower', x: 62, z: 42 },
      { kind: 'tower', x: 194, z: 42 },
      { kind: 'house', x: 100, z: 30, rot: 0.1 },
      { kind: 'house', x: 156, z: 30, rot: -0.2 },
      { kind: 'tent', x: 128, z: 238, rot: 0 },
      { kind: 'tent', x: 116, z: 240, rot: 0 },
      { kind: 'tent', x: 140, z: 240, rot: 0 },
    ],
  },
  camera: { x: 128, z: 216 },
  troops: [
    { key: 'guard', name: 'Garde de Gerald', type: 'hir_infantry', count: 15, hero: 'hero_gerald', side: 'player', x: 120, z: 224, facing: NORTH },
    { key: 'spears', name: 'Lanciers', type: 'hir_spearman', count: 16, side: 'player', x: 142, z: 226, facing: NORTH },
    { key: 'sappers', name: 'Sapeurs', type: 'hir_sapper', count: 10, side: 'ally', x: 128, z: 64, facing: NORTH },
    {
      key: 'garrison',
      name: 'Garnison de Ravenmeadow',
      type: 'vel_infantry',
      count: 14,
      side: 'enemy',
      x: 128,
      z: 50,
      facing: SOUTH,
      engage: 40,
    },
    { key: 'field', name: 'Infanterie elfe noire', type: 'vel_infantry', count: 16, side: 'enemy', x: 122, z: 120, facing: SOUTH, engage: 45 },
    { key: 'rithrin', name: 'Archers de Rithrin', type: 'vel_archer', count: 16, side: 'enemy', x: 134, z: 106, facing: SOUTH, engage: 50 },
    { key: 'shore_archers', name: 'Archers de la colonne', type: 'hir_archer', count: 14, side: 'ally', x: 206, z: 156, facing: NORTH, reserve: true },
    {
      key: 'raiders',
      name: 'Pillards elfes noirs',
      type: 'vel_infantry',
      count: 12,
      side: 'enemy',
      x: 214,
      z: 122,
      facing: SOUTH,
      reserve: true,
      stance: { kind: 'advance', x: 206, z: 156, after: 0 },
      engage: 60,
    },
    {
      key: 'riders',
      name: 'Archers montés',
      type: 'vel_cavalry_archer',
      count: 8,
      side: 'enemy',
      x: 196,
      z: 120,
      facing: SOUTH,
      reserve: true,
      stance: { kind: 'advance', x: 200, z: 160, after: 0 },
      engage: 60,
    },
    { key: 'gate_cavalry', name: 'Cavalerie de Ravenmeadow', type: 'vel_cavalry', count: 10, side: 'enemy', x: 128, z: 58, facing: SOUTH, reserve: true, engage: 55 },
  ],
  events: [
    {
      id: 'start',
      when: { kind: 'start' },
      do: [
        { kind: 'objective', id: 'sappers', text: 'Rejoindre le mur pour sauver les sapeurs', state: 'active', marker: { x: 128, z: 68, radius: 14 } },
        { kind: 'objective', id: 'field', text: 'Briser l’infanterie et les archers de Rithrin', state: 'active' },
        { kind: 'say', speaker: 'gerald', text: 'Les sapeurs sont seuls au pied du mur. En avant, et gardez les rangs serrés !' },
      ],
    },
    {
      id: 'too_late',
      when: { kind: 'broken', troops: ['sappers'] },
      do: [
        { kind: 'objective', id: 'sappers', state: 'failed' },
        { kind: 'say', speaker: 'rupert', text: 'Trop tard, Gerald… les sapeurs sont tombés.' },
        { kind: 'say', speaker: 'gerald', text: 'Alors vengeons-les. Les elfes de Rithrin d’abord.' },
      ],
    },
    {
      id: 'rithrin_flees',
      when: { kind: 'broken', troops: ['rithrin'] },
      do: [{ kind: 'say', speaker: 'rithrin', text: 'Ravenmeadow ne vous appartiendra jamais !' }],
    },
    {
      id: 'shore',
      when: { kind: 'broken', troops: ['field', 'rithrin'] },
      do: [
        { kind: 'objective', id: 'field', state: 'done' },
        { kind: 'spawn', troops: ['shore_archers', 'raiders', 'riders'] },
        { kind: 'say', speaker: 'ellen', text: 'À l’est ! Nos archers sont attaqués !' },
        { kind: 'objective', id: 'rescue', text: 'Secourir les archers à l’est', state: 'active', marker: { x: 206, z: 156, radius: 16 } },
      ],
    },
    {
      id: 'rescued',
      when: { kind: 'broken', troops: ['raiders', 'riders'] },
      do: [
        { kind: 'join', troops: ['shore_archers'] },
        { kind: 'objective', id: 'rescue', state: 'done' },
        { kind: 'say', speaker: null, text: 'Les archers de la colonne rejoignent la troupe de Gerald.' },
        { kind: 'spawn', troops: ['gate_cavalry'] },
        { kind: 'objective', id: 'gate', text: 'Briser les défenseurs de la porte', state: 'active', marker: { x: 128, z: 66, radius: 14 } },
        { kind: 'say', speaker: 'rupert', text: 'Leur cavalerie sort par la porte. Que les lances tiennent, on les prendra de flanc !' },
      ],
    },
    {
      id: 'gate',
      when: { kind: 'broken', troops: ['gate_cavalry', 'garrison'] },
      do: [
        { kind: 'objective', id: 'gate', state: 'done' },
        { kind: 'say', speaker: 'gerald', text: 'La porte est à nous. Ravenmeadow est tombée !' },
        { kind: 'victory' },
      ],
    },
  ],
};

export const GERALD_MISSIONS: readonly Mission[] = [GREYHAMPTON, RAVENMEADOW].map(parseMission);

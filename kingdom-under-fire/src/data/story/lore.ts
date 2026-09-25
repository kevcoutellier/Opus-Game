import { z } from 'zod';

// Story of Kingdom Under Fire: A War of Heroes (Phantagram, 2001), retold in our own words. Names, places
// and events follow the original game and the Kingdom Under Fire Wiki. Portraits: src/assets/sources.json.

export const WORLD_NAME = 'Bersia';

export interface LoreChapter {
  title: string;
  paragraphs: string[];
}

export const LORE: readonly LoreChapter[] = [
  {
    title: 'La Lumière et les Ténèbres',
    paragraphs: [
      'À l’aube de Bersia, Nibel, seigneur de la Lumière, et Encablossa, seigneur des Ténèbres, scellèrent un pacte : chacun régnerait sur le monde à son tour.',
      'Quand l’Âge de la Lumière toucha à sa fin, Nibel refusa de céder le trône. Encablossa leva sa Légion Noire, et depuis, la guerre revient hanter Bersia à chaque génération.',
    ],
  },
  {
    title: 'La Première Guerre des Héros',
    paragraphs: [
      'Il y a un siècle, la liche Khilliani, maître de Hexter, envahit la forêt des elfes pour s’emparer du Cœur Ancien, relique de Nibel, et s’en servir pour ouvrir à Encablossa les portes de Bersia.',
      'Les elfes confièrent le Cœur à deux messagers, Karl et Celin, chargés d’implorer l’aide de Hironeiden. Mais le royaume, soucieux de sa paix, avait déjà pactisé avec la liche.',
      'Une poignée d’aventuriers se dressa pourtant. L’un d’eux, Rick Miner, tomba sous les coups de Khilliani ; l’archimage Moonlight le ramena à la vie par la puissance du Cœur Ancien. Doté d’une force nouvelle, Rick Miner perça les défenses de la liche, l’anéantit et abattit l’Autel de Destruction. Les survivants entrèrent dans la légende sous le nom de Chevaliers Xok.',
    ],
  },
  {
    title: 'La Seconde Guerre des Héros',
    paragraphs: [
      'Rendu immortel par le Cœur Ancien, Rick Miner disparut. Il reparaît aujourd’hui sous le nom de Rick Blood, Empereur noir de la Légion, décidé à achever ce qui avait commencé cent ans plus tôt : rebâtir l’Autel de Destruction.',
      'Hexter lui obéit : l’ogre Likuku mène ses hordes d’orcs et d’ogres, l’elfe noire Lauriana le conseille, le seigneur vampire Richter Rosenheim lui a rallié les clans de Vellond, et la liche Amaruak dresse les plans de l’Autel.',
      'Face à la Légion, Gernot, prince d’Azilla, rassemble Hironeiden et envoie ses messagers aux elfes de la forêt d’Essex et aux nains du Hall des Pierres. Parmi eux, Curian, élevé par les moines de Hironeiden pour porter la paix, et son vieil ami Russelaunt, guerrier du village de Haven.',
    ],
  },
];

const CharacterSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  faction: z.enum(['human_alliance', 'dark_legion']),
  title: z.string().min(1),
  bio: z.string().min(1),
});
export type Character = z.infer<typeof CharacterSchema>;

const RAW_CHARACTERS = [
  {
    id: 'curian',
    name: 'Curian',
    faction: 'human_alliance',
    title: 'Messager de la paix',
    bio: 'Élevé par les moines de Hironeiden, il a vu les orcs raser Haven, le village de son enfance. Envoyé du roi auprès des elfes et des nains.',
  },
  {
    id: 'russelaunt',
    name: 'Russelaunt',
    faction: 'human_alliance',
    title: 'Guerrier de Haven',
    bio: 'Originaire d’Azilla, chef spirituel du village de Haven. C’est lui qui a fait de Curian un combattant.',
  },
  {
    id: 'gernot',
    name: 'Gernot',
    faction: 'human_alliance',
    title: 'Roi d’Azilla, défenseur de Hironeiden',
    bio: 'Il a repoussé la première invasion orque et unit les royaumes humains, les elfes et les nains contre la Légion Noire.',
  },
  {
    id: 'moonlight',
    name: 'Moonlight',
    faction: 'human_alliance',
    title: 'Archimage',
    bio: 'Héroïne de la Première Guerre des Héros : c’est elle qui ressuscita Rick Miner grâce au Cœur Ancien.',
  },
  {
    id: 'demetrich',
    name: 'Lord Demetrich',
    faction: 'human_alliance',
    title: 'Roi d’Ecclesia',
    bio: 'Souverain d’Ecclesia, allié incertain dont la loyauté envers l’Alliance vacille.',
  },
  {
    id: 'rick_blood',
    name: 'Rick Blood',
    faction: 'dark_legion',
    title: 'Empereur noir de la Légion',
    bio: 'Autrefois Rick Miner, Chevalier Xok ressuscité par le Cœur Ancien. Immortel, il veut rebâtir l’Autel de Destruction.',
  },
  {
    id: 'likuku',
    name: 'Likuku',
    faction: 'dark_legion',
    title: 'Chef ogre de Hexter',
    bio: 'Commandant des hordes d’orcs et d’ogres de la Légion. Ses raids ont ravagé les villages du sud de Hironeiden.',
  },
  {
    id: 'lauriana',
    name: 'Lauriana',
    faction: 'dark_legion',
    title: 'Elfe noire, conseillère de Likuku',
    bio: 'Elle a appuyé l’assaut contre Haven et rallié les elfes noirs à la Légion.',
  },
  {
    id: 'richter',
    name: 'Richter Rosenheim',
    faction: 'dark_legion',
    title: 'Seigneur vampire de Vellond',
    bio: 'Chef du plus grand clan vampire de Vellond, attiré par Rick Blood comme un papillon par la flamme.',
  },
  {
    id: 'lily',
    name: 'Lily',
    faction: 'dark_legion',
    title: 'Succube',
    bio: 'Démone libérée des Ruines des Âmes Perdues, qui rêve de soumettre Rick Blood à ses charmes.',
  },
  {
    id: 'amaruak',
    name: 'Amaruak',
    faction: 'dark_legion',
    title: 'Liche, bâtisseur de l’Autel',
    bio: 'Mort-vivant savant qui dresse les plans de l’Autel de Destruction. Ses véritables desseins restent obscurs.',
  },
  {
    id: 'regnier',
    name: 'Regnier',
    faction: 'dark_legion',
    title: 'Le nom que portera Rick Blood',
    bio: 'Des années plus tard, Rick Blood deviendra Regnier, champion d’Encablossa, lors de la guerre des Croisés.',
  },
] as const;

export const CHARACTERS: readonly Character[] = RAW_CHARACTERS.map((c) => CharacterSchema.parse(c));

export function character(id: string): Character {
  const c = CHARACTERS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown character ${id}`);
  return c;
}

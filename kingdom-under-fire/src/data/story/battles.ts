import { z } from 'zod';
import { CHARACTERS } from './lore';

const BattleSchema = z.object({
  id: z.string(),
  title: z.string(),
  era: z.string(),
  briefing: z.array(z.string()).min(1),
  objective: z.string(),
  playerFaction: z.enum(['human_alliance', 'dark_legion']),
  enemyFaction: z.enum(['human_alliance', 'dark_legion']),
  /** Characters shown in the briefing: the player's commanders, then the enemy's. */
  allies: z.array(z.string()),
  enemies: z.array(z.string()),
  victory: z.string(),
  defeat: z.string(),
});
export type BattleStory = z.infer<typeof BattleSchema>;

/** The prototype battle, placed in the Second War of Heroes. */
export const PROTOTYPE_BATTLE: BattleStory = BattleSchema.parse({
  id: 'plaines_hironeiden',
  title: 'Les plaines de Hironeiden',
  era: 'Seconde Guerre des Héros',
  briefing: [
    'Les orcs de Likuku ont franchi la frontière. Leurs raids ont réduit en cendres les villages du sud, et Haven, le village de Curian, n’est plus que ruines.',
    'Likuku marche en personne sur Hironeiden à la tête de sa horde : guerriers et lanciers orcs, ogres, archers et cavaliers elfes noirs. Le roi Gernot confie à Curian l’armée de la plaine : fantassins, templiers, lanciers, archers et chevaliers. Arrêtez-la avant les murailles.',
    'L’orc frappe fort mais tient mal le rang. Gardez vos lances face aux cavaliers, prenez les ogres de flanc, chargez les archers. Curian peut combattre au milieu de ses hommes (Tab) : ses sorts et son courage peuvent renverser la bataille. Si Likuku tombe, la horde vacillera.',
  ],
  objective: 'Briser l’armée de Likuku : tuer ou mettre en déroute tous ses soldats.',
  playerFaction: 'human_alliance',
  enemyFaction: 'dark_legion',
  allies: ['gernot', 'curian'],
  enemies: ['likuku', 'lauriana'],
  victory: 'La horde de Likuku est brisée. Hironeiden tiendra encore.',
  defeat: 'L’armée de Curian est brisée : la horde de Likuku marche sur Hironeiden.',
});

for (const id of [...PROTOTYPE_BATTLE.allies, ...PROTOTYPE_BATTLE.enemies]) {
  if (!CHARACTERS.some((c) => c.id === id)) throw new Error(`Battle ${PROTOTYPE_BATTLE.id} names unknown character ${id}`);
}

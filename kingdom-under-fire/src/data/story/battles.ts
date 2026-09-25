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
    'Leur avant-garde marche à présent sur Hironeiden. Le roi Gernot vous confie une compagnie de fantassins et de lanciers : arrêtez-la dans la plaine, avant qu’elle n’atteigne les murailles.',
    'Méfiez-vous : l’orc frappe fort et encaisse bien, mais il tient mal le rang. Gardez vos lignes serrées, faites plier sa première vague, et la horde se débandera.',
  ],
  objective: 'Briser l’avant-garde orque : tuer ou mettre en déroute tous ses guerriers.',
  playerFaction: 'human_alliance',
  enemyFaction: 'dark_legion',
  allies: ['gernot', 'curian'],
  enemies: ['likuku', 'lauriana'],
  victory: 'L’avant-garde de Likuku est brisée. Hironeiden tiendra encore.',
  defeat: 'Votre compagnie est brisée : la horde de Likuku marche sur Hironeiden.',
});

for (const id of [...PROTOTYPE_BATTLE.allies, ...PROTOTYPE_BATTLE.enemies]) {
  if (!CHARACTERS.some((c) => c.id === id)) throw new Error(`Battle ${PROTOTYPE_BATTLE.id} names unknown character ${id}`);
}

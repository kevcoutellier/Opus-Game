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

/**
 * Skirmish of The Crusaders, outside the campaign (the missions of Gerald come next): Hironeiden against
 * Vellond, Gerald against Lucretia, to try their troops against each other.
 */
export const SKIRMISH_BATTLE: BattleStory = BattleSchema.parse({
  id: 'escarmouche_frontiere',
  title: 'Escarmouche à la frontière',
  era: 'Guerre des Croisés — hors campagne',
  briefing: [
    'Hironeiden et Vellond se disputent la frontière. Sur une plaine bordée de forêts, la troupe de Gerald, capitaine de la Force de défense de l’Est, croise les gardes-frontières de Lucretia.',
    'Gerald mène sa garde avec ses officiers Rupert et Ellen, des lanciers, des archers, de la cavalerie et des sapeurs. Lucretia commande sa garde d’elfes noirs avec Morene et Cirith, de l’infanterie, des archers, des archers montés et de la cavalerie.',
    'Les elfes sont frêles mais rapides, et se soignent. Gardez vos lances face aux cavaliers, abattez les chefs de troupe, et laissez Gerald combattre au milieu de sa garde (Tab, ou zoomez sur elle). S’il tombe, tout est perdu.',
  ],
  objective: 'Briser les cinq troupes de Lucretia. Gerald ne doit pas tomber.',
  playerFaction: 'human_alliance',
  enemyFaction: 'dark_legion',
  allies: ['gerald', 'rupert', 'ellen'],
  enemies: ['lucretia', 'morene', 'cirith'],
  victory: 'Les gardes-frontières de Lucretia sont brisés. Hironeiden tient la frontière.',
  defeat: 'Gerald est tombé ou sa troupe est brisée : Vellond tient la frontière.',
});

for (const id of [...SKIRMISH_BATTLE.allies, ...SKIRMISH_BATTLE.enemies]) {
  if (!CHARACTERS.some((c) => c.id === id)) throw new Error(`Battle ${SKIRMISH_BATTLE.id} names unknown character ${id}`);
}

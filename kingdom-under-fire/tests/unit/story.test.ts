import { describe, expect, it } from 'vitest';
import { FACTIONS } from '../../src/data/factions';
import { PROTOTYPE_BATTLE } from '../../src/data/story/battles';
import { CHARACTERS, character, LORE } from '../../src/data/story/lore';

describe('story data', () => {
  it('tells the two Wars of Heroes and names the heroes of both sides', () => {
    expect(LORE.map((c) => c.title)).toContain('La Première Guerre des Héros');
    expect(LORE.map((c) => c.title)).toContain('La Seconde Guerre des Héros');
    const sides = new Set(CHARACTERS.map((c) => c.faction));
    expect(sides).toEqual(new Set(FACTIONS.map((f) => f.id)));
    expect(character('rick_blood').faction).toBe('dark_legion');
    expect(character('curian').faction).toBe('human_alliance');
    expect(new Set(CHARACTERS.map((c) => c.id)).size).toBe(CHARACTERS.length);
  });

  it('frames the prototype battle with commanders of the right sides', () => {
    for (const id of PROTOTYPE_BATTLE.allies) expect(character(id).faction).toBe(PROTOTYPE_BATTLE.playerFaction);
    for (const id of PROTOTYPE_BATTLE.enemies) expect(character(id).faction).toBe(PROTOTYPE_BATTLE.enemyFaction);
    expect(() => character('nobody')).toThrow();
  });
});

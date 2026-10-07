import type { Cost } from '../units/UnitStats';

export const RESOURCE_TYPES = ['gold', 'wood', 'food', 'stone', 'mana'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];
export const RESOURCE_NAMES: Record<ResourceType, string> = { gold: 'Or', wood: 'Bois', food: 'Nourriture', stone: 'Pierre', mana: 'Mana' };

export type Stock = Record<ResourceType, number>;

const empty = (): Stock => ({ gold: 0, wood: 0, food: 0, stone: 0, mana: 0 });

/**
 * Resources of every team. All spending goes through `canAfford` / `spend` / `refund`, so no cost is ever
 * paid twice or lost. Income per second is tracked for the display.
 */
export class ResourceManager {
  private readonly stocks: Stock[];
  private readonly income: Stock[];

  constructor(teams = 2) {
    this.stocks = Array.from({ length: teams }, empty);
    this.income = Array.from({ length: teams }, empty);
  }

  get(team: number, type: ResourceType): number {
    return this.stocks[team][type];
  }

  /** Copy of a team's stock. */
  stock(team: number): Stock {
    return { ...this.stocks[team] };
  }

  set(team: number, stock: Partial<Stock>): void {
    Object.assign(this.stocks[team], stock);
  }

  canAfford(team: number, cost: Cost): boolean {
    const s = this.stocks[team];
    for (const type of RESOURCE_TYPES) if ((cost[type] ?? 0) > s[type] + 1e-6) return false;
    return true;
  }

  /** Pays the cost if the team can afford it; false (and nothing paid) otherwise. */
  spend(team: number, cost: Cost): boolean {
    if (!this.canAfford(team, cost)) return false;
    const s = this.stocks[team];
    for (const type of RESOURCE_TYPES) s[type] -= cost[type] ?? 0;
    return true;
  }

  /** Gives back `share` of a cost (cancelled training: all of it; a demolished building: part of it). */
  refund(team: number, cost: Cost, share = 1): void {
    const s = this.stocks[team];
    for (const type of RESOURCE_TYPES) s[type] += (cost[type] ?? 0) * share;
  }

  add(team: number, type: ResourceType, amount: number): void {
    this.stocks[team][type] += amount;
  }

  /** Income per second of a team (set every tick by the buildings). */
  rate(team: number): Stock {
    return this.income[team];
  }

  setRate(team: number, rate: Stock): void {
    this.income[team] = rate;
  }
}

/** "50 or, 20 nourriture" */
export function formatCost(cost: Cost): string {
  return RESOURCE_TYPES.filter((t) => (cost[t] ?? 0) > 0)
    .map((t) => `${cost[t]} ${RESOURCE_NAMES[t].toLowerCase()}`)
    .join(', ');
}

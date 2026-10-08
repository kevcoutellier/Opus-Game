import { z } from 'zod';
import { PropSchema } from '../maps/Props';

const PointSchema = z.object({ x: z.number(), z: z.number() });

/** What an AI troop does while it has no enemy in sight (see TroopAI). */
export const StanceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('hold') }),
  z.object({ kind: z.literal('advance'), x: z.number(), z: z.number(), after: z.number().default(0) }),
]);

/** A troop of the mission, deployed at the start or held in reserve until the script brings it in. */
export const MissionTroopSchema = z.object({
  /** Name the script refers to it by. */
  key: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string(),
  /** Unit definition of its soldiers. */
  type: z.string(),
  count: z.number().int().positive(),
  /** Unit definition of a hero leading it. */
  hero: z.string().optional(),
  /** The player's, an ally led by the AI (until it joins the player), or an enemy. */
  side: z.enum(['player', 'ally', 'enemy']),
  x: z.number(),
  z: z.number(),
  /** Direction it faces (radians; 0 faces +z, π faces −z). */
  facing: z.number().default(0),
  /** Not on the field at the start: a `spawn` action brings it. */
  reserve: z.boolean().default(false),
  stance: StanceSchema.default({ kind: 'hold' }),
  /** Range (m) within which an AI troop attacks the enemies it sees. */
  engage: z.number().positive().optional(),
  /** Veterans of a campaign: multipliers of health, attack and SP earned, flat defence (set by the deployment). */
  boost: z.object({ health: z.number().positive(), attack: z.number().positive(), defense: z.number(), sp: z.number().positive().default(1) }).optional(),
});
export type MissionTroop = z.infer<typeof MissionTroopSchema>;

export const TriggerSchema = z.discriminatedUnion('kind', [
  /** When the battle starts. */
  z.object({ kind: z.literal('start') }),
  /** When the hero's troop (or any troop of the player) comes within `radius` of the point. */
  z.object({ kind: z.literal('reach'), x: z.number(), z: z.number(), radius: z.number().positive(), who: z.enum(['hero', 'any']).default('hero') }),
  /** When every listed troop is broken (routing) or destroyed. */
  z.object({ kind: z.literal('broken'), troops: z.array(z.string()).min(1) }),
  /** When the player's soldiers see one of the listed troops. */
  z.object({ kind: z.literal('seen'), troops: z.array(z.string()).min(1) }),
  /** `seconds` after another event of the script fired. */
  z.object({ kind: z.literal('after'), event: z.string(), seconds: z.number().nonnegative().default(0) }),
  /** When every listed event has fired. */
  z.object({ kind: z.literal('all'), events: z.array(z.string()).min(1) }),
]);
export type Trigger = z.infer<typeof TriggerSchema>;

export const ActionSchema = z.discriminatedUnion('kind', [
  /** A line of dialogue (`speaker`: a character of the lore, or null for the narrator). */
  z.object({ kind: z.literal('say'), speaker: z.string().nullable(), text: z.string() }),
  /** An objective appears, is fulfilled or failed; `marker` shows a green spot on the map. */
  z.object({
    kind: z.literal('objective'),
    id: z.string(),
    text: z.string().optional(),
    state: z.enum(['active', 'done', 'failed']),
    marker: PointSchema.extend({ radius: z.number().positive() }).optional(),
  }),
  /** Reserve troops come onto the field. */
  z.object({ kind: z.literal('spawn'), troops: z.array(z.string()).min(1) }),
  /** AI troops change stance. */
  z.object({ kind: z.literal('stance'), troops: z.array(z.string()).min(1), stance: StanceSchema }),
  /** Allied troops come under the player's command. */
  z.object({ kind: z.literal('join'), troops: z.array(z.string()).min(1) }),
  /** The buildings and woods within `radius` of the point catch fire. */
  z.object({ kind: z.literal('burn'), x: z.number(), z: z.number(), radius: z.number().positive() }),
  /** The camera shows a place while the dialogue that follows plays; the battle waits. */
  z.object({ kind: z.literal('cutscene'), x: z.number(), z: z.number() }),
  /** Something crosses the sky (the airship of the dwarves). */
  z.object({ kind: z.literal('flyover'), from: PointSchema, to: PointSchema, seconds: z.number().positive() }),
  z.object({ kind: z.literal('victory'), text: z.string().optional() }),
  z.object({ kind: z.literal('defeat'), text: z.string().optional() }),
]);
export type Action = z.infer<typeof ActionSchema>;

export const MissionEventSchema = z.object({
  id: z.string(),
  when: TriggerSchema,
  do: z.array(ActionSchema).min(1),
});

export const MissionSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  campaign: z.enum(['gerald']),
  /** Number of the mission in its campaign. */
  order: z.number().int().positive(),
  title: z.string(),
  era: z.string(),
  briefing: z.array(z.string()).min(1),
  objective: z.string(),
  playerFaction: z.enum(['human_alliance', 'dark_legion']),
  enemyFaction: z.enum(['human_alliance', 'dark_legion']),
  allies: z.array(z.string()),
  enemies: z.array(z.string()),
  victory: z.string(),
  defeat: z.string(),
  /** What is known of the original mission and what is ours (shown in the docs, not in the game). */
  sources: z.string(),
  map: z.object({
    seed: z.number().int(),
    size: z.number().int().positive().default(256),
    /** Flattened clearings without trees (the village, the walls). */
    sites: z.array(PointSchema.extend({ radius: z.number().positive() })).default([]),
    props: z.array(PropSchema).default([]),
  }),
  /** Where the camera looks first. */
  camera: PointSchema,
  /** Gold of the victory, and experience shared by the troops that fought (campaign). */
  reward: z.object({ gold: z.number().int().min(0), xp: z.number().int().min(0) }).default({ gold: 200, xp: 100 }),
  /**
   * Campaign deployment: how many troops the player brings, his hero's included. They stand where the
   * mission's own player troops stand, then on the extra `slots`.
   */
  deploy: z.object({ max: z.number().int().min(1), slots: z.array(PointSchema.extend({ facing: z.number().default(0) })).default([]) }).optional(),
  /** Troops that join the player's army after a victory (campaign). */
  recruits: z.array(z.object({ type: z.string(), name: z.string() })).default([]),
  troops: z.array(MissionTroopSchema).min(1),
  events: z.array(MissionEventSchema),
});
export type Mission = z.infer<typeof MissionSchema>;

/** Validates a mission and the references inside it (troop keys, events, characters are checked by tests). */
export function parseMission(raw: unknown): Mission {
  const result = MissionSchema.safeParse(raw);
  if (!result.success) throw new Error(`Invalid mission ${(raw as { id?: string })?.id}: ${z.prettifyError(result.error)}`);
  const m = result.data;
  const keys = new Set(m.troops.map((t) => t.key));
  const events = new Set(m.events.map((e) => e.id));
  const check = (key: string) => {
    if (!keys.has(key)) throw new Error(`Mission ${m.id} refers to unknown troop ${key}`);
  };
  for (const e of m.events) {
    const w = e.when;
    if (w.kind === 'broken' || w.kind === 'seen') w.troops.forEach(check);
    if (w.kind === 'after' && !events.has(w.event)) throw new Error(`Mission ${m.id}: event ${e.id} waits for unknown event ${w.event}`);
    if (w.kind === 'all') for (const id of w.events) if (!events.has(id)) throw new Error(`Mission ${m.id}: event ${e.id} waits for unknown event ${id}`);
    for (const a of e.do) if (a.kind === 'spawn' || a.kind === 'stance' || a.kind === 'join') a.troops.forEach(check);
  }
  if (!m.troops.some((t) => t.side === 'player' && t.hero && !t.reserve)) throw new Error(`Mission ${m.id} has no hero for the player`);
  if (m.deploy && deploySlots(m).length < m.deploy.max - 1) throw new Error(`Mission ${m.id}: fewer places than troops to deploy`);
  return m;
}

/** Where the player's troops (other than his hero's) stand: the mission's own, then the extra slots. */
export function deploySlots(m: Mission): { x: number; z: number; facing: number }[] {
  const own = m.troops.filter((t) => t.side === 'player' && !t.hero && !t.reserve).map((t) => ({ x: t.x, z: t.z, facing: t.facing }));
  return [...own, ...(m.deploy?.slots ?? [])];
}

/** Troops the player brings to the mission: his hero's and the others (the mission's own when not set). */
export function deployMax(m: Mission): number {
  return m.deploy?.max ?? m.troops.filter((t) => t.side === 'player' && !t.reserve).length;
}

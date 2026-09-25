import { z } from 'zod';

const HexColor = z.string().regex(/^#[0-9a-f]{6}$/i);

export const FactionDefSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  description: z.string(),
  /** Tabard and banner colour. */
  color: HexColor,
  /** Trim / metal accent colour. */
  trim: HexColor,
  /** Unit ids the faction can field. */
  units: z.array(z.string()).min(1),
});
export type FactionDef = z.infer<typeof FactionDefSchema>;

export function parseFactionDefs(raw: readonly unknown[], unitIds: ReadonlySet<string>): FactionDef[] {
  return raw.map((entry, i) => {
    const result = FactionDefSchema.safeParse(entry);
    if (!result.success) {
      const id = (entry as { id?: string })?.id ?? `#${i}`;
      throw new Error(`Invalid faction ${id}: ${z.prettifyError(result.error)}`);
    }
    for (const unit of result.data.units) {
      if (!unitIds.has(unit)) throw new Error(`Faction ${result.data.id} fields unknown unit ${unit}`);
    }
    return result.data;
  });
}

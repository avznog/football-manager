/**
 * Writes the reference data every environment needs: the seven-a-side positions and the built-in
 * formation templates. Idempotent, and safe to run against production.
 *
 * It lives apart from `db/seed.ts` because two scripts need it and only one of them may ever touch
 * a production database. `db/seed.ts` runs `main()` as it loads, so importing it to reuse one
 * function would seed a demo season as a side effect of asking for the positions table —
 * `db/bootstrap.ts` imports this instead.
 *
 * The data itself is in `db/reference.ts`; this is only the writer.
 */

import { eq, sql } from "drizzle-orm";

import { db } from "./client";
import { BUILTIN_FORMATIONS, POSITIONS } from "./reference";
import { formationSlots, formations, lineupSlots, positions } from "./schema";

export async function seedReference(): Promise<void> {
  await db
    .insert(positions)
    .values(
      POSITIONS.map((p) => ({
        code: p.code,
        labelFr: p.labelFr,
        line: p.line,
        defaultX: p.defaultX,
        defaultY: p.defaultY,
        sort: p.sort,
      })),
    )
    .onConflictDoUpdate({
      target: positions.code,
      set: {
        labelFr: sql`excluded.label_fr`,
        line: sql`excluded.line`,
        defaultX: sql`excluded.default_x`,
        defaultY: sql`excluded.default_y`,
        sort: sql`excluded.sort`,
      },
    });

  for (const template of BUILTIN_FORMATIONS) {
    // Built-ins are identified by their label among the rows with no team.
    const existing = await db.query.formations.findFirst({
      where: (f, { and, eq: equals, isNull: nul }) =>
        and(nul(f.teamId), equals(f.label, template.label)),
      columns: { id: true },
    });

    const formationId =
      existing?.id ??
      (
        await db
          .insert(formations)
          .values({ teamId: null, name: template.name, label: template.label })
          .returning({ id: formations.id })
      )[0].id;

    // Slots are replaced wholesale: a template's geometry is ours to change, and no user data
    // points at a built-in slot except through a lineup, which cascades.
    if (existing) {
      const used = await db
        .select({ id: lineupSlots.lineupId })
        .from(lineupSlots)
        .innerJoin(formationSlots, eq(formationSlots.id, lineupSlots.formationSlotId))
        .where(eq(formationSlots.formationId, formationId))
        .limit(1);
      // Somebody's composition depends on these slots — leave them alone.
      if (used.length > 0) continue;
      await db.delete(formationSlots).where(eq(formationSlots.formationId, formationId));
    }

    await db.insert(formationSlots).values(
      template.slots.map((slot) => ({
        formationId,
        positionCode: slot.positionCode,
        x: slot.x,
        y: slot.y,
        sort: slot.sort,
      })),
    );
  }

  console.log(
    `  positions: ${POSITIONS.length} · formations intégrées: ${BUILTIN_FORMATIONS.length}`,
  );
}

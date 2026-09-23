import "server-only";

/**
 * Writing a formation the coach drew.
 *
 * Not a Server Action: creating a formation is never a goal of its own, it is what happens when the
 * coach saves a composition whose slots they have moved (decision 005). It therefore has to run
 * inside the same transaction as the composition, which a `"use server"` module cannot express.
 *
 * A shape is **forked, never edited in place**: the built-in templates are shared by every team, and
 * an existing formation is referenced by compositions of matches already played. Moving its slots
 * would silently rewrite where people stood in a match that is over.
 */

import { db } from "@/db/client";
import { formationSlots, formations } from "@/db/schema";

import { customFormationNameFr, orderShape, shapeLabel, type ShapeSlot } from "./shape";

/** The transaction handle Drizzle hands to `db.transaction(...)`. */
export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type InsertedFormation = {
  formationId: string;
  label: string;
  /** Local shape keys → the `formation_slots.id`s that were just written. */
  slotIdByKey: Map<string, string>;
};

/**
 * Inserts a team-owned formation from a shape, and reports which row each local key became.
 *
 * `sort` is derived from `orderShape` rather than from the order the coach happened to drag things
 * in, so the new rows are numbered exactly the way the built-ins are (goalkeeper first, then line by
 * line from the back). The name and the label both come from the shape itself: a formation whose
 * label said `1-3-2-1` while its slots said otherwise would poison every statistic built on it.
 */
export async function insertTeamFormation(
  tx: Tx,
  input: {
    teamId: string;
    createdBy: string | null;
    shape: readonly ShapeSlot[];
    /** Optional override; by default the shape names itself, e.g. « Perso 1-2-3-1 ». */
    name?: string;
  },
): Promise<InsertedFormation> {
  const ordered = orderShape(input.shape);
  const label = shapeLabel(ordered);

  const [formation] = await tx
    .insert(formations)
    .values({
      teamId: input.teamId,
      name: input.name ?? customFormationNameFr(label),
      label,
      createdBy: input.createdBy,
    })
    .returning({ id: formations.id });

  const inserted = await tx
    .insert(formationSlots)
    .values(
      ordered.map((slot, index) => ({
        formationId: formation.id,
        positionCode: slot.positionCode,
        x: slot.x,
        y: slot.y,
        sort: index + 1,
      })),
    )
    .returning({
      id: formationSlots.id,
      positionCode: formationSlots.positionCode,
      x: formationSlots.x,
      y: formationSlots.y,
    });

  // Paired on the point rather than on the order rows came back in: two slots can never share a
  // point (a shape with a collision is refused), so this is exact and does not rely on Postgres
  // returning a multi-row insert in the order it was given.
  const idByPoint = new Map(inserted.map((row) => [pointKey(row), row.id]));
  const slotIdByKey = new Map<string, string>();
  for (const slot of ordered) {
    const id = idByPoint.get(pointKey(slot));
    if (id) slotIdByKey.set(slot.key, id);
  }

  return { formationId: formation.id, label, slotIdByKey };
}

function pointKey(slot: { positionCode: string; x: number; y: number }): string {
  return `${slot.positionCode}@${slot.x},${slot.y}`;
}

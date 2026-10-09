import "server-only";

/**
 * Reads about formations. There is one the app offers — the built-in `1-2-3-1` (decision 157) — and
 * the slots of any formation a stored composition or event happens to point at, which may be one of
 * the retired ones. Kept apart from the actions so a Server Component can read it without importing
 * a `"use server"` module (`CLAUDE.md`).
 *
 * Everything returned is plain and serialisable — the editor is a client component, and a Drizzle
 * row with a live `Date` on it must not cross the boundary.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";

import { db } from "@/db/client";
import { DEFAULT_FORMATION_LABEL, THE_FORMATION } from "@/db/reference";
import { formationSlots, formations } from "@/db/schema";

export type FormationSlotRow = {
  id: string;
  positionCode: string;
  x: number;
  y: number;
  sort: number;
};

export type FormationRow = {
  id: string;
  name: string;
  /** `1-2-3-1` — derived from the slots when the formation was created. */
  label: string;
  /** True for a template shared by every team (`formations.team_id is null`). */
  isBuiltin: boolean;
  /** One line of French describing the shape. */
  descriptionFr: string | null;
  slots: FormationSlotRow[];
};

/**
 * The one formation every composition stands on: the built-in row labelled `1-2-3-1`.
 *
 * `null` only on a database whose `formations` table is empty — `0009_seed_formations.sql` makes that
 * impossible after `db:migrate`, but the screens still have a sentence for it rather than a crash. No
 * `teamId`: the formation is shared, and a team-drawn shape is no longer something a team can have.
 */
export async function getTheFormation(): Promise<FormationRow | null> {
  const [row] = await db
    .select({ id: formations.id, name: formations.name, label: formations.label })
    .from(formations)
    .where(and(isNull(formations.teamId), eq(formations.label, DEFAULT_FORMATION_LABEL)))
    .orderBy(asc(formations.createdAt))
    .limit(1);
  if (!row) return null;

  const slots = await getFormationSlots([row.id]);
  return {
    id: row.id,
    name: row.name,
    label: row.label,
    isBuiltin: true,
    descriptionFr: THE_FORMATION.descriptionFr,
    slots: slots.get(row.id) ?? [],
  };
}

/** The slots of an arbitrary set of formations, keyed by formation id. */
export async function getFormationSlots(
  formationIds: readonly string[],
): Promise<Map<string, FormationSlotRow[]>> {
  if (formationIds.length === 0) return new Map();

  const rows = await db
    .select({
      id: formationSlots.id,
      formationId: formationSlots.formationId,
      positionCode: formationSlots.positionCode,
      x: formationSlots.x,
      y: formationSlots.y,
      sort: formationSlots.sort,
    })
    .from(formationSlots)
    .where(inArray(formationSlots.formationId, [...formationIds]))
    .orderBy(asc(formationSlots.sort));

  const bySlot = new Map<string, FormationSlotRow[]>();
  for (const row of rows) {
    const list = bySlot.get(row.formationId) ?? [];
    list.push({
      id: row.id,
      positionCode: row.positionCode,
      x: row.x,
      y: row.y,
      sort: row.sort,
    });
    bySlot.set(row.formationId, list);
  }
  return bySlot;
}

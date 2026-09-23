import "server-only";

/**
 * Reads about formations: the built-in templates every team shares, plus the ones this team drew
 * itself (decision 005). Kept apart from the actions so a Server Component can render the picker
 * without importing a `"use server"` module (`CLAUDE.md`).
 *
 * Everything returned is plain and serialisable — the formation picker and the editor are client
 * components, and a Drizzle row with a live `Date` on it must not cross the boundary.
 */

import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";

import { db } from "@/db/client";
import { BUILTIN_FORMATIONS } from "@/db/reference";
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
  /** `1-3-2-1` — derived from the slots when the formation was created. */
  label: string;
  /** True for a template shared by every team (`formations.team_id is null`). */
  isBuiltin: boolean;
  /** One line of French explaining the shape. Built-ins only; a custom one has none to show. */
  descriptionFr: string | null;
  slots: FormationSlotRow[];
};

/** Built-in descriptions live in the reference data, not in the table. Matched on the label. */
const DESCRIPTIONS_FR = new Map(
  BUILTIN_FORMATIONS.map((template) => [template.label, template.descriptionFr]),
);

/** Built-ins in the order `db/reference.ts` lists them; anything else after. */
const BUILTIN_RANK = new Map(BUILTIN_FORMATIONS.map((template, index) => [template.label, index]));

/**
 * Every formation the coach may pick from: the shared templates and the team's own.
 *
 * Both in one query, because the picker shows them together — the coach does not care which table
 * row carries a `team_id`, only what the shape looks like.
 */
export async function getFormations(teamId: string): Promise<FormationRow[]> {
  const rows = await db
    .select({
      id: formations.id,
      name: formations.name,
      label: formations.label,
      teamId: formations.teamId,
      createdAt: formations.createdAt,
    })
    .from(formations)
    .where(or(isNull(formations.teamId), eq(formations.teamId, teamId)))
    .orderBy(asc(formations.createdAt));

  return withSlots(rows);
}

/**
 * One formation, but only if this team is allowed to use it: a built-in, or its own.
 *
 * The scope is part of the predicate rather than checked afterwards, so a formation id from another
 * team comes back as "not found" instead of as a shape somebody forgot to reject.
 */
export async function getFormation(
  teamId: string,
  formationId: string,
): Promise<FormationRow | null> {
  const rows = await db
    .select({
      id: formations.id,
      name: formations.name,
      label: formations.label,
      teamId: formations.teamId,
      createdAt: formations.createdAt,
    })
    .from(formations)
    .where(
      and(
        eq(formations.id, formationId),
        or(isNull(formations.teamId), eq(formations.teamId, teamId)),
      ),
    )
    .limit(1);

  const [formation] = await withSlots(rows);
  return formation ?? null;
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

async function withSlots(
  rows: readonly {
    id: string;
    name: string;
    label: string;
    teamId: string | null;
    createdAt: Date;
  }[],
): Promise<FormationRow[]> {
  if (rows.length === 0) return [];

  const slots = await getFormationSlots(rows.map((row) => row.id));

  return rows
    .map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label,
      isBuiltin: row.teamId === null,
      descriptionFr: row.teamId === null ? (DESCRIPTIONS_FR.get(row.label) ?? null) : null,
      slots: slots.get(row.id) ?? [],
    }))
    .sort((a, b) => {
      // Templates first, in the reference order; the team's own shapes after, newest last.
      if (a.isBuiltin !== b.isBuiltin) return a.isBuiltin ? -1 : 1;
      if (a.isBuiltin && b.isBuiltin) {
        return (BUILTIN_RANK.get(a.label) ?? 99) - (BUILTIN_RANK.get(b.label) ?? 99);
      }
      return 0;
    });
}

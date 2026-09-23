"use server";

/**
 * The match sheet and the compositions.
 *
 * Same contract as the other action modules: `assertCan()` before anything else (invariant 4), the
 * `teamId` taken from the submitted form and *then* verified, Zod for every field, `revalidatePath`
 * at the end. Permissions come from the two coach actions that already exist —
 * `match:selectSquad` for the sheet, `match:manageLineups` for the compositions and for the
 * formations a composition creates.
 *
 * **Nothing here applies a composition.** `lineups.applied_event_id` is never written: a plan is a
 * proposal until the coach confirms it in game mode (invariant 3), and a composition that has been
 * confirmed describes the past, so it may no longer be edited or deleted.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { lineupSlots, lineups, matchSquad, matches, teamMembers } from "@/db/schema";
import type { SquadRole } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import { insertTeamFormation } from "@/lib/formation/persist";
import { getFormations } from "@/lib/formation/queries";
import { mapShapeToSlots, orderShape, shapeProblemsFr, type ShapeSlot } from "@/lib/formation/shape";

import {
  appliedNoticeFr,
  blockingIssues,
  findPlanIssues,
  minuteIsTaken,
  ordinalFr,
  type PlanSlot,
} from "./plan";
import { getCompositionMembers, getFieldedMemberIds, getMatchLineups } from "./queries";
import {
  lineupTargetSchema,
  readShapeFields,
  readSlotFields,
  readSquadMarks,
  saveLineupSchema,
  setMatchSquadSchema,
} from "./validation";

function revalidateComposition(matchId: string): void {
  revalidatePath(`/match/${matchId}`);
  revalidatePath(`/match/${matchId}/feuille`);
  revalidatePath(`/match/${matchId}/composition`);
  // Game mode reads the planned compositions to propose them (M4).
  revalidatePath(`/match/${matchId}/jeu`);
  revalidatePath("/calendrier");
}

/** The match, but only if it belongs to the team the form claims. */
async function findMatch(teamId: string, matchId: string) {
  return db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.teamId, teamId)),
    // `entryMode` is here for the refusal's wording, not for a rule: how a composition became a
    // record is what the message has to get right (decision NNN).
    columns: {
      id: true,
      status: true,
      periodsCount: true,
      periodMinutes: true,
      entryMode: true,
    },
  });
}

/** Active members of the team — so a crafted form cannot reach into another squad. */
async function activeMemberIds(teamId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: teamMembers.id })
    .from(teamMembers)
    .where(and(eq(teamMembers.teamId, teamId), isNull(teamMembers.leftAt)));
  return new Set(rows.map((row) => row.id));
}

/* -------------------------------------------------------------------------- */
/* The match sheet                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Titulaire / remplaçant / supporter, for the whole squad in one submit.
 *
 * One round trip for thirteen players: on a phone, thirteen submits are thirteen chances to lose the
 * connection. `"none"` deletes the row — "not selected" and "selected as a supporter" are different
 * facts, and the compositions, the ratings (decision 007) and the statistics all read the
 * difference.
 *
 * A player who has already been on the pitch in a confirmed composition cannot be taken off the
 * sheet: that would contradict a match that has already happened.
 */
export async function setMatchSquad(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = setMatchSquadSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    marks: readSquadMarks(formData.entries()),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const { teamId, matchId } = parsed.data;

  assertCan(actor, "match:selectSquad", { teamId });

  const match = await findMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };
  if (match.status === "finished") {
    return { error: "Le match est terminé : la feuille de match ne change plus." };
  }

  const allowed = await activeMemberIds(teamId);
  const marks = parsed.data.marks.filter((mark) => allowed.has(mark.teamMemberId));

  const locked = new Set(await getFieldedMemberIds(matchId));
  const wouldDrop = marks.some(
    (mark) =>
      mark.mark !== "starter" && mark.mark !== "substitute" && locked.has(mark.teamMemberId),
  );
  if (wouldDrop) {
    return { error: "Un joueur déjà entré en jeu ne peut pas quitter la feuille de match." };
  }

  const selected = marks.filter(
    (mark): mark is { teamMemberId: string; mark: SquadRole } => mark.mark !== "none",
  );
  const cleared = marks.filter((mark) => mark.mark === "none").map((mark) => mark.teamMemberId);

  await db.transaction(async (tx) => {
    if (selected.length > 0) {
      await tx
        .insert(matchSquad)
        .values(
          selected.map((mark) => ({
            matchId,
            teamMemberId: mark.teamMemberId,
            role: mark.mark,
          })),
        )
        .onConflictDoUpdate({
          target: [matchSquad.matchId, matchSquad.teamMemberId],
          // `excluded.role` is the value of the row that collided, so one statement sets a different
          // role per player instead of one `UPDATE` each.
          set: { role: sql<SquadRole>`excluded.role` },
        });
    }

    if (cleared.length > 0) {
      // A player leaving the sheet leaves every *planned* composition with him: a `lineup_slots` row
      // for somebody who is not selected means nothing. Applied compositions are protected above.
      const planned = await tx
        .select({ id: lineups.id })
        .from(lineups)
        .where(and(eq(lineups.matchId, matchId), isNull(lineups.appliedEventId)));

      if (planned.length > 0) {
        await tx.delete(lineupSlots).where(
          and(
            inArray(
              lineupSlots.lineupId,
              planned.map((lineup) => lineup.id),
            ),
            inArray(lineupSlots.teamMemberId, cleared),
          ),
        );
      }

      await tx
        .delete(matchSquad)
        .where(and(eq(matchSquad.matchId, matchId), inArray(matchSquad.teamMemberId, cleared)));
    }
  });

  revalidateComposition(matchId);
  // Outside any try/catch: `redirect` works by throwing (`docs/NEXTJS16.md` §5).
  redirect(`/match/${matchId}/feuille?enregistre=1`);
}

/* -------------------------------------------------------------------------- */
/* The compositions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Creates or updates a composition — the starting seven, or a plan « à partir de la 30ᵉ minute ».
 *
 * Everything happens in one transaction, because a half-written composition is worse than none: the
 * formation is resolved (reused, or created from the shape the coach drew), the `lineups` row is
 * written, and its slots are replaced. `lineup_slots` is a plain projection of the editor's state, so
 * it is deleted and rewritten rather than diffed — it carries no history, unlike `match_events`.
 */
export async function saveLineup(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = saveLineupSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    lineupId: formData.get("lineupId") || undefined,
    formationId: formData.get("formationId"),
    fromMinute: formData.get("fromMinute"),
    shapeMode: formData.get("shapeMode") ?? "existing",
    shape: readShapeFields(formData.getAll("shape")),
    assignments: readSlotFields(formData.getAll("slot")),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const { teamId, matchId, lineupId, fromMinute, shapeMode } = parsed.data;

  assertCan(actor, "match:manageLineups", { teamId });

  const match = await findMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };
  // The same rule as the match sheet, in the same words (decision NNN). Without it the compositions
  // screen's « Planifier un changement » button really did add a plan « à partir de la 30ᵉ minute »
  // to a match played last week; a finished match is changed by appending, through
  // `lib/retro/amend.ts`, and not by planning a minute that has already been played.
  if (match.status === "finished") {
    return { error: "Le match est terminé : les compositions ne changent plus." };
  }

  const existing = await getMatchLineups(matchId);
  const target = lineupId ? existing.find((lineup) => lineup.id === lineupId) : undefined;
  if (lineupId && !target) return { error: "Cette composition n’existe pas sur ce match." };
  if (target?.isApplied) {
    return { error: appliedNoticeFr(match.entryMode).refusalFr };
  }
  if (minuteIsTaken(existing, fromMinute, lineupId ?? null)) {
    return {
      error:
        fromMinute === 0
          ? "Il y a déjà une composition de départ."
          : `Une composition démarre déjà à la ${ordinalFr(fromMinute)} minute.`,
    };
  }

  /*
   * Which formation the composition points at, and what each key the editor submitted means.
   *
   * In `existing` mode the keys already are `formation_slots.id`s. In `custom` mode they are local
   * keys of a shape that is first matched against the formations the team can already use — a shape
   * is only inserted when it is genuinely new, so saving the same one twice does not litter the
   * picker with duplicates.
   */
  const available = await getFormations(teamId);
  let shape: ShapeSlot[] = [];
  let planSlots: PlanSlot[] = [];
  let reuse: { formationId: string; slotIdByKey: Map<string, string> } | null = null;

  if (shapeMode === "custom") {
    shape = orderShape(
      parsed.data.shape.map((slot) => ({
        key: slot.key,
        positionCode: slot.positionCode,
        x: slot.x,
        y: slot.y,
      })),
    );
    const problems = shapeProblemsFr(shape);
    if (problems.length > 0) return { error: problems[0] };

    planSlots = shape.map((slot, index) => ({
      id: slot.key,
      positionCode: slot.positionCode,
      sort: index + 1,
    }));

    for (const candidate of available) {
      const mapping = mapShapeToSlots(shape, candidate.slots);
      if (mapping) {
        reuse = { formationId: candidate.id, slotIdByKey: mapping };
        break;
      }
    }
  } else {
    const formation = available.find((candidate) => candidate.id === parsed.data.formationId);
    if (!formation) return { error: "Cette formation n’est pas disponible pour cette équipe." };
    planSlots = formation.slots.map((slot) => ({
      id: slot.id,
      positionCode: slot.positionCode,
      sort: slot.sort,
    }));
    reuse = {
      formationId: formation.id,
      slotIdByKey: new Map(formation.slots.map((slot) => [slot.id, slot.id])),
    };
  }

  // Only players on the match sheet may be placed (`docs/DATA_MODEL.md`). Checked here as well as in
  // the editor, so a tab left open cannot save somebody who has since been dropped.
  const members = await getCompositionMembers(teamId, matchId);
  const selectable = new Set(
    members
      .filter((member) => member.squadRole === "starter" || member.squadRole === "substitute")
      .map((member) => member.membershipId),
  );
  if (parsed.data.assignments.some((pair) => !selectable.has(pair.memberId))) {
    return {
      error: "Un joueur de cette composition n’est pas titulaire ou remplaçant sur la feuille.",
    };
  }

  const assignments = parsed.data.assignments.map((pair) => ({
    slotId: pair.slotKey,
    memberId: pair.memberId,
  }));
  const blocking = blockingIssues(findPlanIssues({ assignments, slots: planSlots, members }));
  if (blocking.length > 0) return { error: blocking[0].messageFr };

  const savedId = await db.transaction(async (tx) => {
    let slotIdByKey = reuse?.slotIdByKey ?? new Map<string, string>();
    let formationId = reuse?.formationId ?? parsed.data.formationId;

    if (!reuse) {
      const inserted = await insertTeamFormation(tx, {
        teamId,
        createdBy: actor.userId,
        shape,
      });
      formationId = inserted.formationId;
      slotIdByKey = inserted.slotIdByKey;
    }

    const rows = assignments
      .map((assignment) => ({
        slotId: slotIdByKey.get(assignment.slotId),
        memberId: assignment.memberId,
      }))
      .filter((row): row is { slotId: string; memberId: string } => row.slotId !== undefined);

    let id: string;
    if (target) {
      id = target.id;
      await tx
        .update(lineups)
        .set({ formationId, fromMinute, isInitial: fromMinute === 0 })
        .where(and(eq(lineups.id, id), eq(lineups.matchId, matchId)));
      await tx.delete(lineupSlots).where(eq(lineupSlots.lineupId, id));
    } else {
      const [row] = await tx
        .insert(lineups)
        .values({
          matchId,
          formationId,
          fromMinute,
          isInitial: fromMinute === 0,
          createdBy: actor.userId,
        })
        .returning({ id: lineups.id });
      id = row.id;
    }

    if (rows.length > 0) {
      await tx.insert(lineupSlots).values(
        rows.map((row) => ({
          lineupId: id,
          formationSlotId: row.slotId,
          teamMemberId: row.memberId,
        })),
      );
    }

    return id;
  });

  revalidateComposition(matchId);
  redirect(`/match/${matchId}/composition?enregistre=${savedId}`);
}

/**
 * Deletes a planned composition.
 *
 * A composition game mode has confirmed is never deleted: `lineups.applied_event_id` ties it to an
 * event in the append-only log (invariant 1), and dropping the row would leave that event pointing
 * at nothing. The `is null` in the predicate is what enforces it, so there is no window between the
 * check and the delete.
 */
export async function deleteLineup(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = lineupTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    lineupId: formData.get("lineupId"),
  });
  if (!parsed.success) return;

  assertCan(actor, "match:manageLineups", { teamId: parsed.data.teamId });

  const match = await findMatch(parsed.data.teamId, parsed.data.matchId);
  if (!match) return;
  // A plan on a finished match is part of the record of it, even one game mode never confirmed: it
  // is what the coach had intended (decision NNN). `void` here, like every other refusal in this
  // action — the screen no longer offers the button.
  if (match.status === "finished") return;

  const deleted = await db
    .delete(lineups)
    .where(
      and(
        eq(lineups.id, parsed.data.lineupId),
        eq(lineups.matchId, parsed.data.matchId),
        isNull(lineups.appliedEventId),
      ),
    )
    .returning({ id: lineups.id });

  if (deleted.length === 0) return;

  revalidateComposition(parsed.data.matchId);
  redirect(`/match/${parsed.data.matchId}/composition`);
}

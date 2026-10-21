"use server";

/**
 * The compositions, and the selection the starting one carries (decision 165).
 *
 * Same contract as the other action modules: `assertCan()` before anything else (invariant 4), the
 * `teamId` taken from the submitted form and *then* verified, Zod for every field, `revalidatePath`
 * at the end. Permissions come from the two coach actions that already exist —
 * `match:manageLineups` for every composition, and `match:selectSquad` as well for the starting one,
 * because saving it is what writes `match_squad`. There is no separate match sheet screen any more.
 *
 * **Nothing here applies a composition.** `lineups.applied_event_id` is never written: a plan is a
 * proposal until the coach confirms it in game mode (invariant 3), and a composition that has been
 * confirmed describes the past, so it may no longer be edited or deleted.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { lineupSlots, lineups, matchSquad, matches, ratings } from "@/db/schema";
import type { SquadRole } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import { getTheFormation } from "@/lib/formation/queries";
import { loadMatchState } from "@/lib/rating/queries";

import {
  appliedNoticeFr,
  blockingIssues,
  findPlanIssues,
  minuteIsTaken,
  ordinalFr,
  type PlanSlot,
} from "./plan";
import { getCompositionMembers, getFieldedMemberIds, getMatchLineups } from "./queries";
import { isPlaceable, squadFromComposition } from "./squad";
import {
  mayAddSupporter,
  mayRemoveSupporter,
  toSupporterCandidates,
  type SupporterCandidate,
} from "./supporters";
import {
  lineupTargetSchema,
  readBenchMarks,
  readSlotFields,
  saveLineupSchema,
  supporterTargetSchema,
} from "./validation";

function revalidateComposition(matchId: string): void {
  revalidatePath(`/match/${matchId}`);
  revalidatePath(`/match/${matchId}/composition`);
  // Game mode reads the planned compositions to propose them (M4).
  revalidatePath(`/match/${matchId}/jeu`);
  revalidatePath("/calendrier");
}

/**
 * The screens a supporter row changes: the match page that offers the control, and the notation
 * screen, whose « qui doit encore noter » gains or loses a name by it.
 */
function revalidateSupporters(matchId: string): void {
  revalidatePath(`/match/${matchId}`);
  revalidatePath(`/match/${matchId}/notation`);
  revalidatePath(`/match/${matchId}/recap`);
  revalidatePath("/statistiques");
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

/* -------------------------------------------------------------------------- */
/* The compositions                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Creates or updates a composition — the starting seven, or a plan « à partir de la 30ᵉ minute ».
 *
 * Everything happens in one transaction, because a half-written composition is worse than none: the
 * `lineups` row is written — always on the one formation, which also moves an old plan drawn on a
 * retired one onto it — and its slots are replaced. `lineup_slots` is a plain projection of the
 * editor's state, so it is deleted and rewritten rather than diffed — it carries no history, unlike
 * `match_events`.
 *
 * **The starting composition also writes the selection** (decision 165): its seven are the starters,
 * and the list under its pitch says who is remplaçant and who is supporter — everybody else has no
 * `match_squad` row. `squadFromComposition` decides the rows; this action only checks, then writes
 * them in the same transaction as the lineup. A member who leaves the selection, or becomes a
 * supporter, leaves every *planned* composition with him: a slot for somebody who may not play
 * means nothing. Applied compositions are protected — their players cannot leave (rule 4).
 */
export async function saveLineup(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = saveLineupSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    lineupId: formData.get("lineupId") || undefined,
    fromMinute: formData.get("fromMinute"),
    withSquad: formData.get("squad") === "1",
    assignments: readSlotFields(formData.getAll("slot")),
  });
  if (!parsed.success) return toFormState(parsed.error);

  const { teamId, matchId, lineupId, fromMinute, withSquad } = parsed.data;

  assertCan(actor, "match:manageLineups", { teamId });
  if (withSquad) assertCan(actor, "match:selectSquad", { teamId });

  // Minute 0 is the starting composition, and only its form carries the selection. A plan submitting
  // 0 would otherwise reach the squad write with no list, and empty the bench of every match.
  if (withSquad !== (fromMinute === 0)) {
    return {
      error:
        fromMinute === 0
          ? "La minute 0, c’est la composition de départ : modifie-la plutôt."
          : "La composition de départ commence à la minute 0.",
    };
  }

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
   * The one formation every composition stands on (decision 157). Read here rather than taken from the
   * form: there is nothing to choose, so a submitted formation id could only be a stale tab or a forged
   * one. The keys the editor submitted are its `formation_slots.id`s; a key that is not one of them
   * places nobody.
   */
  const formation = await getTheFormation();
  if (!formation) return { error: "La formation n’a pas été chargée dans la base." };
  const planSlots: PlanSlot[] = formation.slots.map((slot) => ({
    id: slot.id,
    positionCode: slot.positionCode,
    sort: slot.sort,
  }));
  const slotIds = new Set(formation.slots.map((slot) => slot.id));

  // Who may be placed (`isPlaceable`): any player in the starting composition, only the selected
  // starters and substitutes in a plan. Checked here as well as in the editor, so a tab left open
  // cannot save somebody who has since been dropped.
  const members = await getCompositionMembers(teamId, matchId);
  const mode = withSquad ? "initial" : "plan";
  const placeable = new Set(
    members
      .filter((member) => isPlaceable(member, mode))
      .map((member) => member.membershipId),
  );
  if (parsed.data.assignments.some((pair) => !placeable.has(pair.memberId))) {
    return {
      error: withSquad
        ? "Un membre placé sur le terrain ne fait pas partie des joueurs de l’équipe."
        : "Un joueur de cette composition n’est ni titulaire ni remplaçant.",
    };
  }

  const assignments = parsed.data.assignments
    .filter((pair) => slotIds.has(pair.slotKey))
    .map((pair) => ({ slotId: pair.slotKey, memberId: pair.memberId }));

  const squad = withSquad
    ? squadFromComposition({
        members,
        starterIds: assignments.map((assignment) => assignment.memberId),
        marks: readBenchMarks(formData.entries()),
        lockedIds: new Set(await getFieldedMemberIds(matchId)),
      })
    : null;
  if (squad && !squad.ok) return { error: squad.errorFr };

  // The issues are read against the selection this save will write, not the one it replaces: a man
  // placed on the starting pitch is a starter from this submit on, not « hors sélection ».
  const roleAfter = new Map(squad?.ok ? squad.rows.map((row) => [row.teamMemberId, row.role]) : []);
  const membersAfter = squad?.ok
    ? members.map((member) => ({ ...member, squadRole: roleAfter.get(member.membershipId) ?? null }))
    : members;
  const blocking = blockingIssues(
    findPlanIssues({ assignments, slots: planSlots, members: membersAfter }),
  );
  if (blocking.length > 0) return { error: blocking[0].messageFr };

  const formationId = formation.id;

  const savedId = await db.transaction(async (tx) => {
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

    if (assignments.length > 0) {
      await tx.insert(lineupSlots).values(
        assignments.map((row) => ({
          lineupId: id,
          formationSlotId: row.slotId,
          teamMemberId: row.memberId,
        })),
      );
    }

    if (squad?.ok) {
      if (squad.rows.length > 0) {
        await tx
          .insert(matchSquad)
          .values(squad.rows.map((row) => ({ matchId, teamMemberId: row.teamMemberId, role: row.role })))
          .onConflictDoUpdate({
            target: [matchSquad.matchId, matchSquad.teamMemberId],
            // `excluded.role` is the value of the row that collided, so one statement sets a
            // different role per player instead of one `UPDATE` each.
            set: { role: sql<SquadRole>`excluded.role` },
          });
      }
      if (squad.cleared.length > 0) {
        await tx
          .delete(matchSquad)
          .where(and(eq(matchSquad.matchId, matchId), inArray(matchSquad.teamMemberId, squad.cleared)));
      }

      // Nobody who may not play stays in a planned change: the unselected and the supporters.
      const benched = [
        ...squad.cleared,
        ...squad.rows.filter((row) => row.role === "supporter").map((row) => row.teamMemberId),
      ];
      const otherPlanned = existing
        .filter((lineup) => !lineup.isApplied && lineup.id !== id)
        .map((lineup) => lineup.id);
      if (benched.length > 0 && otherPlanned.length > 0) {
        await tx
          .delete(lineupSlots)
          .where(
            and(inArray(lineupSlots.lineupId, otherPlanned), inArray(lineupSlots.teamMemberId, benched)),
          );
      }
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

/* -------------------------------------------------------------------------- */
/* Supporters, after the match                                                */
/* -------------------------------------------------------------------------- */

/**
 * The two reads the supporter rules need, for one match.
 *
 * `playedMatch` comes from the reducer and not from the planned compositions, which is the whole
 * reason this is a function rather than a join: most of a live match's changes are made on the spot
 * in game mode and carry no `lineup_id`, so `getFieldedMemberIds` does not see the men who came on
 * that way. Invariant 2 — the reducer is the only thing that computes who played.
 */
async function supporterCandidatesOf(
  teamId: string,
  match: Awaited<ReturnType<typeof findMatch>> & object,
): Promise<SupporterCandidate[]> {
  const [members, state] = await Promise.all([
    getCompositionMembers(teamId, match.id),
    loadMatchState({ ...match, teamId } as Parameters<typeof loadMatchState>[0]),
  ]);
  return toSupporterCandidates(
    members,
    state.players.filter((player) => player.playedMatch).map((player) => player.memberId),
  );
}

/**
 * Names somebody supporter on a match that is already over (decision 211).
 *
 * The sheet decides who has a vote (decision 159) and `saveLineup` cannot write it after the final
 * whistle, correctly — a composition is a plan for football that has not happened. A supporter is not
 * a plan: he changes no minute, no score and no position, he gains the vote and a « 1 fois supporter »
 * in his own season. So this is the one write to `match_squad` that a finished match allows, and it is
 * deliberately the narrowest possible one.
 *
 * `finished` only. Before the final whistle the composition screen is the path, and it says who is
 * remplaçant and who is supporter in the same breath as the starting eleven; a second way in would be
 * two screens disagreeing about the same row.
 */
export async function addSupporter(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = supporterTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, matchId, memberId } = parsed.data;

  assertCan(actor, "match:selectSquad", { teamId });

  const match = await findMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };
  if (match.status !== "finished") {
    return { error: "Le match n’est pas terminé : nomme-le dans la composition de départ." };
  }

  const candidates = await supporterCandidatesOf(teamId, match);
  const candidate = candidates.find((entry) => entry.memberId === memberId);
  if (!candidate) return { error: "Cette personne n’est pas dans cette équipe." };

  const verdict = mayAddSupporter(candidate);
  if (verdict !== true) return { error: verdict.errorFr };

  // `onConflictDoNothing` rather than a check: two taps on a slow connection are the ordinary case,
  // and the unique key on (match, member) is what makes the second one harmless.
  await db
    .insert(matchSquad)
    .values({ matchId, teamMemberId: memberId, role: "supporter" })
    .onConflictDoNothing();

  // No success message: the list of supporters on the page gains his name, which says it better than
  // a sentence would and is the same feedback the composition screen gives for the same act.
  revalidateSupporters(matchId);
  return undefined;
}

/**
 * Takes a supporter back off a finished match's sheet (decision 211).
 *
 * `match_squad` is not append-only — only `match_events` is (invariant 1) — so this is a real undo
 * rather than a second row saying the opposite. It refuses once he has submitted notes: removing his
 * place removes the vote that made them admissible, and those notes are his judgement of his
 * teammates, not this control's to destroy.
 *
 * The `role` is in the delete predicate as well as in the rule, so there is no window between the
 * check and the write in which a titulaire could be removed by this button.
 */
export async function removeSupporter(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = supporterTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    memberId: formData.get("memberId"),
  });
  if (!parsed.success) return toFormState(parsed.error);
  const { teamId, matchId, memberId } = parsed.data;

  assertCan(actor, "match:selectSquad", { teamId });

  const match = await findMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };
  if (match.status !== "finished") {
    return { error: "Le match n’est pas terminé : modifie-le dans la composition de départ." };
  }

  // Name and role from `getCompositionMembers`, which is where every other screen gets them: it
  // coalesces the shirt name onto the display name. Reading `team_members.shirt_name` directly here
  // printed « Cette personne a déjà donné ses notes » for everybody who has no shirt name, which is
  // most of the squad.
  const [members, rated] = await Promise.all([
    getCompositionMembers(teamId, matchId),
    db
      .select({ id: ratings.id })
      .from(ratings)
      .where(and(eq(ratings.matchId, matchId), eq(ratings.raterMemberId, memberId)))
      .limit(1),
  ]);
  const member = members.find((entry) => entry.membershipId === memberId);
  if (!member) return { error: "Cette personne n’est pas dans cette équipe." };

  const verdict = mayRemoveSupporter(
    { name: member.name, squadRole: member.squadRole },
    rated.length > 0,
  );
  if (verdict !== true) return { error: verdict.errorFr };

  await db
    .delete(matchSquad)
    .where(
      and(
        eq(matchSquad.matchId, matchId),
        eq(matchSquad.teamMemberId, memberId),
        eq(matchSquad.role, "supporter"),
      ),
    );

  revalidateSupporters(matchId);
  return undefined;
}

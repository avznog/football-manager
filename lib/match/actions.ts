"use server";

/**
 * Match CRUD.
 *
 * Every mutation starts with `assertCan(...)` (`CLAUDE.md`, invariant 4), and takes its `teamId`
 * from the submitted form rather than from the active-team cookie — then checks it. A forged
 * cookie must not widen anybody's reach.
 *
 * Creating and editing a match is a coach action.
 */

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { competitions, matchEvents, matches } from "@/db/schema";
import { assertCan } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";

import { hasMatchEvents } from "./queries";
import {
  createMatchSchema,
  matchTargetSchema,
  updateMatchSchema,
} from "./validation";

/**
 * What a competition id from a form is allowed to be: a row of **this** team's list (decision 107).
 *
 * The foreign key alone would accept another team's competition, and a match filed under a
 * competition belonging to somebody else's team is a leak of their vocabulary into our calendar. A
 * stale tab is the honest case: the competition was deleted between render and submit.
 */
async function competitionBelongsToTeam(teamId: string, competitionId: string): Promise<boolean> {
  const row = await db.query.competitions.findFirst({
    where: and(eq(competitions.id, competitionId), eq(competitions.teamId, teamId)),
    columns: { id: true },
  });
  return row !== undefined;
}

const UNKNOWN_COMPETITION_FR =
  "Cette compétition n’existe plus. Choisis-en une autre, ou recrée-la sur la page Équipe.";

/** Everything a calendar change can be seen from. */
function revalidateCalendar(matchId?: string): void {
  revalidatePath("/calendrier");
  if (matchId) revalidatePath(`/match/${matchId}`);
}

export async function createMatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = createMatchSchema.safeParse({
    teamId: formData.get("teamId"),
    opponentName: formData.get("opponentName"),
    kickoffAt: formData.get("kickoffAt"),
    isHome: formData.get("isHome") ?? undefined,
    venue: formData.get("venue") ?? undefined,
    competitionId: formData.get("competitionId") ?? undefined,
    periodsCount: formData.get("periodsCount") ?? undefined,
    periodMinutes: formData.get("periodMinutes") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "match:create", { teamId: parsed.data.teamId });

  if (!(await competitionBelongsToTeam(parsed.data.teamId, parsed.data.competitionId))) {
    return { fieldErrors: { competitionId: [UNKNOWN_COMPETITION_FR] } };
  }

  const [created] = await db
    .insert(matches)
    .values({
      teamId: parsed.data.teamId,
      kickoffAt: parsed.data.kickoffAt,
      opponentName: parsed.data.opponentName,
      isHome: parsed.data.isHome,
      venue: parsed.data.venue,
      competitionId: parsed.data.competitionId,
      periodsCount: parsed.data.periodsCount,
      periodMinutes: parsed.data.periodMinutes,
      createdBy: actor.userId,
    })
    .returning({ id: matches.id });

  revalidateCalendar(created.id);
  // Outside any try/catch: `redirect` works by throwing (`docs/NEXTJS16.md` §5).
  redirect(`/match/${created.id}`);
}

export async function updateMatch(_prev: FormState, formData: FormData): Promise<FormState> {
  const actor = await requireActor();

  const parsed = updateMatchSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    opponentName: formData.get("opponentName"),
    kickoffAt: formData.get("kickoffAt"),
    isHome: formData.get("isHome") ?? undefined,
    venue: formData.get("venue") ?? undefined,
    competitionId: formData.get("competitionId") ?? undefined,
    periodsCount: formData.get("periodsCount") ?? undefined,
    periodMinutes: formData.get("periodMinutes") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "match:update", { teamId: parsed.data.teamId });

  if (!(await competitionBelongsToTeam(parsed.data.teamId, parsed.data.competitionId))) {
    return { fieldErrors: { competitionId: [UNKNOWN_COMPETITION_FR] } };
  }

  const updated = await db
    .update(matches)
    .set({
      kickoffAt: parsed.data.kickoffAt,
      opponentName: parsed.data.opponentName,
      isHome: parsed.data.isHome,
      venue: parsed.data.venue,
      competitionId: parsed.data.competitionId,
      periodsCount: parsed.data.periodsCount,
      periodMinutes: parsed.data.periodMinutes,
    })
    .where(and(eq(matches.id, parsed.data.matchId), eq(matches.teamId, parsed.data.teamId)))
    .returning({ id: matches.id });

  if (updated.length === 0) return { error: "Ce match n’existe pas dans cette équipe." };

  revalidateCalendar(parsed.data.matchId);
  redirect(`/match/${parsed.data.matchId}`);
}

/**
 * Deletes a match that was never played.
 *
 * A match with events in its log is **never** deleted: `match_events` is append-only and holds
 * the only record of what happened (decision 003), and a cascade would erase it. A mistake on a
 * played match is corrected by amending it (M7), not by dropping the row.
 */
export async function deleteMatch(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = matchTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
  });
  if (!parsed.success) return;

  assertCan(actor, "match:delete", { teamId: parsed.data.teamId });

  const [{ count } = { count: "0" }] = await db
    .select({ count: sql<string>`count(*)` })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, parsed.data.matchId));

  if (Number(count) > 0) {
    // Nothing to report through: the UI only offers the button on a match with an empty log.
    return;
  }

  await db
    .delete(matches)
    .where(and(eq(matches.id, parsed.data.matchId), eq(matches.teamId, parsed.data.teamId)));

  revalidateCalendar();
  redirect("/calendrier");
}

/* -------------------------------------------------------------------------- */
/* Declaring a match over, and taking it back                                 */
/* -------------------------------------------------------------------------- */

/**
 * Everything a change of `status` is seen from. `saisie` is in the list because the entry screen
 * decides between « pas encore eu lieu » and the form on exactly this column (decision 121).
 */
function revalidateMatchStatus(matchId: string): void {
  revalidateCalendar(matchId);
  revalidatePath(`/match/${matchId}/saisie`);
  revalidatePath(`/match/${matchId}/recap`);
}

/**
 * « Ce match est joué » — the coach's word, with no log to back it up.
 *
 * Why this exists: `finalizeMatch` is the only other writer of `status: "finished"`, and it refuses
 * unless the log already holds a `FINAL_WHISTLE`, which only game mode appends. A match played three
 * weeks ago without the phone was therefore unreachable — the retro-entry card on the match page is
 * gated on `finished`, so the coach had to run game mode for an afternoon that was already over to
 * unlock the screen for typing it up. Decision 121.
 *
 * **It appends no event.** A lone `FINAL_WHISTLE` would be the obvious mechanism and it is the wrong
 * one: `getMatchScores` counts `match_events` rows, so one row turns `null` into `{0, 0}` and the
 * calendar starts printing « 0 – 0 » for a match nobody recorded — which is what decision 013 exists
 * to prevent — and `submitRetroMatch` would then refuse the whole-match form with « ce match a déjà
 * un déroulé ». Setting the column and leaving the log empty is the seed's J6 state, which every
 * screen already renders truthfully: « ? – ? » on the recap, `unrecordedMatches` in the season.
 *
 * Nothing is frozen into `match_player_stats` either. There is no whistle, so there is nothing to
 * freeze; `amendMatchEvents` does it when the sheet is finally typed up, because it re-freezes any
 * match whose status is already `finished`.
 *
 * **Empty log only.** A match that has one is `live` or `finished` already, and a `live` one has a
 * correct way to end: game mode's own final whistle, which derives the minute from the reducer. Only
 * the button is hidden in that case, so, like `deleteMatch`, this returns silently rather than
 * reporting a state the UI never offers.
 *
 * No chronology check at all — a match dated next Sunday can be declared over today. That is the
 * literal request, and `isFinishedEvent` in `lib/calendar/timeline.ts` is what keeps the calendar
 * honest about it.
 */
export async function finishMatch(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = matchTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
  });
  if (!parsed.success) return;

  /*
   * `match:amend`, not `match:operate`: coach-only, and deliberately not delegable. Running game
   * mode may be handed to somebody else for one afternoon (decision 004); deciding that a match
   * happened, and then writing what happened in it, is the coach's own — the same line
   * `lib/retro/actions.ts` draws for the screen this button leads to.
   */
  assertCan(actor, "match:amend", { teamId: parsed.data.teamId });

  // All rows, voided ones included — `hasMatchEvents` is stricter than `score === null`, which
  // ignores voided events and would call a fully-corrected match empty.
  if (await hasMatchEvents(parsed.data.matchId)) return;

  const updated = await db
    .update(matches)
    .set({ status: "finished" })
    .where(and(eq(matches.id, parsed.data.matchId), eq(matches.teamId, parsed.data.teamId)))
    .returning({ id: matches.id });

  if (updated.length === 0) return;

  revalidateMatchStatus(parsed.data.matchId);

  // One of two literal paths, never a form value: « Saisir le match » finishes and lands on the
  // form in one tap, « Marquer comme terminé » stays where it is.
  if (formData.get("then") === "saisie") redirect(`/match/${parsed.data.matchId}/saisie`);
}

/**
 * « Rouvrir le match » — the undo for the button above.
 *
 * Only while the log is empty, which is the whole of its safety: there is nothing to contradict.
 * Once a match has a déroulé, putting it back to `scheduled` would mean voiding events to stay
 * consistent, and that is a different and much bigger feature than a mis-tap needs.
 *
 * It goes back to `scheduled` rather than to whatever the status was, because the only status a
 * match with an empty log can have come from is `scheduled`.
 */
export async function reopenMatch(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = matchTargetSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
  });
  if (!parsed.success) return;

  assertCan(actor, "match:amend", { teamId: parsed.data.teamId });

  if (await hasMatchEvents(parsed.data.matchId)) return;

  await db
    .update(matches)
    .set({ status: "scheduled" })
    .where(and(eq(matches.id, parsed.data.matchId), eq(matches.teamId, parsed.data.teamId)));

  revalidateMatchStatus(parsed.data.matchId);
}

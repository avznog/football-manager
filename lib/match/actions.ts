"use server";

/**
 * Match CRUD and availability declaration.
 *
 * Every mutation starts with `assertCan(...)` (`CLAUDE.md`, invariant 4), and takes its `teamId`
 * from the submitted form rather than from the active-team cookie — then checks it. A forged
 * cookie must not widen anybody's reach.
 *
 * Creating and editing a match is a coach action. Declaring availability is self-scoped: a coach
 * may not answer on a player's behalf (`docs/DATA_MODEL.md`).
 */

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { matchAvailability, matchEvents, matches } from "@/db/schema";
import { assertCan, membershipIn } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState, type FormState } from "@/lib/auth/validation";
import {
  createMatchSchema,
  matchAvailabilitySchema,
  matchTargetSchema,
  updateMatchSchema,
} from "./validation";

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
    competition: formData.get("competition") ?? undefined,
    periodsCount: formData.get("periodsCount") ?? undefined,
    periodMinutes: formData.get("periodMinutes") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "match:create", { teamId: parsed.data.teamId });

  const [created] = await db
    .insert(matches)
    .values({
      teamId: parsed.data.teamId,
      kickoffAt: parsed.data.kickoffAt,
      opponentName: parsed.data.opponentName,
      isHome: parsed.data.isHome,
      venue: parsed.data.venue,
      competition: parsed.data.competition,
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
    competition: formData.get("competition") ?? undefined,
    periodsCount: formData.get("periodsCount") ?? undefined,
    periodMinutes: formData.get("periodMinutes") ?? undefined,
  });
  if (!parsed.success) return toFormState(parsed.error);

  assertCan(actor, "match:update", { teamId: parsed.data.teamId });

  const updated = await db
    .update(matches)
    .set({
      kickoffAt: parsed.data.kickoffAt,
      opponentName: parsed.data.opponentName,
      isHome: parsed.data.isHome,
      venue: parsed.data.venue,
      competition: parsed.data.competition,
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
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

/**
 * « Je suis dispo / pas dispo / peut-être » for a match.
 *
 * Self-scoped: `can()` resolves the target to the actor's own membership, so there is no way to
 * answer for somebody else. Returns `void` and revalidates, which is what lets the control work
 * as a plain form with JavaScript disabled.
 *
 * Answers are frozen once the match leaves `scheduled`: from the moment game mode starts, the
 * match sheet is what counts, and a late "pas dispo" would only muddy it.
 */
export async function setMatchAvailability(formData: FormData): Promise<void> {
  const actor = await requireActor();

  const parsed = matchAvailabilitySchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    status: formData.get("status"),
    note: formData.get("note") ?? undefined,
  });
  if (!parsed.success) return;

  assertCan(actor, "availability:declare", { teamId: parsed.data.teamId });

  // A super admin who is not a member of the team has nothing of their own to declare.
  const membership = membershipIn(actor, parsed.data.teamId);
  if (!membership) return;

  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, parsed.data.matchId), eq(matches.teamId, parsed.data.teamId)),
    columns: { id: true, status: true },
  });
  if (!match || match.status !== "scheduled") return;

  await db
    .insert(matchAvailability)
    .values({
      matchId: parsed.data.matchId,
      teamMemberId: membership.membershipId,
      status: parsed.data.status,
      note: parsed.data.note,
    })
    .onConflictDoUpdate({
      target: [matchAvailability.matchId, matchAvailability.teamMemberId],
      set: {
        status: parsed.data.status,
        note: parsed.data.note,
        updatedAt: new Date(),
      },
    });

  revalidateCalendar(parsed.data.matchId);
}

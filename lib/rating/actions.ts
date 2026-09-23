"use server";

/**
 * Submitting player ratings.
 *
 * Same contract as every other mutation in the repository: `assertCan()` first (invariant 4), the
 * `teamId` taken from the submitted form and then verified against the actor's membership, Zod for
 * everything, `revalidatePath` at the end. A forged hidden field must not widen anybody's reach.
 *
 * Four rules are enforced here, in this order, because each one depends on the previous:
 *
 * 1. `can(actor, "rating:submit")` — a self-scoped action: a coach cannot rate on a player's behalf.
 * 2. The match belongs to the team named in the form, and it is **finished**.
 * 3. The rating **window is open**: the next kick-off has not happened (decision 007).
 * 4. The actor is on the **match sheet** as a starter or a substitute, and so is everybody he rates.
 *    Ids that are not on the sheet are dropped rather than trusted.
 *
 * ## A note, once given, is final
 *
 * Inserts use `onConflictDoNothing`: there is no `UPDATE` path. Two reasons, and they reinforce each
 * other. It makes the flow **safe to retry** — a phone on a patchy connection can resubmit the same
 * set without changing anything. And it closes the obvious hole in the hidden-until-submitted rule:
 * if a note could be edited, a player could rate everybody 5, read the real averages, and then go
 * back and adjust. The UI says so plainly (« une note est définitive ») rather than letting someone
 * discover it by trying.
 *
 * Partial sets are allowed and expected: you rate four mates in the car, three more at home. Only a
 * *complete* set unlocks the results.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { matches, ratings } from "@/db/schema";
import { assertCan, membershipIn } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState } from "@/lib/auth/validation";
import { getMatchSheet, getRatingWindow } from "./queries";
import { isOnRateableSheet, rateableMemberIds, ratingProgress } from "./progress";
import { readRatingEntries, submitRatingsSchema } from "./validation";

export type SubmitRatingsState =
  | undefined
  | {
      error?: string;
      fieldErrors?: Record<string, string[]>;
      /** Notes actually written by this submit — a repeat submit writes none. */
      saved?: number;
      /** Notes already on file, left untouched. */
      unchanged?: number;
    };

function revalidateRatings(matchId: string): void {
  revalidatePath(`/match/${matchId}`);
  revalidatePath(`/match/${matchId}/notation`);
  revalidatePath(`/match/${matchId}/recap`);
  // The season's « meilleure moyenne » moves with every note.
  revalidatePath("/stats");
}

export async function submitRatings(
  _prev: SubmitRatingsState,
  formData: FormData,
): Promise<SubmitRatingsState> {
  const actor = await requireActor();

  const parsed = submitRatingsSchema.safeParse({
    teamId: formData.get("teamId"),
    matchId: formData.get("matchId"),
    entries: readRatingEntries(formData.entries()),
  });
  // `toFormState` keys its messages by Zod path — here that is `entries.3.score`, which no field in
  // the form is called, so the flow would have nothing to render and the player would see silence.
  // The scores come from eleven radio groups: anything out of 0–10 means the request was mangled or
  // forged, and one plain sentence is the honest answer.
  if (!parsed.success) {
    return {
      ...toFormState(parsed.error),
      error: parsed.error.issues[0]?.message ?? "Ces notes n’ont pas pu être enregistrées.",
    };
  }

  const { teamId, matchId, entries } = parsed.data;

  assertCan(actor, "rating:submit", { teamId });

  // A super admin who is not a member of this team has no note of his own to give.
  const membership = membershipIn(actor, teamId);
  if (!membership) return { error: "Tu ne fais pas partie de cette équipe." };

  const match = await db.query.matches.findFirst({
    where: and(eq(matches.id, matchId), eq(matches.teamId, teamId)),
    columns: { id: true, teamId: true, kickoffAt: true, status: true },
  });
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };

  const window = await getRatingWindow(match);

  if (window.state === "not-yet") {
    return { error: "La notation ouvrira au coup de sifflet final." };
  }
  if (window.state === "closed") {
    return { error: "La notation est fermée : le match suivant a déjà commencé." };
  }

  const sheet = await getMatchSheet(match.id);
  if (!isOnRateableSheet(sheet, membership.membershipId)) {
    return { error: "Seuls les joueurs de la feuille de match peuvent noter." };
  }

  // Only people who were on that sheet can be rated — a crafted id is simply dropped.
  const allowed = new Set(rateableMemberIds(sheet));
  const accepted = entries.filter((entry) => allowed.has(entry.ratedMemberId));
  if (accepted.length === 0) {
    return { error: "Ces notes ne concernent personne de la feuille de match." };
  }

  const inserted = await db
    .insert(ratings)
    .values(
      accepted.map((entry) => ({
        matchId: match.id,
        raterMemberId: membership.membershipId,
        ratedMemberId: entry.ratedMemberId,
        score: entry.score,
        comment: entry.comment,
      })),
    )
    // A note is final: a second submit for the same player changes nothing (see the header).
    .onConflictDoNothing({
      target: [ratings.matchId, ratings.raterMemberId, ratings.ratedMemberId],
    })
    .returning({ ratedMemberId: ratings.ratedMemberId });

  revalidateRatings(match.id);

  // Has he finished? Only then is he allowed to see anybody else's notes, so only then is there any
  // point sending him to the recap.
  const submitted = await db
    .select({ ratedMemberId: ratings.ratedMemberId })
    .from(ratings)
    .where(
      and(eq(ratings.matchId, match.id), eq(ratings.raterMemberId, membership.membershipId)),
    );

  const progress = ratingProgress({
    requiredIds: rateableMemberIds(sheet),
    submittedIds: submitted.map((row) => row.ratedMemberId),
  });

  if (progress.complete) {
    // Outside any try/catch: `redirect` works by throwing (`docs/NEXTJS16.md` §5). The payoff for
    // finishing is the recap, with the averages and the man of the match now visible.
    redirect(`/match/${match.id}/recap`);
  }

  return {
    saved: inserted.length,
    unchanged: accepted.length - inserted.length,
  };
}

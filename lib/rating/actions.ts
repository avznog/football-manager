"use server";

/**
 * Submitting player ratings, and releasing a match's means.
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
 * 4. The actor **played** — `minutes > 0` in the log — and so did everybody he rates, himself
 *    excepted. Ids that did not play are dropped rather than trusted.
 *
 * Rule 4 is where decision 137 changed this file. It used to read the match sheet, which the form
 * itself was rendered from; it now reads the reduced log, which no form can influence. The set of
 * legal targets is exactly what a crafted post would try to widen — a supporter rating the squad, or
 * a player slipping himself into his own list — so it is re-derived here and never taken from the
 * request. `ratings_no_self` is the same rule stated in the database, for the same reason.
 *
 * ## A note, once given, is final
 *
 * Inserts use `onConflictDoNothing`: there is no `UPDATE` path. It makes the flow **safe to retry** —
 * a phone on a patchy connection can resubmit the same set without changing anything — and it closes
 * the hole a settled mean would otherwise have: if a note could be edited, a player could wait for
 * the mean to come out and then adjust his own contribution to it. The UI says so plainly (« une note
 * est définitive ») rather than letting somebody discover it by trying.
 */

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { db } from "@/db/client";
import { matches, ratings } from "@/db/schema";
import { assertCan, membershipIn } from "@/lib/auth/can";
import { requireActor } from "@/lib/auth/dal";
import { toFormState } from "@/lib/auth/validation";
import { getMatch } from "@/lib/match/queries";
import { hasPlayed, ratingProgress, ratingTargetsFor } from "./progress";
import { getRatingWindow, playedEntriesOf } from "./queries";
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
  // the form is called, so the screen would have nothing to render and the player would see silence.
  // The scores come from a row of sliders: anything off the scale or off the half-step means the
  // request was mangled or forged, and one plain sentence is the honest answer.
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

  const match = await getMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };

  const window = await getRatingWindow(match);

  if (window.state === "not-yet") {
    return { error: "La notation ouvrira au coup de sifflet final." };
  }
  if (window.state === "closed") {
    return { error: "La notation est fermée : le match suivant a déjà commencé." };
  }

  const played = await playedEntriesOf(match);
  if (!hasPlayed(played, membership.membershipId)) {
    return { error: "Seuls les joueurs qui ont joué ce match peuvent noter." };
  }

  /*
   * Who he may rate: everybody who played, minus himself. Derived from the log, not from the form —
   * and `ratingTargetsFor` is the same function the screen built its list from, so a legitimate
   * submission can never be refused here while a crafted one is.
   */
  const allowed = new Set(ratingTargetsFor(played, membership.membershipId));
  const accepted = entries.filter((entry) => allowed.has(entry.ratedMemberId));
  if (accepted.length === 0) {
    return { error: "Ces notes ne concernent personne qui a joué ce match." };
  }

  const inserted = await db
    .insert(ratings)
    .values(
      accepted.map((entry) => ({
        matchId: match.id,
        raterMemberId: membership.membershipId,
        ratedMemberId: entry.ratedMemberId,
        score: entry.score,
      })),
    )
    // A note is final: a second submit for the same player changes nothing (see the header).
    .onConflictDoNothing({
      target: [ratings.matchId, ratings.raterMemberId, ratings.ratedMemberId],
    })
    .returning({ ratedMemberId: ratings.ratedMemberId });

  revalidateRatings(match.id);

  // Has he finished? His set completing may be what publishes the whole match's means, so there is
  // something new on the recap for him either way.
  const submitted = await db
    .select({ ratedMemberId: ratings.ratedMemberId })
    .from(ratings)
    .where(
      and(eq(ratings.matchId, match.id), eq(ratings.raterMemberId, membership.membershipId)),
    );

  const progress = ratingProgress({
    requiredIds: [...allowed],
    submittedIds: submitted.map((row) => row.ratedMemberId),
  });

  if (progress.complete) {
    // Outside any try/catch: `redirect` works by throwing (`docs/NEXTJS16.md` §5).
    redirect(`/match/${match.id}/recap`);
  }

  return {
    saved: inserted.length,
    unchanged: accepted.length - inserted.length,
  };
}

/* -------------------------------------------------------------------------- */
/* Releasing the means                                                        */
/* -------------------------------------------------------------------------- */

export type PublishRatingsState = undefined | { error?: string; published?: true };

/**
 * Release a match's means with notes still owed — the coach's escape hatch.
 *
 * It exists because the alternative backstop does not work: `ratingWindow` never closes for the last
 * match of a season (there is no next kick-off), and that is the one match a team most wants its
 * notes for. So somebody has to be able to say « c'est bon, on n'attend plus ».
 *
 * `rating:publish` is a **coach** action, not a self-scoped one: `rating:submit` is false for a coach
 * who did not play, and he is exactly the person who has to be able to do this.
 *
 * Idempotent, and deliberately so — the first timestamp is the one kept. Two taps on a slow
 * connection must not move the moment the notes came out, and `ratingsPublishedAt` is read as « when
 * this happened », not as « the last time somebody pressed the button ».
 */
export async function publishRatings(
  _prev: PublishRatingsState,
  formData: FormData,
): Promise<PublishRatingsState> {
  const actor = await requireActor();

  const teamId = formData.get("teamId");
  const matchId = formData.get("matchId");
  if (typeof teamId !== "string" || typeof matchId !== "string") {
    return { error: "Ce formulaire est invalide, recharge la page." };
  }

  assertCan(actor, "rating:publish", { teamId });

  const match = await getMatch(teamId, matchId);
  if (!match) return { error: "Ce match n’existe pas dans cette équipe." };
  if (match.status !== "finished") {
    return { error: "Les notes d’un match pas encore terminé n’existent pas." };
  }
  if (match.ratingsPublishedAt !== null) return { published: true };

  await db
    .update(matches)
    .set({ ratingsPublishedAt: new Date() })
    // Scoped by team as well as by id: an id from another team is not this coach's to publish.
    .where(and(eq(matches.id, match.id), eq(matches.teamId, teamId)));

  revalidateRatings(match.id);
  return { published: true };
}

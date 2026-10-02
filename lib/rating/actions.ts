"use server";

/**
 * Submitting player ratings, and showing or hiding a match's means.
 *
 * Same contract as every other mutation in the repository: `assertCan()` first (invariant 4), the
 * `teamId` taken from the submitted form and then verified against the actor's membership, Zod for
 * everything, `revalidatePath` at the end. A forged hidden field must not widen anybody's reach.
 *
 * Three rules are enforced here, in this order, because each one depends on the previous:
 *
 * 1. `can(actor, "rating:submit")` — a self-scoped action: a coach cannot rate on a player's behalf.
 * 2. The match belongs to the team named in the form, and it is **finished**. That is the only timing
 *    rule left: you cannot rate a match that has not been played, and nothing ever closes afterwards.
 * 3. Everybody he rates **played** — `minutes > 0` in the log — himself excepted. Ids that did not play
 *    are dropped rather than trusted.
 *
 * **Two refusals that used to be here are gone, both by decision 139.** « La notation est fermée : les
 * moyennes sont sorties » went with the window: the means being out no longer stops anybody, so a note
 * can now arrive after the squad has read the figure it moves — which was stated as the cost of the
 * change and accepted. And « seuls les joueurs qui ont joué peuvent noter » went with the rule: a
 * supporter on the touchline watched the same hour and his note counts the same.
 *
 * Rule 3 is where decision 137 changed this file, and it is the one that stayed. It used to read the
 * match sheet, which the form itself was rendered from; it reads the reduced log, which no form can
 * influence. The set of legal targets is exactly what a crafted post would try to widen — somebody
 * rating a man who never came on, or slipping himself into his own list — so it is re-derived here and
 * never taken from the request. `ratings_no_self` is the same rule stated in the database, for the same
 * reason.
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
import { getMatch, type MatchRow } from "@/lib/match/queries";
import { ratingProgress, ratingTargetsFor } from "./progress";
import { playedEntriesOf } from "./queries";
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

  // The whole of the timing rule, and it is about the match rather than about the clock. A match
  // abandoned in `live` is not rateable until somebody closes it, which is correct: the recap it would
  // produce is not a result yet.
  if (match.status !== "finished") {
    return { error: "La notation ouvrira au coup de sifflet final." };
  }

  const played = await playedEntriesOf(match);

  /*
   * Who he may rate: everybody who played, minus himself — whether or not *he* played (decision 139).
   * Derived from the log, not from the form, and `ratingTargetsFor` is the same function the screen
   * built its list from, so a legitimate submission can never be refused here while a crafted one is.
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

  // Has he finished? Nothing is published by his finishing any more (decision 139) — the recap is
  // simply where a man who has nothing left to send belongs, and it is where he finds out whether the
  // coach has shown the means.
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
/* Showing the means, and hiding them again                                   */
/* -------------------------------------------------------------------------- */

export type PublishRatingsState = undefined | { error?: string; published?: boolean };

/**
 * Show a match's means to the team. **The only thing that ever does** (decision 139).
 *
 * It used to be an escape hatch: the squad finishing its notes published a match by itself, and this
 * covered the straggler who never would. The owner turned that round — the means come out when he says
 * so, per match, and nothing else publishes anything. So this is no longer a hatch but *the* door, and
 * what used to be its weight has moved: it no longer ends the notation (nothing does), and it no longer
 * freezes a figure, because `hideRatings` below puts it back.
 *
 * `rating:publish` is a **coach** action, not a self-scoped one: `rating:submit` is true for every
 * member, and deciding what the whole team reads is not a thing a member does for himself.
 *
 * Idempotent, and deliberately so — the first timestamp is the one kept. Two taps on a slow connection
 * must not move the moment the notes came out, and `ratingsPublishedAt` is read as « when this
 * happened », not as « the last time somebody pressed the button ». A coach who hides and shows again
 * does move it, which is right: that is a new decision, not a repeat of the old one.
 */
export async function publishRatings(
  _prev: PublishRatingsState,
  formData: FormData,
): Promise<PublishRatingsState> {
  const match = await coachsMatch(formData);
  if ("error" in match) return match;
  if (match.row.ratingsPublishedAt !== null) return { published: true };

  await setPublishedAt(match.row.id, match.teamId, new Date());
  return { published: true };
}

/**
 * Hide a match's means again, putting every figure back behind `getRatingResults`'s early return.
 *
 * The owner asked for a switch that goes both ways, with the cost stated and accepted: **a mean the
 * squad has already read can vanish.** Nothing softens that and nothing should pretend to — there is no
 * audit trail of what was visible when, and a player who screenshotted his 4,2 keeps it. What the
 * reversibility buys is the ability to undo a tap, which on a per-match switch somebody will need.
 *
 * Writing `null` is the whole mutation: null *is* the hidden state (`lib/rating/published.ts`), so this
 * is not a second flag that could disagree with the first. Idempotent for the same reason as its
 * sibling — hiding an already-hidden match changes nothing and is not an error.
 */
export async function hideRatings(
  _prev: PublishRatingsState,
  formData: FormData,
): Promise<PublishRatingsState> {
  const match = await coachsMatch(formData);
  if ("error" in match) return match;
  if (match.row.ratingsPublishedAt === null) return { published: false };

  await setPublishedAt(match.row.id, match.teamId, null);
  return { published: false };
}

/**
 * The checks both halves of the switch share: the form is well-formed, the actor may publish for this
 * team, and the match is a finished one of that team.
 *
 * One function rather than two copies because the two actions differ by a single value written, and a
 * permission check that exists twice is a permission check that can come to differ once.
 */
async function coachsMatch(
  formData: FormData,
): Promise<{ error: string } | { row: MatchRow; teamId: string }> {
  const actor = await requireActor();

  const teamId = formData.get("teamId");
  const matchId = formData.get("matchId");
  if (typeof teamId !== "string" || typeof matchId !== "string") {
    return { error: "Ce formulaire est invalide, recharge la page." };
  }

  assertCan(actor, "rating:publish", { teamId });

  const row = await getMatch(teamId, matchId);
  if (!row) return { error: "Ce match n’existe pas dans cette équipe." };
  if (row.status !== "finished") {
    return { error: "Les notes d’un match pas encore terminé n’existent pas." };
  }
  return { row, teamId };
}

async function setPublishedAt(matchId: string, teamId: string, at: Date | null): Promise<void> {
  await db
    .update(matches)
    .set({ ratingsPublishedAt: at })
    // Scoped by team as well as by id: an id from another team is not this coach's to touch.
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)));

  revalidateRatings(matchId);
}

/**
 * Whether a match's rating means are out, and what made them out.
 *
 * This is the whole of what used to be a gate. Decision 007 asked « has *this reader* earned the
 * right to see the notes », and decision 021 extended that question to every statistic in the app,
 * which is why `lib/stats/` carried per-viewer `visibleMatchIds` and the profile card had to explain
 * why a reader's average was short of two matches. Decision 137 replaces both with a question that
 * has **no viewer in it**: is this match's mean published? Every reader gets the same answer, and
 * therefore the same statistics.
 *
 * Pure. The enforcement is still in the query layer — `lib/rating/queries.ts` selects no individual
 * note for a reader who is not the coach, and no mean at all for an unpublished match — because the
 * rule being right in a module proves nothing about a screen that bypasses it (decision 097).
 *
 * ## Three clauses, and the one that cannot be relied on
 *
 * 1. **every set is in** — everybody who played has rated everybody else who played. This is the
 *    normal path and the only one that needs nobody to act;
 * 2. **the coach published** — `matches.ratingsPublishedAt`, the escape hatch for the straggler who
 *    never will;
 * 3. **the rating window closed** — the next kick-off has come, so the notes can no longer change.
 *
 * Clause 3 is the one to be careful about, and it is weaker than it looks: `ratingWindow` reports
 * `closesAtMs: null` when the calendar holds no later match, which reads as « open for ever ». So
 * the **last match of a season never closes its own window** — the one match a team most wants its
 * notes for. Clause 3 cannot be the backstop; clause 2 is, which is why the publish action exists
 * and why the recap offers it to the coach rather than hiding it in an admin screen.
 *
 * ## What this reverses, on purpose
 *
 * Decision 024 said the window closing must *not* release a match's notes, and
 * `lib/rating/progress.ts` used to restate it in a comment: « a player who never rates never sees
 * the ratings, for that match, for ever. That is deliberate. » It was deliberate, and it was the
 * nudge to take part. It is also a permanent punishment administered by a deadline the player may
 * never have seen, for a mean that says nothing about him as a rater — so decision 137 takes the
 * other side. The nudge survives in a smaller form: nothing is published while the squad still owes
 * notes, so the team waits on its stragglers rather than the stragglers losing something.
 */

import type { RatingWindowState } from "./window";

export type RatingsPublicationReason =
  /** Everybody who played has rated everybody else. The normal path. */
  | "every-set-in"
  /** The coach released them, with notes still owed. */
  | "coach-published"
  /** The next match has kicked off, so nothing can change any more. */
  | "window-closed"
  /** Notes are still owed, and nobody has overridden that. */
  | "pending";

export type RatingsPublication = {
  published: boolean;
  reason: RatingsPublicationReason;
  /** Who still owes at least one note, in the order given. Empty once every set is in. */
  owingRaterIds: readonly string[];
};

export type RatingsPublicationInput = {
  /**
   * Who was expected to rate: the members with `minutes > 0`. Not the match sheet — being named a
   * substitute and never coming on is the commonest fate in a seven-a-side squad, and it is neither
   * a performance to judge nor an opinion to collect.
   */
  expectedRaterIds: readonly string[];
  /** Of those, who has submitted a *complete* set: a note on every other player who played. */
  completeRaterIds: readonly string[];
  /** `matches.ratingsPublishedAt` as epoch ms, or null if the coach has not published. */
  publishedAtMs: number | null;
  windowState: RatingWindowState;
};

/**
 * The published predicate.
 *
 * When more than one clause holds, the reason reported is the one that explains the most: the squad
 * finishing its notes is a better thing to tell a reader than a deadline passing, even when both are
 * true. Order is « every set in », then the coach, then the window.
 *
 * **A match nobody played publishes vacuously** — there is no set outstanding, so there is nothing
 * to wait for. That is not the same as having a mean to show: a match nobody recorded (decision 013)
 * reaches here with no expected raters and no notes, and what stops it printing a figure is the
 * three-note floor downstream, not this function. Keeping the two separate is deliberate; a
 * predicate that answered « published » with « and also there is enough data » would be two rules in
 * one name, and the screens need them apart — « on attend encore des notes » and « pas assez de
 * notes » are different sentences and only one of them is anybody's fault.
 */
export function ratingsPublication(input: RatingsPublicationInput): RatingsPublication {
  const complete = new Set(input.completeRaterIds);
  const owingRaterIds = input.expectedRaterIds.filter((id) => !complete.has(id));

  if (owingRaterIds.length === 0) {
    return { published: true, reason: "every-set-in", owingRaterIds };
  }
  if (input.publishedAtMs !== null) {
    return { published: true, reason: "coach-published", owingRaterIds };
  }
  if (input.windowState === "closed") {
    return { published: true, reason: "window-closed", owingRaterIds };
  }
  return { published: false, reason: "pending", owingRaterIds };
}

/**
 * The mean of the notes a player was given, or null when there are none.
 *
 * Rounded to one decimal, because `score` is `numeric(3,1)` and a mean of halves can need more: four
 * notes of 7, 7, 7.5 and 8 average to 7.375, and the screen shows « 7,4 ». The rounding happens
 * **once, here**, so a figure on the profile and the same figure on the recap cannot disagree by a
 * tenth — which they would if one of them rounded on display and the other did not.
 */
export function meanOfNotes(scores: readonly number[]): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((total, score) => total + score, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

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
 * ## Two clauses, and why there is no third
 *
 * 1. **every set is in** — everybody who played has rated everybody else who played. This is the
 *    normal path and the only one that needs nobody to act;
 * 2. **the coach published** — `matches.ratingsPublishedAt`, the escape hatch for the straggler who
 *    never will.
 *
 * There used to be a third — « the rating window closed », the next kick-off having come. Decision 138
 * removed it, and the argument was already written here: it was weaker than it looked, because
 * `ratingWindow` reported `closesAtMs: null` when the calendar held no later match, so the **last
 * match of a season never closed its own window** — the one match a team most wants its notes for.
 * Clause 2 was the real backstop. Removing the clause also turns the dependency the other way round:
 * `ratingWindow` now asks *this* module whether the means are out, because publishing is what shuts
 * rating, and a module cannot be both above and below another one.
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
 *
 * Decision 138 goes one step further and removes the deadline itself: a man who has not rated a match
 * whose means are not out can still rate it, however long ago it was played. So publishing is no
 * longer only what releases the means — it is also what ends the rating, and this predicate is the
 * one place that decides both.
 */

export type RatingsPublicationReason =
  /** Everybody who played has rated everybody else. The normal path. */
  | "every-set-in"
  /** The coach released them, with notes still owed. */
  | "coach-published"
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
};

/**
 * The published predicate.
 *
 * When both clauses hold, the reason reported is the one that explains the most: the squad finishing
 * its notes is a better thing to tell a reader than the coach having pressed a button, and it is also
 * the one that leaves nobody out. Order is « every set in », then the coach.
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

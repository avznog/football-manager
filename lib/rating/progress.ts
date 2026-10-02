/**
 * Who is rated, whom one rater owes a note, and how far through he is.
 *
 * Pure. What it no longer holds is the *gate*: « has this reader earned the right to see the notes »
 * was decision 007's question and this module used to answer it. Decision 137 removed the question —
 * nobody reads an individual note but the coach — and decision 139 made the answer a single column the
 * coach writes. `lib/rating/published.ts` holds that; nothing here feeds it any more.
 *
 * ## Two sets, and they are no longer the same one
 *
 * This module used to answer « who may rate » and « who may be rated » with one list, and the two have
 * come apart (decision 139):
 *
 * - **who may be rated: the players with `minutes > 0`.** Unchanged since decision 137, and still read
 *   from the **log** rather than from the match sheet — the two differ in exactly the case that
 *   matters, a named substitute who sat out the whole hour. The sheet says he was there; the log says
 *   he did not play, and he has no performance to be judged on. That makes the rule a fact about
 *   `match_events` rather than about `match_squad`, so it cannot be a database constraint and cannot be
 *   read off the sheet the UI already has: it is derived from `match_player_stats.minutes` (frozen) or
 *   from the reducer's `PlayerMatchState` (live), and the Server Action re-derives it rather than
 *   trusting the form, because the set of legal targets is exactly what a crafted post would widen;
 * - **who may rate: anybody in the team.** Decision 007 asked for `starter` or `substitute`, decision
 *   137 for `minutes > 0`, and decision 139 for nobody in particular. A supporter on the touchline
 *   watched the same hour the players did and has an opinion worth as much; a member who was not even
 *   on the sheet may rate too. So there is no `hasPlayed` test in `ratingTargetsFor` any more, and
 *   `hasPlayed` below is left for what a screen *says* rather than for what it allows.
 *
 * **Nobody rates himself.** Decision 007 required it — a self-note was part of the full set and the
 * recap printed « tu t'es mis 8 ». Decision 137 drops it: the published figure is « the mean of the
 * notes the others gave him », and a man's own note has no place in that. `ratings_no_self` in the
 * schema is the half of this that a constraint can state, and it is also why a rater who played gets a
 * set one shorter than a supporter's.
 */

/** Who played, and so who rates and is rated. One row per member with minutes on the clock. */
export type PlayedEntry = {
  teamMemberId: string;
  minutes: number;
};

/**
 * Everybody who played, sorted so two callers always produce the same list.
 *
 * `minutes > 0` and not `>= 0`: the second would put every named substitute back in, which is the
 * whole distinction this function exists to draw.
 */
export function playedMemberIds(played: readonly PlayedEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of played) {
    if (entry.minutes > 0) ids.add(entry.teamMemberId);
  }
  return [...ids].sort();
}

/**
 * Whether this member played, and so is **rated**.
 *
 * It no longer decides whether he may rate: under decision 139 everybody may. It is kept because the
 * notation screen says a different thing to a man who was on the pitch than to one who watched, and
 * because a rater who played is in the rated set and so gets a list one name shorter than everybody
 * else's.
 */
export function hasPlayed(played: readonly PlayedEntry[], membershipId: string | null | undefined): boolean {
  if (!membershipId) return false;
  return played.some((entry) => entry.teamMemberId === membershipId && entry.minutes > 0);
}

/**
 * Whom one rater owes a note: everybody who played, **minus himself**.
 *
 * No test on the rater at all — decision 139: a supporter, a member who was not on the sheet, and the
 * coach all get the same list, and a player gets it minus his own name. An empty list therefore means
 * one thing only, « nobody played this match », which is a match the log is empty for (decision 013)
 * and never a statement about who is asking.
 */
export function ratingTargetsFor(
  played: readonly PlayedEntry[],
  raterMembershipId: string | null | undefined,
): string[] {
  return playedMemberIds(played).filter((id) => id !== raterMembershipId);
}

export type RatingProgress = {
  /** Everybody this rater owes a note. */
  requiredIds: readonly string[];
  /** Whom he has already rated, in `requiredIds` order. */
  submittedIds: readonly string[];
  /** Whom he still owes, in `requiredIds` order. */
  missingIds: readonly string[];
  requiredCount: number;
  submittedCount: number;
  /** He has rated everybody. Vacuously true when nobody is required. */
  complete: boolean;
  /** He has started but not finished. */
  partial: boolean;
};

/**
 * How far through his set a rater is.
 *
 * Notes already submitted that are *not* required — a teammate whose minutes were corrected to zero
 * by a retro amendment, say — do not count towards completion and are not reported as missing: the
 * set is defined by who played, not by what was submitted.
 */
export function ratingProgress(input: {
  requiredIds: readonly string[];
  submittedIds: readonly string[];
}): RatingProgress {
  const submitted = new Set(input.submittedIds);
  const requiredIds = [...input.requiredIds];
  const submittedIds = requiredIds.filter((id) => submitted.has(id));
  const missingIds = requiredIds.filter((id) => !submitted.has(id));

  return {
    requiredIds,
    submittedIds,
    missingIds,
    requiredCount: requiredIds.length,
    submittedCount: submittedIds.length,
    complete: missingIds.length === 0,
    partial: submittedIds.length > 0 && missingIds.length > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* What the rater is told about the man he is rating                          */
/* -------------------------------------------------------------------------- */

/**
 * « 42’ », or nothing at all.
 *
 * The card used to show « entré en jeu » to anybody listed as a substitute, which is a statement
 * about what happened deduced from what the coach *planned*; the log answers it instead. Under
 * decision 137 the list only holds players with minutes, so « non entré » has no one left to describe
 * — a man who did not play is not on the screen. `null` when there is no log to read: a finished
 * match nobody recorded (decision 013) has no minutes, and inventing « 0’ » for it is the same
 * invention as « 0 – 0 » for its score.
 */
export function playedLabelFr(minutes: number | null): string | null {
  if (minutes === null || minutes <= 0) return null;
  return `${minutes}’`;
}

/**
 * Who rates, whom they owe a note, and how far through they are.
 *
 * Pure. What it no longer holds is the *gate*: « has this reader earned the right to see the notes »
 * was decision 007's question and this module used to answer it. Decision 137 removed the question —
 * nobody reads an individual note but the coach, and the mean is published or it is not, for
 * everybody at once. `lib/rating/published.ts` holds that, and `ratingProgress` below feeds it: « has
 * every set come in » is the sum of these.
 *
 * ## Who rates, and the sheet's demotion
 *
 * Decision 007 read the **match sheet**: `starter` or `substitute` could rate and be rated, a
 * `supporter` could not. Decision 137 reads the **log** instead — `minutes > 0`. The two differ in
 * exactly the case that matters: a named substitute who sat out the whole hour. The sheet says he was
 * there; the log says he did not play. He has no performance to be judged on, and he watched the same
 * match as the supporters who are not asked either.
 *
 * That makes the rule a fact about `match_events` rather than about `match_squad`, so it cannot be a
 * database constraint and cannot be read off the sheet the UI already has. It is derived from
 * `match_player_stats.minutes` (frozen) or from the reducer's `PlayerMatchState` (live), and the
 * Server Action re-derives it rather than trusting the form: the set of legal targets is exactly what
 * a crafted post would try to widen.
 *
 * **Nobody rates himself.** Decision 007 required it — a self-note was part of the full set and the
 * recap printed « tu t'es mis 8 ». Decision 137 drops it: the published figure is « the mean of the
 * notes the others gave him », and a man's own note has no place in that. `ratings_no_self` in the
 * schema is the half of this that a constraint can state.
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

/** Whether this member played, and so may rate and be rated. */
export function hasPlayed(played: readonly PlayedEntry[], membershipId: string | null | undefined): boolean {
  if (!membershipId) return false;
  return played.some((entry) => entry.teamMemberId === membershipId && entry.minutes > 0);
}

/**
 * Whom one rater owes a note: everybody who played, **minus himself**.
 *
 * Returns an empty list for a member who did not play, rather than throwing — a supporter opening the
 * notation URL by hand is a reader, not an error, and the screen says so.
 */
export function ratingTargetsFor(
  played: readonly PlayedEntry[],
  raterMembershipId: string | null | undefined,
): string[] {
  if (!hasPlayed(played, raterMembershipId)) return [];
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

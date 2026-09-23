/**
 * Who may rate, whom they must rate, and — the part that matters — whether they have earned the
 * right to see anybody else's notes.
 *
 * Pure. This module holds the *rule*; `queries.ts` holds its enforcement, and the enforcement is in
 * the query, not in the UI: a player who has not finished rating must not be able to obtain a
 * single one of his teammates' scores by any route, hidden field or crafted URL included.
 *
 * ## The rules
 *
 * From decision 007 and `docs/DATA_MODEL.md` § `ratings`:
 *
 * - Only members on the **match sheet** as `starter` or `substitute` may rate. A `supporter` was
 *   there but did not play; a coach who did not play does not rate either.
 * - A rater rates **everybody on that sheet, himself included**. That is the "full set".
 * - A rater sees **nothing** until his own set is complete — it prevents anchoring ("he put 4, I'll
 *   put 4") and copying.
 *
 * ## What the documents did not settle, and what this module decides
 *
 * **Somebody who cannot rate sees the results straight away.** The hidden-until-submitted rule
 * exists to stop a *rater* being influenced; a coach who did not play, a supporter, a super admin
 * looking in has no set to submit and nothing to be influenced about. If they were gated too, the
 * coach — the person the recap is mostly for — could never see the ratings of his own team at all,
 * which cannot be the intent of a screen the plan calls « le moment de fête ».
 *
 * The consequence to be aware of: a player who never rates never sees the ratings, for that match,
 * for ever. That is deliberate. The window closing (`window.ts`) does *not* unlock them; the nudge
 * to take part is the whole mechanism, and an unlock at the next kick-off would reduce it to
 * "wait two days and read them anyway".
 */

import type { SquadRole } from "@/db/schema";

/** The roles that were on the pitch or on the bench — the ones decision 007 lets rate. */
export const RATEABLE_SQUAD_ROLES: readonly SquadRole[] = ["starter", "substitute"];

export function isRateableRole(role: SquadRole | string | null | undefined): boolean {
  return role === "starter" || role === "substitute";
}

/** A row of `match_squad`, reduced to what this module needs. */
export type SheetEntry = {
  teamMemberId: string;
  role: SquadRole;
};

/**
 * The full set: every member of the sheet who played or was on the bench, sorted so two callers
 * always produce the same list. This is both "who may rate" and "who must be rated" — they are the
 * same people (decision 007).
 */
export function rateableMemberIds(sheet: readonly SheetEntry[]): string[] {
  const ids = new Set<string>();
  for (const entry of sheet) {
    if (isRateableRole(entry.role)) ids.add(entry.teamMemberId);
  }
  return [...ids].sort();
}

/** Whether this membership is allowed to rate this match, sheet-wise. */
export function isOnRateableSheet(
  sheet: readonly SheetEntry[],
  membershipId: string | null | undefined,
): boolean {
  if (!membershipId) return false;
  return sheet.some((entry) => entry.teamMemberId === membershipId && isRateableRole(entry.role));
}

export type RatingProgress = {
  /** Everybody this rater owes a note. */
  requiredIds: readonly string[];
  /** Whom he has already rated, in `requiredIds` order. */
  submittedIds: readonly string[];
  /** Whom he still owes, in `requiredIds` order — what the flow shows next. */
  missingIds: readonly string[];
  requiredCount: number;
  submittedCount: number;
  /** He has rated everybody. Vacuously true when nobody is required. */
  complete: boolean;
  /** He has started but not finished — the state the UI calls « note commencée ». */
  partial: boolean;
};

/**
 * How far through his set a rater is.
 *
 * Notes already submitted that are *not* required (a teammate removed from the sheet after the
 * fact, say) do not count towards completion and are not reported as missing: the set is defined by
 * the sheet as it stands, not by what was submitted.
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

export type RatingVisibilityReason =
  /** Not a rater for this match: nothing to unlock, so nothing is hidden. */
  | "not-a-rater"
  /** Full set submitted — the results are his to read. */
  | "complete"
  /** He owes notes: hidden, and this is the only reason that hides anything. */
  | "incomplete";

export type RatingVisibility = {
  visible: boolean;
  reason: RatingVisibilityReason;
};

/**
 * **The gate.** Whether this viewer may be shown other people's ratings for this match.
 *
 * `mayRate` means "is on the sheet as starter/substitute *and* `can()` allows him to submit" — the
 * permission check stays in `can()` (invariant 4); this function only combines the two facts.
 */
export function ratingVisibility(input: {
  mayRate: boolean;
  progress: Pick<RatingProgress, "complete">;
}): RatingVisibility {
  if (!input.mayRate) return { visible: true, reason: "not-a-rater" };
  if (input.progress.complete) return { visible: true, reason: "complete" };
  return { visible: false, reason: "incomplete" };
}

/* -------------------------------------------------------------------------- */
/* What the rater is told about the man he is rating                          */
/* -------------------------------------------------------------------------- */

/**
 * « 42’ », « non entré », or nothing at all.
 *
 * The card used to show « entré en jeu » to anybody listed as a substitute, which is a statement
 * about what happened deduced from what the coach *planned*. In an amateur seven-a-side squad the
 * commonest fate of a named substitute is to stay on the bench for the whole hour, and he was being
 * told — and his team-mates with him, as they rated him — that he had come on.
 *
 * So the sheet does not answer this: the log does, through `PlayerMatchState.minutes`. Pass `null`
 * when there is no log to read — a finished match nobody recorded (decision 013) — because « non
 * entré » about a match whose events do not exist is the same invention as « 0 – 0 » for its score.
 */
export function playedLabelFr(minutes: number | null): string | null {
  if (minutes === null) return null;
  return minutes > 0 ? `${minutes}’` : "non entré";
}

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
 * - **who may rate: the match sheet** — every starter, every substitute and every supporter of *that*
 *   match (decision 159, narrowing 139). Decision 007 asked for `starter` or `substitute`, decision
 *   137 for `minutes > 0`, decision 139 for any member, and the owner's brief settles it: « peuvent
 *   noter : tous les titulaires, tous les remplaçants, et tous les supporters. Les joueurs non
 *   sélectionnés ne peuvent pas noter. » A supporter on the touchline watched the same hour and keeps
 *   his vote; a member who was not on the sheet was not there and loses his. That is `mayRateMatch`
 *   below, and it is a separate question from `ratingTargetsFor`, which still has no test on the rater:
 *   « whom does he owe » and « may he rate at all » are asked by the same callers, one after the other.
 *
 * **Nobody rates himself.** Decision 007 required it — a self-note was part of the full set and the
 * recap printed « tu t'es mis 8 ». Decision 137 drops it: the published figure is « the mean of the
 * notes the others gave him », and a man's own note has no place in that. `ratings_no_self` in the
 * schema is the half of this that a constraint can state, and it is also why a rater who played gets a
 * set one shorter than a supporter's.
 */

/** Who played, and so who is rated. One row per member with minutes on the clock. */
export type PlayedEntry = {
  teamMemberId: string;
  minutes: number;
};

/** One row of `match_squad`, as the rater rule reads it: who was named for this match, and as what. */
export type SquadEntry = {
  teamMemberId: string;
  role: "starter" | "substitute" | "supporter";
};

/**
 * The squad roles that carry a vote (decision 159). All three of them, today — the set is spelled out
 * rather than read as « has a row » so that a fourth role added to the enum does not get a vote by
 * accident: whoever adds it has to come here and decide.
 */
export const RATER_ROLES: ReadonlySet<SquadEntry["role"]> = new Set([
  "starter",
  "substitute",
  "supporter",
]);

/**
 * Everybody entitled to rate this match, sorted: the sheet's starters, substitutes and supporters,
 * **plus anybody the log has playing** (decision 159).
 *
 * The second half is a corner, and it is there so the rule cannot contradict itself. A late arrival
 * put on without the sheet being corrected has minutes, so he is *rated* — and the owner's sentence is
 * « tous les titulaires, tous les remplaçants », which is what a man who played *was*, whatever the
 * sheet forgot to say. Leaving him out would make him the one player who is judged and may not judge.
 * Who is « non sélectionné » is the man who neither was named nor played, and he is the one refused.
 *
 * **A match with no sheet at all has no raters**, unless somebody played in it: there is nobody to
 * prove he was there, and inventing « everybody » for it would be decision 139 coming back through the
 * gap. Both matches the old app's history was imported for do carry a sheet.
 */
export function eligibleRaterIds(
  sheet: readonly SquadEntry[],
  played: readonly PlayedEntry[],
): string[] {
  const ids = new Set<string>();
  for (const entry of sheet) {
    if (RATER_ROLES.has(entry.role)) ids.add(entry.teamMemberId);
  }
  for (const id of playedMemberIds(played)) ids.add(id);
  return [...ids].sort();
}

/**
 * May this member rate this match? Pure; `can(actor, "rating:submit")` is the permission and this is
 * the data half of the same answer — `can()` has no match sheet to read, so the check lives with the
 * callers that load one (`submitRatings`, `getNotationView`, `getRatingResults`). A viewer with no
 * membership (a super admin outside the team) has no vote.
 */
export function mayRateMatch(
  sheet: readonly SquadEntry[],
  played: readonly PlayedEntry[],
  raterMembershipId: string | null | undefined,
): boolean {
  if (!raterMembershipId) return false;
  return eligibleRaterIds(sheet, played).includes(raterMembershipId);
}

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
 * It does not decide whether he may rate — the sheet does (`mayRateMatch`, decision 159). It is kept
 * because the notation screen says a different thing to a man who was on the pitch than to one who
 * watched, and because a rater who played is in the rated set and so gets a list one name shorter than
 * everybody else's.
 */
export function hasPlayed(played: readonly PlayedEntry[], membershipId: string | null | undefined): boolean {
  if (!membershipId) return false;
  return played.some((entry) => entry.teamMemberId === membershipId && entry.minutes > 0);
}

/**
 * Whom one rater owes a note: everybody who played, **minus himself**.
 *
 * No test on the rater at all: a supporter and a coach on the sheet get the same list, and a player
 * gets it minus his own name. Whether he may rate in the first place is `mayRateMatch`'s question
 * (decision 159), asked by every caller before this one, so an empty list here still means one thing
 * only, « nobody played this match » (decision 013), and never a statement about who is asking.
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
/* The coach's tally                                                          */
/* -------------------------------------------------------------------------- */

/** What the tally needs of a member: his id, his name, and whether he has left. */
export type TallyMember = {
  membershipId: string;
  displayName: string;
  hasLeft: boolean;
};

/** One member who has sent no note at all for this match. Coach only. */
export type SilentMember = {
  memberId: string;
  displayName: string;
};

/**
 * How many people have spoken, and who has not — **the coach's alone**, and the one thing he has to go
 * on when he decides whether the means are worth showing yet.
 *
 * It replaces `owing` / `raterTotal`, whose denominator was « the players with minutes » because they
 * were the people publication waited for. Nothing waits for anybody now. Decision 139 made the
 * denominator every active member; decision 159 narrows it to **the active members entitled to rate
 * this match** — its sheet's starters, substitutes and supporters, the coach among them only if he is
 * on it — so a denominator nobody unselected can help reach does not lie. « Who has not finished his
 * set » collapses to « who has sent nothing », because the form posts a whole set at once.
 */
export type RaterTally = {
  /** Eligible active members who have sent at least one note. */
  raterCount: number;
  /** Eligible active members: everybody entitled to rate this match (`eligibleRaterIds`). */
  memberTotal: number;
  /** The ones who have sent nothing, by name, in the directory's order. */
  silent: SilentMember[];
};

/**
 * Who has sent notes, out of everybody who could, and who has not.
 *
 * **Eligible raters only** (decision 159): the match's starters, substitutes and supporters, and
 * anybody who played. A member who was not selected may not rate, so counting him would give the coach
 * a denominator that can never be reached, and naming him in « pas encore de note de … » would ask him
 * for something the app refuses.
 *
 * **Active members only**, for the same reason: a member who has left is not going to rate. His notes,
 * if he sent any before leaving, are still in the mean — this is a tally of people to chase, not of
 * notes received, and `ratingCount` is the other one. A note already on file from a member the sheet
 * no longer names (the coach edited it afterwards) also stays in the mean: a note is final.
 */
export function tallyOf(
  directory: readonly TallyMember[],
  eligibleIds: readonly string[],
  raterIds: readonly string[],
): RaterTally {
  const rated = new Set(raterIds);
  const eligible = new Set(eligibleIds);
  const active = directory.filter((member) => !member.hasLeft && eligible.has(member.membershipId));
  const silent = active.filter((member) => !rated.has(member.membershipId));
  return {
    raterCount: active.length - silent.length,
    memberTotal: active.length,
    silent: silent.map((member) => ({
      memberId: member.membershipId,
      displayName: member.displayName,
    })),
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

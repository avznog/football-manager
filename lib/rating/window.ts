/**
 * When a match can be rated.
 *
 * Pure: the caller passes `nowMs` and the next kick-off, so the rule is testable and identical on
 * the server and in a unit test (`CLAUDE.md`, invariant 2's reasoning applied to the same kind of
 * derived state).
 *
 * The rule comes from decision 007: **the rating window closes when the next match kicks off.**
 * The point is that ratings are a fresh impression, not an archive you fill in three months later,
 * and that the recap of a match should stop changing once the team has moved on to the next one.
 *
 * Two edges, decided here because nothing else settled them:
 *
 * - **It opens at the final whistle, not at kick-off.** You cannot rate a match that has not been
 *   played. `finished` is the match's `status`, which game mode sets on the final whistle — so a
 *   match abandoned in `live` is never rateable until somebody closes it, which is correct: the
 *   recap it would produce is not a result yet.
 * - **`nextKickoffAtMs === nowMs` is closed.** The whistle has blown; the window is shut. Being
 *   strict at the boundary means the state can never depend on millisecond jitter between two
 *   renders of the same page.
 *
 * Known limitation, worth writing down: on a tournament day the "next match" is an hour later, so
 * the window shuts almost immediately. That is what decision 007 says, and a tournament is
 * precisely when nobody is going to rate seven matches anyway. If it ever bites, the fix is a new
 * decision (« the window lasts at least N hours »), not a quiet change here.
 */

export type RatingWindowState =
  /** The match is not finished: there is nothing to rate yet. */
  | "not-yet"
  /** Ratings accepted. */
  | "open"
  /** The next match has kicked off; ratings are closed for good. */
  | "closed";

export type RatingWindowInput = {
  /** `match.status === "finished"`. */
  finished: boolean;
  /** Kick-off of the team's next match *after* this one, or null when there is none scheduled. */
  nextKickoffAtMs: number | null;
  nowMs: number;
};

export type RatingWindow = {
  state: RatingWindowState;
  /** Convenience for the many call sites that only care whether an insert is allowed. */
  isOpen: boolean;
  /** When the window shuts, if that is already known — the next kick-off. */
  closesAtMs: number | null;
};

export function ratingWindow(input: RatingWindowInput): RatingWindow {
  const closesAtMs = input.nextKickoffAtMs;

  if (!input.finished) {
    return { state: "not-yet", isOpen: false, closesAtMs };
  }

  if (closesAtMs !== null && closesAtMs <= input.nowMs) {
    return { state: "closed", isOpen: false, closesAtMs };
  }

  return { state: "open", isOpen: true, closesAtMs };
}

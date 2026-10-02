/**
 * When a match can be rated.
 *
 * Pure: the caller passes the two facts, so the rule is testable and identical on the server and in a
 * unit test (`CLAUDE.md`, invariant 2's reasoning applied to the same kind of derived state).
 *
 * The rule comes from decision 138: **rating is open from the final whistle until the means come
 * out.** What ends it is publication — the squad finishing its notes, or the coach's button — and
 * nothing else. The calendar has no say.
 *
 * ## What this replaces, and why
 *
 * Decision 007 closed the window at the **next match's kick-off**, on the reasoning that a note is a
 * fresh impression and not an archive you fill in three months later. That is a good reason to want
 * people to rate quickly and a bad reason to stop them: on a normal season a man who misses one
 * Sunday's deadline is locked out of that match for ever, and the only thing the lock achieves is that
 * the mean he would have contributed to is one note thinner. Nothing was gained; a figure was made
 * worse. The demo season shipped two matches in exactly that state.
 *
 * So the deadline moves onto the thing that actually has to stop changing: **a published mean never
 * moves.** The coach's publish button is the real deadline, and the button already says so
 * (« elles ne bougeront plus »).
 *
 * The anti-anchoring guarantee decision 021 existed for survives untouched, and that is the reason
 * rating does not simply stay open for ever: a reader who could rate a match whose means are already
 * out would be writing his notes *after* reading the team's, which is the one thing this feature has
 * never allowed. **Nobody ever reads a mean before writing his own notes.**
 *
 * Two edges, decided here because nothing else settles them:
 *
 * - **it opens at the final whistle, not at kick-off.** You cannot rate a match that has not been
 *   played. `finished` is the match's `status`, which game mode sets on the final whistle — so a
 *   match abandoned in `live` is never rateable until somebody closes it, which is correct: the
 *   recap it would produce is not a result yet;
 * - **a match nobody played is closed, not open.** `ratingsPublication` publishes it vacuously (no
 *   set is outstanding), so `published` is true and the state is `"closed"`. There is nobody to rate
 *   and the screen says so in its own words; this agreeing with publication rather than contradicting
 *   it is what keeps « the means are out » and « rating is over » one fact instead of two.
 */

export type RatingWindowState =
  /** The match is not finished: there is nothing to rate yet. */
  | "not-yet"
  /** Ratings accepted. */
  | "open"
  /** The means are out, so the notes behind them can no longer change. */
  | "closed";

export type RatingWindowInput = {
  /** `match.status === "finished"`. */
  finished: boolean;
  /** `ratingsPublication(...).published` for the same match — what shuts the window (decision 138). */
  published: boolean;
};

export type RatingWindow = {
  state: RatingWindowState;
  /** Convenience for the many call sites that only care whether an insert is allowed. */
  isOpen: boolean;
};

export function ratingWindow(input: RatingWindowInput): RatingWindow {
  if (!input.finished) {
    return { state: "not-yet", isOpen: false };
  }

  if (input.published) {
    return { state: "closed", isOpen: false };
  }

  return { state: "open", isOpen: true };
}

/**
 * What closes the window, in words, for a player who still owes notes — « Tant que les moyennes ne
 * sont pas sorties, tu peux encore noter : … ».
 *
 * There is no date to print any more, and that is the point of decision 138. What replaces the date is
 * the thing a player can actually act on: the means come out the moment the last man finishes or the
 * coach decides he has waited long enough, and after that his notes are no longer wanted. So the
 * sentence names the two events rather than a time, which has the side benefit of being true for the
 * last match of a season — the case the old deadline could not describe at all, because that match had
 * no next kick-off and so printed nothing.
 *
 * Only for a viewer whose notes are unfinished: it is about notes he has still to give, which is
 * nothing to say to somebody who has already rated everybody.
 */
export function ratingUrgencyFr(): string {
  return (
    "Tu peux encore noter : les moyennes ne sont pas sorties. Elles sortiront dès que tout le monde " +
    "aura noté, ou quand le coach décidera de les sortir — et tes notes ne compteront plus."
  );
}

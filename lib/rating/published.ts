/**
 * Whether a match's means are visible, and the mean of a set of notes.
 *
 * ## One fact, and it is the coach's
 *
 * « Are this match's means out? » is now a question about **one column**:
 * `matches.ratingsPublishedAt`. The coach shows them, the coach hides them again, and nothing else in
 * the app moves that switch (decision 139). So the predicate is one comparison, and this module exists
 * for the docblock and for the single spelling — `lib/stats/ratings.ts` asks the same question of every
 * match of a season, and two spellings of it is how a season table comes to disagree with a recap.
 *
 * ## What it used to be, which is why this file is mostly prose
 *
 * Decision 007 asked « has *this reader* earned the notes », and decision 021 extended that to every
 * statistic in the app — which is why `lib/stats/` carried per-viewer `visibleMatchIds` and a profile
 * card had to explain why a reader's average was two matches short. Decision 137 replaced both with a
 * question that has no viewer in it, but gave it **three** clauses: every expected set in, or the coach
 * published, or the rating window had closed at the next kick-off. Decision 138 deleted the third (it
 * never fired for the last match of a season, which has no next kick-off). Decision 139 deletes the
 * first, and that one is a product decision rather than a tidy-up:
 *
 * - **« every set in » published a match behind the coach's back.** The squad finishing was the normal
 *   path and it made publication an emergent property of a dozen people's diligence — nobody decided
 *   it, and the moment it happened was whenever the last man got round to it. The owner wants the
 *   decision to be *his*, per match;
 * - so the set of expected raters stops being load-bearing. It used to be « the players with
 *   `minutes > 0` », and under decision 139 **anybody in the team may rate**, played or not, which
 *   would have made « every expected rater has submitted » a condition on people who were not even
 *   there. Deleting the clause is what stops that being a question at all.
 *
 * The cost, stated where it is paid: a coach who never taps the button holds a match's means for ever,
 * and the app will not step in. That was the hole clause 1 existed to cover. It is now a person's job,
 * and the screens say whose.
 *
 * ## What this is not
 *
 * Not « is there enough to show ». A match nobody rated can be made visible, and it will print no
 * figure at all, because `MIN_NOTES_FOR_MEAN` guards the mean itself downstream (`aggregate.ts`).
 * Keeping the two apart is deliberate: « le coach n'a pas sorti les moyennes » and « pas encore assez
 * de notes » are different sentences, and a reader told the wrong one would go and wait for the wrong
 * thing.
 *
 * Pure. Enforcement is still in the query layer — `lib/rating/queries.ts` reads no score at all for a
 * match whose means are hidden — because a rule being right in a module proves nothing about a screen
 * that bypasses it (decision 097).
 */

/**
 * Are this match's means visible to the team?
 *
 * `publishedAtMs` is `matches.ratingsPublishedAt` in epoch ms, or null. The instant itself is kept
 * rather than a boolean because « depuis quand » is a fair thing for a screen to say; **null is the
 * hidden state, and hiding a match again writes null back** (decision 139 made the switch go both
 * ways), so this must stay a question about presence and never about whether the instant is in the
 * past.
 */
export function meansAreVisible(publishedAtMs: number | null): boolean {
  return publishedAtMs !== null;
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

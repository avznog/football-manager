/**
 * Which stored notes count, for one match or across a season (decision 226).
 *
 * A note is **kept** in `ratings` whatever happens to the match afterwards, and it **counts** only
 * while both people are still on the match:
 *
 *  - the rated player has minutes in it (`minutes > 0`, decision 137);
 *  - the rater is eligible — named on the sheet in any role, or has minutes (decision 159), the same
 *    rule `eligibleRaterIds` applies to who may send notes at all.
 *
 * Why not delete. The owner: « Lucien has been on the pitch from 0′ but never showed up, so I remove
 * him from the match ». Removing him takes him off the sheet and off the pitch, and the notes he gave
 * or received must stop counting — but if the removal was a mistake and he is added back, those
 * notes are the team's real votes and have to come back with him. A deletion cannot be undone; a
 * filter can. So every reader of ratings goes through here, and nothing else in the app decides
 * which notes are real.
 *
 * Pure: the rows in, the rows that count out. The readers already load the sheet and the minutes of
 * the matches they read, so this costs no query.
 */

import { eligibleRaterIds, playedMemberIds, type PlayedEntry, type SquadEntry } from "./progress";

/** What a match contributes to the decision: its sheet and who played in it. */
export type RatingEligibilityContext = {
  sheet: readonly SquadEntry[];
  played: readonly PlayedEntry[];
};

/** The notes of **one** match that count. */
export function eligibleRatings<T extends { raterMemberId: string; ratedMemberId: string }>(
  rows: readonly T[],
  context: RatingEligibilityContext,
): T[] {
  const raters = new Set(eligibleRaterIds(context.sheet, context.played));
  const rated = new Set(playedMemberIds(context.played));
  return rows.filter((row) => raters.has(row.raterMemberId) && rated.has(row.ratedMemberId));
}

/**
 * The notes of **several** matches that count, each judged against its own match.
 *
 * A match the context map does not know is a match whose sheet and minutes were never loaded; its
 * notes are dropped rather than guessed at. A reader that wants a match's notes has to load it.
 */
export function eligibleRatingsByMatch<
  T extends { matchId: string; raterMemberId: string; ratedMemberId: string },
>(rows: readonly T[], contexts: ReadonlyMap<string, RatingEligibilityContext>): T[] {
  const byMatch = new Map<string, T[]>();
  for (const row of rows) {
    const list = byMatch.get(row.matchId);
    if (list) list.push(row);
    else byMatch.set(row.matchId, [row]);
  }
  const kept: T[] = [];
  for (const [matchId, list] of byMatch) {
    const context = contexts.get(matchId);
    if (!context) continue;
    kept.push(...eligibleRatings(list, context));
  }
  return kept;
}

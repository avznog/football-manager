/**
 * Which matches' rating means are out — the season-long reading of decision 137.
 *
 * This module used to answer « which matches may *this viewer* read », because decision 021 extended
 * decision 007's reciprocity gate across the whole statistics tree: publishing a season average to
 * somebody who had not rated a match would have been reading its notes, just with one number instead
 * of thirteen. Decision 137 removes the premise. Nobody reads an individual note but the coach, a
 * match's means are out or they are not, and **every reader therefore gets the same statistics**.
 *
 * What survives is the shape: this is still the one place that decides, for many matches at once,
 * which of them a mean may be computed from. What is gone is `viewerMemberId` — and with it
 * `hiddenRatedCounts`, which existed so a profile card could explain to one reader why *his* average
 * was short of two matches. No reader's average is short of anything any more.
 *
 * **The rule itself lives in `lib/rating/published.ts`** and this module does not restate it; it
 * applies it per match. Two implementations of « published » would drift the day one of them was
 * relaxed, and the one that drifted would print a mean nobody had agreed to.
 *
 * Pure. The query layer decides what to fetch from the answer (`queries.ts` selects no score for an
 * unpublished match at all), and the screen says how many matches are still waiting so that a missing
 * average never reads as a bug.
 */

import { playedMemberIds, ratingTargetsFor, type PlayedEntry } from "@/lib/rating/progress";
import { ratingsPublication } from "@/lib/rating/published";

/**
 * Who rated whom, in which match — **without the scores**. This is all the predicate needs, and
 * asking for no more than it needs is what lets `queries.ts` leave an unpublished match's scores in
 * the database.
 */
export type RatingAuthorRow = {
  matchId: string;
  raterMemberId: string;
  ratedMemberId: string;
};

/** A score from a match whose means are out. */
export type VisibleRatingRow = {
  matchId: string;
  ratedMemberId: string;
  score: number;
};

/** Minutes played, per match — who was expected to rate, and who could be rated. */
export type PlayedRow = {
  matchId: string;
  teamMemberId: string;
  minutes: number;
};

/**
 * The one per-match fact the predicate needs beyond the notes themselves.
 *
 * It used to carry a second — `windowClosed`, whether a later match had kicked off — and this module
 * had to be handed it because deriving it needs the calendar and a clock, and this module has neither.
 * Decision 138 deleted the clause, so the row is down to the column: a season's means are out for the
 * matches whose sets are all in, plus the ones the coach released.
 */
export type MatchPublicationRow = {
  matchId: string;
  /** `matches.ratings_published_at` in epoch ms, or null — the coach's escape hatch. */
  publishedAtMs: number | null;
};

export type SeasonRatingPublication = {
  /** Match ids whose means may be computed and shown. To everybody, identically. */
  publishedMatchIds: string[];
  /** Matches that hold notes and are still waiting on somebody. */
  pendingMatchIds: string[];
};

/**
 * Split a season's matches into the ones whose means are out and the ones still waiting.
 *
 * A match that holds no note at all is in **neither** list: it is not published (there is nothing to
 * publish) and telling a reader that a match nobody rated is « en attente de notes » would be a
 * weekly reproach for a friendly in October nobody intends to rate. `pendingMatchIds` is what the
 * screens count, so it carries only the matches a reader could reasonably be waiting for.
 */
export function seasonRatingPublication(input: {
  /** The matches under consideration — already filtered by competition. */
  matchIds: readonly string[];
  played: readonly PlayedRow[];
  /** Who rated whom, scores excluded. */
  authors: readonly RatingAuthorRow[];
  matches: readonly MatchPublicationRow[];
}): SeasonRatingPublication {
  const wanted = new Set(input.matchIds);

  const playedBy = new Map<string, PlayedEntry[]>();
  for (const row of input.played) {
    if (!wanted.has(row.matchId)) continue;
    const entry: PlayedEntry = { teamMemberId: row.teamMemberId, minutes: row.minutes };
    const list = playedBy.get(row.matchId);
    if (list) list.push(entry);
    else playedBy.set(row.matchId, [entry]);
  }

  const hasRatings = new Set<string>();
  /** matchId → rater → whom he has rated. */
  const submittedIn = new Map<string, Map<string, Set<string>>>();
  for (const author of input.authors) {
    if (!wanted.has(author.matchId)) continue;
    hasRatings.add(author.matchId);
    const byRater = submittedIn.get(author.matchId) ?? new Map<string, Set<string>>();
    const rated = byRater.get(author.raterMemberId) ?? new Set<string>();
    rated.add(author.ratedMemberId);
    byRater.set(author.raterMemberId, rated);
    submittedIn.set(author.matchId, byRater);
  }

  const publicationOf = new Map(input.matches.map((row) => [row.matchId, row]));

  const publishedMatchIds: string[] = [];
  const pendingMatchIds: string[] = [];

  for (const matchId of input.matchIds) {
    const played = playedBy.get(matchId) ?? [];
    const expectedRaterIds = playedMemberIds(played);
    const byRater = submittedIn.get(matchId);

    const completeRaterIds = expectedRaterIds.filter((raterId) =>
      ratingTargetsFor(played, raterId).every((target) => byRater?.get(raterId)?.has(target)),
    );

    const row = publicationOf.get(matchId);
    const { published } = ratingsPublication({
      expectedRaterIds,
      completeRaterIds,
      publishedAtMs: row?.publishedAtMs ?? null,
    });

    // Nothing to show and nothing to wait for: a match nobody rated belongs in neither list.
    if (!hasRatings.has(matchId)) continue;
    if (published) publishedMatchIds.push(matchId);
    else pendingMatchIds.push(matchId);
  }

  return { publishedMatchIds, pendingMatchIds };
}

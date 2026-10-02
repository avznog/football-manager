/**
 * Which matches' rating means are out — the season-long reading of decision 139.
 *
 * This module used to answer « which matches may *this viewer* read », because decision 021 extended
 * decision 007's reciprocity gate across the whole statistics tree: publishing a season average to
 * somebody who had not rated a match would have been reading its notes, just with one number instead
 * of thirteen. Decision 137 removed the premise. Nobody reads an individual note but the coach, a
 * match's means are out or they are not, and **every reader therefore gets the same statistics**.
 *
 * What survives is the shape: this is still the one place that decides, for many matches at once,
 * which of them a mean may be computed from. What is gone is `viewerMemberId` — and with it
 * `hiddenRatedCounts`, which existed so a profile card could explain to one reader why *his* average
 * was short of two matches. No reader's average is short of anything any more.
 *
 * ## What decision 139 took out of it
 *
 * Until decision 139 this function also had to work out, per match, whether **every expected rater had
 * submitted** — which meant it needed the minutes of every player of every match (`PlayedRow`) and the
 * whole rater→rated graph (`RatingAuthorRow`), rebuilt into two nested maps, to answer a question about
 * a boolean. Publication is now one column the coach writes, so all of that is gone and the loop reads
 * one row per match. The only thing still asked of the notes is whether a match holds **any**, and that
 * is a set of match ids.
 *
 * **The rule itself lives in `lib/rating/published.ts`** and this module does not restate it; it
 * applies it per match. Two implementations of « published » would drift the day one of them was
 * relaxed, and the one that drifted would print a mean nobody had agreed to.
 *
 * Pure. The query layer decides what to fetch from the answer (`queries.ts` selects no score for an
 * unpublished match at all), and the screen says how many matches are still waiting so that a missing
 * average never reads as a bug.
 */

import { meansAreVisible } from "@/lib/rating/published";

/** A score from a match whose means are out. */
export type VisibleRatingRow = {
  matchId: string;
  ratedMemberId: string;
  score: number;
};

/**
 * The one per-match fact the predicate needs beyond « does this match hold notes ».
 *
 * It used to carry a second — `windowClosed`, whether a later match had kicked off — and this module
 * had to be handed it because deriving it needs the calendar and a clock, and this module has neither.
 * Decision 138 deleted the clause, and decision 139 deleted the other derived one, so the row is the
 * column and nothing else: a season's means are out for the matches the coach has released.
 */
export type MatchPublicationRow = {
  matchId: string;
  /** `matches.ratings_published_at` in epoch ms, or null — null is hidden, and hiding writes null. */
  publishedAtMs: number | null;
};

export type SeasonRatingPublication = {
  /** Match ids whose means may be computed and shown. To everybody, identically. */
  publishedMatchIds: string[];
  /** Matches that hold notes and whose means the coach has not released. */
  pendingMatchIds: string[];
};

/**
 * Split a season's matches into the ones whose means are out and the ones still hidden.
 *
 * A match that holds no note at all is in **neither** list: it is not published (there is nothing to
 * publish) and telling a reader that a match nobody rated is « en attente » would be a weekly reproach
 * for a friendly in October nobody intends to rate. `pendingMatchIds` is what the screens count, so it
 * carries only the matches a reader could reasonably be waiting for.
 *
 * Note what « pending » now means, because the word survived a change of subject: it used to be « still
 * waiting on a teammate's notes » and it is now « the coach has not shown these yet ». The screens that
 * count it had to be reworded for that, and the set is the same size either way.
 */
export function seasonRatingPublication(input: {
  /** The matches under consideration — already filtered by competition. */
  matchIds: readonly string[];
  /** Which of them hold at least one note. Ids only; no score and no author leaves the database. */
  ratedMatchIds: readonly string[];
  matches: readonly MatchPublicationRow[];
}): SeasonRatingPublication {
  const hasRatings = new Set(input.ratedMatchIds);
  const publicationOf = new Map(input.matches.map((row) => [row.matchId, row]));

  const publishedMatchIds: string[] = [];
  const pendingMatchIds: string[] = [];

  for (const matchId of input.matchIds) {
    // Nothing to show and nothing to wait for: a match nobody rated belongs in neither list.
    if (!hasRatings.has(matchId)) continue;
    const row = publicationOf.get(matchId);
    if (meansAreVisible(row?.publishedAtMs ?? null)) publishedMatchIds.push(matchId);
    else pendingMatchIds.push(matchId);
  }

  return { publishedMatchIds, pendingMatchIds };
}

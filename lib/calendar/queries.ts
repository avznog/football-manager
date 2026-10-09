import "server-only";

/**
 * The one read behind `/calendrier`: the season's matches as a list of `CalendarEvent`s.
 *
 * Two round trips: the matches, then the scores of the ones that have been played. It used to fold
 * the availability answers and the squad size in as well, for the « Je suis dispo » control and the
 * « 1 dispo · 16 sans réponse » line; both went with availability itself (decision 156).
 *
 * The *shape* of the result and the chronology live in `timeline.ts`, which is pure and tested.
 * This module only fetches.
 */

import { getMatchScores, getTeamMatches } from "@/lib/match/queries";
import { addMinutes, matchWindowMinutes, type CalendarEvent } from "./timeline";

export type CalendarData = {
  /** Every match of the season, chronological. Split with `splitTimeline`. */
  events: CalendarEvent[];
};

/** The whole season for one team. The same for every reader. */
export async function getCalendar(teamId: string): Promise<CalendarData> {
  const matchRows = await getTeamMatches(teamId);

  // Only a match that has been played, or is being played, can have a score.
  const playedIds = matchRows
    .filter((match) => match.status !== "scheduled")
    .map((match) => match.id);
  const scores = await getMatchScores(playedIds);

  const events: CalendarEvent[] = matchRows.map((match): CalendarEvent => {
    const startsAt = new Date(match.kickoffAt);
    return {
      kind: "match",
      id: match.id,
      startsAt: match.kickoffAt,
      endsAt: addMinutes(startsAt, matchWindowMinutes(match.periodsCount, match.periodMinutes)),
      opponentName: match.opponentName,
      isHome: match.isHome,
      venue: match.venue,
      competitionLabel: match.competitionLabel,
      status: match.status,
      periodsCount: match.periodsCount,
      periodMinutes: match.periodMinutes,
      score: scores.get(match.id) ?? null,
    };
  });

  return { events };
}

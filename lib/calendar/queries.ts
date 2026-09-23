import "server-only";

/**
 * The one read behind `/calendrier`: matches and trainings merged into a single chronological
 * list of `CalendarEvent`s.
 *
 * Everything is loaded in parallel and stitched together in memory. A season is a few dozen
 * matches, a few dozen trainings and a few hundred availability rows — small enough that one
 * round trip per table beats a clever join, and clear enough to read.
 *
 * The *shape* of the result and the chronology live in `timeline.ts`, which is pure and tested.
 * This module only fetches.
 */

import {
  getMatchScores,
  getTeamMatchAnswers,
  getTeamMatches,
  type MatchAnswer,
} from "@/lib/match/queries";
import {
  getTeamAttendanceCounts,
  getTeamTrainingAnswers,
  getTeamTrainings,
  type TrainingAnswer,
} from "@/lib/training/queries";
import { getSquad } from "@/lib/team/queries";
import type { AvailabilityStatus } from "@/db/schema";
import {
  addMinutes,
  matchWindowMinutes,
  trainingWindowMinutes,
  type AvailabilityCounts,
  type CalendarEvent,
} from "./timeline";

const NO_ANSWERS: AvailabilityCounts = { yes: 0, no: 0, maybe: 0 };

/** Tallies a flat list of answers into per-event counts, and picks out the viewer's own. */
function foldAnswers<T extends { teamMemberId: string; status: AvailabilityStatus }>(
  answers: readonly T[],
  keyOf: (answer: T) => string,
  membershipId: string | null,
): {
  counts: Map<string, AvailabilityCounts>;
  mine: Map<string, AvailabilityStatus>;
} {
  const counts = new Map<string, AvailabilityCounts>();
  const mine = new Map<string, AvailabilityStatus>();

  for (const answer of answers) {
    const key = keyOf(answer);
    const tally = counts.get(key) ?? { yes: 0, no: 0, maybe: 0 };
    tally[answer.status] += 1;
    counts.set(key, tally);

    if (membershipId && answer.teamMemberId === membershipId) {
      mine.set(key, answer.status);
    }
  }

  return { counts, mine };
}

export type CalendarData = {
  /** Every event of the season, chronological. Split with `splitTimeline`. */
  events: CalendarEvent[];
  /** Active players, which is what « 9 / 13 ont répondu » counts against. */
  squadSize: number;
};

/**
 * The whole season for one team, from the point of view of one member.
 *
 * `membershipId` is the viewer's `team_members.id`, or null for a super admin looking at a team
 * they do not belong to — they then see the tallies but have nothing of their own to declare.
 */
export async function getCalendar(
  teamId: string,
  membershipId: string | null,
): Promise<CalendarData> {
  const [matchRows, trainingRows, matchAnswers, trainingAnswers, attendance, squad] =
    await Promise.all([
      getTeamMatches(teamId),
      getTeamTrainings(teamId),
      getTeamMatchAnswers(teamId),
      getTeamTrainingAnswers(teamId),
      getTeamAttendanceCounts(teamId),
      getSquad(teamId),
    ]);

  // Only a match that has been played, or is being played, can have a score.
  const playedIds = matchRows
    .filter((match) => match.status !== "scheduled")
    .map((match) => match.id);
  const scores = await getMatchScores(playedIds);

  const squadSize = squad.filter((member) => member.isPlayer).length;

  const matchAnswerIndex = foldAnswers<MatchAnswer>(
    matchAnswers,
    (answer) => answer.matchId,
    membershipId,
  );
  const trainingAnswerIndex = foldAnswers<TrainingAnswer>(
    trainingAnswers,
    (answer) => answer.trainingId,
    membershipId,
  );

  const events: CalendarEvent[] = [
    ...matchRows.map((match): CalendarEvent => {
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
        myAvailability: matchAnswerIndex.mine.get(match.id) ?? null,
        answers: matchAnswerIndex.counts.get(match.id) ?? NO_ANSWERS,
        squadSize,
      };
    }),
    ...trainingRows.map((training): CalendarEvent => {
      const startsAt = new Date(training.startsAt);
      return {
        kind: "training",
        id: training.id,
        startsAt: training.startsAt,
        endsAt: addMinutes(startsAt, trainingWindowMinutes()),
        venue: training.venue,
        note: training.note,
        myAvailability: trainingAnswerIndex.mine.get(training.id) ?? null,
        answers: trainingAnswerIndex.counts.get(training.id) ?? NO_ANSWERS,
        squadSize,
        attendance: attendance.get(training.id) ?? { present: 0, marked: 0 },
      };
    }),
  ];

  return { events, squadSize };
}

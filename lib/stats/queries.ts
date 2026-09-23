import "server-only";

/**
 * The reads behind `/stats`. Same contract as `lib/match/queries.ts` and `lib/training/queries.ts`:
 * queries live apart from actions, the `teamId` is always inside the predicate, and everything that
 * comes back is plain and serialisable — instants leave as ISO strings, counts as numbers, and no
 * Drizzle row with a live `Date` on it ever crosses the RSC boundary (`CLAUDE.md`).
 *
 * This module **fetches**; it decides nothing. The rules live in the pure modules next to it:
 * `match-lines.ts` (cache or reduction), `ratings.ts` (who may see a rating), `aggregate.ts` (every
 * season number). That separation is what lets the interesting cases be tested from hand-written
 * fixtures instead of from a database.
 *
 * ## Cost
 *
 * Six small round trips, all independent of the number of players: the matches, their scores, the
 * cached per-player rows, the sheets, the ratings, the attendance marks — plus the member list and
 * the slot catalogue. The event log is read **only** for finished matches that have no cached row
 * (`matchesNeedingReduction`), which is the entire point of `match_player_stats` being a cache: once
 * M4 freezes a match at the final whistle, a season aggregate replays nothing at all.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import {
  formationSlots,
  formations,
  matchEvents,
  matchPlayerStats,
  matchSquad,
  matches,
  ratings,
  teamMembers,
  trainingAttendance,
  trainings,
  users,
} from "@/db/schema";
import type { Competition, SquadRole } from "@/db/schema";
import type { SlotInfo } from "@/lib/match/lineup";
import { getMatchScores } from "@/lib/match/queries";
import type { MatchEventRecord } from "@/lib/match/reducer";
import {
  type AttendanceMarkRow,
  type SeasonStats,
  type StatsMatch,
  type StatsMember,
  type SquadAppearanceRow,
  aggregateSeason,
} from "./aggregate";
import {
  type CachedStatRow,
  type MatchLogInput,
  matchesNeedingReduction,
  resolveMatchStatLines,
} from "./match-lines";
import { type RatingRowWithRater, ratingVisibility, visibleRatings } from "./ratings";

/* -------------------------------------------------------------------------- */
/* The filter                                                                 */
/* -------------------------------------------------------------------------- */

export type StatsFilter = {
  /** Null = every competition (`docs/PLAN.md`: stats filterable by competition). */
  competition: Competition | null;
};

/* -------------------------------------------------------------------------- */
/* Pieces                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Every membership of the team, **including those who have left**: their goals still happened
 * (`docs/DATA_MODEL.md`), and a season table that loses a September scorer in January is wrong.
 * This is the one place `lib/stats/` deliberately diverges from `getSquad`, which is a selection
 * list and rightly hides them.
 */
async function getStatsMembers(teamId: string): Promise<StatsMember[]> {
  const rows = await db
    .select({
      teamMemberId: teamMembers.id,
      displayName: users.displayName,
      jerseyNumber: teamMembers.jerseyNumber,
      isPlayer: teamMembers.isPlayer,
      leftAt: teamMembers.leftAt,
    })
    .from(teamMembers)
    .innerJoin(users, eq(users.id, teamMembers.userId))
    .where(eq(teamMembers.teamId, teamId));

  return rows.map((row) => ({
    teamMemberId: row.teamMemberId,
    displayName: row.displayName,
    jerseyNumber: row.jerseyNumber,
    isPlayer: row.isPlayer,
    hasLeft: row.leftAt !== null,
  }));
}

/**
 * Finished matches only, oldest first.
 *
 * A live match is deliberately out: its minutes are still moving, so counting it would make a
 * season total change under the reader between two refreshes. Game mode is where a match in
 * progress is read. The count of live matches is returned so the screen can say so rather than
 * leave the coach wondering where Sunday went.
 */
async function getFinishedMatches(
  teamId: string,
  filter: StatsFilter,
): Promise<{
  rows: Array<{
    id: string;
    kickoffAt: string;
    opponentName: string;
    isHome: boolean;
    competition: Competition;
    periodsCount: number;
    periodMinutes: number;
  }>;
  liveCount: number;
}> {
  const competitionPredicate = filter.competition
    ? eq(matches.competition, filter.competition)
    : undefined;

  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      opponentName: matches.opponentName,
      isHome: matches.isHome,
      competition: matches.competition,
      periodsCount: matches.periodsCount,
      periodMinutes: matches.periodMinutes,
    })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "finished"), competitionPredicate))
    .orderBy(matches.kickoffAt);

  const live = await db
    .select({ count: sql<string>`count(*)` })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "live"), competitionPredicate));

  return {
    rows: rows.map((row) => ({ ...row, kickoffAt: row.kickoffAt.toISOString() })),
    liveCount: Number(live[0]?.count ?? 0),
  };
}

/** The match sheets: the source of truth for titulaire / remplaçant / supporter. */
async function getSquadRows(matchIds: readonly string[]): Promise<SquadAppearanceRow[]> {
  if (matchIds.length === 0) return [];
  return db
    .select({
      matchId: matchSquad.matchId,
      teamMemberId: matchSquad.teamMemberId,
      role: matchSquad.role,
    })
    .from(matchSquad)
    .where(inArray(matchSquad.matchId, [...matchIds]));
}

/** The cache. One row per player per frozen match, written at the final whistle by M4. */
async function getCachedStatRows(matchIds: readonly string[]): Promise<CachedStatRow[]> {
  if (matchIds.length === 0) return [];
  return db
    .select({
      matchId: matchPlayerStats.matchId,
      teamMemberId: matchPlayerStats.teamMemberId,
      minutes: matchPlayerStats.minutes,
      goals: matchPlayerStats.goals,
      assists: matchPlayerStats.assists,
      ownGoals: matchPlayerStats.ownGoals,
      penaltiesScored: matchPlayerStats.penaltiesScored,
      penaltiesMissed: matchPlayerStats.penaltiesMissed,
      fouls: matchPlayerStats.fouls,
      gkMinutes: matchPlayerStats.gkMinutes,
      cleanMinutes: matchPlayerStats.cleanMinutes,
      concededWhileOn: matchPlayerStats.concededWhileOn,
      gkCleanMinutes: matchPlayerStats.gkCleanMinutes,
      concededWhileGk: matchPlayerStats.concededWhileGk,
      squadRole: matchPlayerStats.squadRole,
    })
    .from(matchPlayerStats)
    .where(inArray(matchPlayerStats.matchId, [...matchIds]));
}

/**
 * The slot catalogue: the built-in formations plus this team's own. Without it the reducer cannot
 * know which slot is the goal, so goalkeeping minutes would silently stay at zero.
 *
 * Eleven positions over a handful of formations is a tiny table, and it is only read when something
 * actually has to be reduced.
 */
async function getSlotCatalogue(teamId: string): Promise<SlotInfo[]> {
  return db
    .select({
      id: formationSlots.id,
      positionCode: formationSlots.positionCode,
      sort: formationSlots.sort,
    })
    .from(formationSlots)
    .innerJoin(formations, eq(formations.id, formationSlots.formationId))
    .where(or(isNull(formations.teamId), eq(formations.teamId, teamId)));
}

/** The raw log of the matches that have no cached row, ordered the way the reducer expects. */
async function getEventsFor(matchIds: readonly string[]): Promise<MatchEventRecord[]> {
  if (matchIds.length === 0) return [];
  return db
    .select({
      id: matchEvents.id,
      clientEventId: matchEvents.clientEventId,
      type: matchEvents.type,
      period: matchEvents.period,
      minute: matchEvents.minute,
      clockMs: matchEvents.clockMs,
      occurredAt: matchEvents.occurredAt,
      payload: matchEvents.payload,
      voidsEventId: matchEvents.voidsEventId,
      seq: matchEvents.seq,
      matchId: matchEvents.matchId,
    })
    .from(matchEvents)
    .where(inArray(matchEvents.matchId, [...matchIds]))
    .orderBy(matchEvents.matchId, matchEvents.seq);
}

/** Every rating cast on the matches under consideration, rater included: `ratings.ts` needs it. */
async function getRatingRows(matchIds: readonly string[]): Promise<RatingRowWithRater[]> {
  if (matchIds.length === 0) return [];
  return db
    .select({
      matchId: ratings.matchId,
      raterMemberId: ratings.raterMemberId,
      ratedMemberId: ratings.ratedMemberId,
      score: ratings.score,
    })
    .from(ratings)
    .where(inArray(ratings.matchId, [...matchIds]));
}

/**
 * One row per judged player per session. A member with no row is unmarked, not absent, so nothing
 * is invented for them here — the rate is `présent / marqué` (decision 020).
 *
 * Trainings carry no competition, so this is never filtered: the screen says as much.
 */
async function getAttendanceMarks(
  teamId: string,
): Promise<Array<AttendanceMarkRow & { trainingId: string }>> {
  return db
    .select({
      trainingId: trainingAttendance.trainingId,
      teamMemberId: trainingAttendance.teamMemberId,
      present: trainingAttendance.present,
    })
    .from(trainingAttendance)
    .innerJoin(trainings, eq(trainings.id, trainingAttendance.trainingId))
    .where(eq(trainings.teamId, teamId));
}

/* -------------------------------------------------------------------------- */
/* The season                                                                 */
/* -------------------------------------------------------------------------- */

export type SeasonStatsResult = SeasonStats & {
  /** Echo of what was asked for, so the screen never has to re-derive it. */
  competition: Competition | null;
  /** Finished matches in the filter, including those with nothing logged. */
  matchesConsidered: number;
  /** Matches in progress, excluded on purpose. */
  liveMatches: number;
  /** Sessions with at least one player judged — the denominator's denominator. */
  markedSessions: number;
  /**
   * Matches whose numbers had to be replayed from the log because the cache had no row for them.
   * Zero once M4 freezes every final whistle; useful while it does not.
   */
  reducedFromLog: number;
};

/**
 * Everything `/stats` shows, for one team, through one viewer's eyes.
 *
 * `viewerMemberId` only affects the ratings: the aggregate is otherwise the same for everybody, and
 * the gate is decision 007's, applied match by match (`ratings.ts`).
 *
 * `cache()`d so a page that renders the team card, the tables and a per-player card costs a single
 * pass — and so `generateMetadata` is free.
 */
export const getSeasonStats = cache(
  async (
    teamId: string,
    viewerMemberId: string | null,
    filter: StatsFilter = { competition: null },
  ): Promise<SeasonStatsResult> => {
    const [{ rows: matchRows, liveCount }, members, attendance] = await Promise.all([
      getFinishedMatches(teamId, filter),
      getStatsMembers(teamId),
      getAttendanceMarks(teamId),
    ]);

    const matchIds = matchRows.map((match) => match.id);

    const [scores, cached, squad, ratingRows] = await Promise.all([
      getMatchScores(matchIds),
      getCachedStatRows(matchIds),
      getSquadRows(matchIds),
      getRatingRows(matchIds),
    ]);

    // « sur N séances pointées » — counted here rather than in a second `count(distinct)` round
    // trip, since every mark is already in hand (decision 020).
    const markedSessions = new Set(attendance.map((mark) => mark.trainingId)).size;

    /**
     * **The cache-or-reduce fallback, and the only place it happens.** `matchesNeedingReduction`
     * owns the rule; here we merely load the logs it asks for. An all-cached season loads none.
     */
    const toReduce = matchesNeedingReduction(matchIds, cached);
    const logs = new Map<string, MatchLogInput>();
    if (toReduce.length > 0) {
      const [events, slots] = await Promise.all([
        getEventsFor(toReduce),
        getSlotCatalogue(teamId),
      ]);
      const byMatch = new Map<string, MatchEventRecord[]>();
      for (const event of events) {
        const { matchId, ...record } = event as MatchEventRecord & { matchId: string };
        const list = byMatch.get(matchId);
        if (list) list.push(record);
        else byMatch.set(matchId, [record]);
      }
      const squadByMatch = new Map<string, Array<{ teamMemberId: string; role: SquadRole }>>();
      for (const row of squad) {
        const list = squadByMatch.get(row.matchId);
        const entry = { teamMemberId: row.teamMemberId, role: row.role };
        if (list) list.push(entry);
        else squadByMatch.set(row.matchId, [entry]);
      }
      for (const matchId of toReduce) {
        const match = matchRows.find((row) => row.id === matchId);
        logs.set(matchId, {
          events: byMatch.get(matchId) ?? [],
          squad: squadByMatch.get(matchId) ?? [],
          slots,
          periodsCount: match?.periodsCount ?? null,
          periodMinutes: match?.periodMinutes ?? null,
        });
      }
    }

    const { lines, reducedMatchIds } = resolveMatchStatLines({ matchIds, cached, logs });

    const visibility = ratingVisibility({
      matchIds,
      squad,
      ratings: ratingRows,
      viewerMemberId,
    });

    const statsMatches: StatsMatch[] = matchRows.map((match) => ({
      id: match.id,
      kickoffAt: match.kickoffAt,
      opponentName: match.opponentName,
      isHome: match.isHome,
      competition: match.competition,
      // No entry in the scores map means not a single live event: nothing was ever recorded, which
      // is not the same fact as 0-0 (`aggregate.ts`, rule 7).
      score: scores.get(match.id) ?? null,
    }));

    const season = aggregateSeason({
      members,
      matches: statsMatches,
      lines,
      squad,
      attendance,
      ratings: visibleRatings(ratingRows, visibility.visibleMatchIds),
      hiddenRatingMatches: visibility.hiddenMatchIds.length,
    });

    return {
      ...season,
      competition: filter.competition,
      matchesConsidered: matchRows.length,
      liveMatches: liveCount,
      markedSessions,
      reducedFromLog: reducedMatchIds.length,
    };
  },
);

/**
 * One player's season, for the card on their profile.
 *
 * Deliberately a slice of the same aggregate rather than a second query path: the profile card and
 * the stats table must never be able to disagree, and `getSeasonStats` is `cache()`d, so a page
 * that shows both pays once.
 */
export async function getPlayerSeasonStats(
  teamId: string,
  viewerMemberId: string | null,
  teamMemberId: string,
  filter: StatsFilter = { competition: null },
): Promise<{ player: SeasonStats["players"][number] | null; season: SeasonStatsResult }> {
  const season = await getSeasonStats(teamId, viewerMemberId, filter);
  return {
    player: season.players.find((row) => row.teamMemberId === teamMemberId) ?? null,
    season,
  };
}

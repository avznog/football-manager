import "server-only";

/**
 * The reads behind `/stats`. Same contract as `lib/match/queries.ts`:
 * queries live apart from actions, the `teamId` is always inside the predicate, and everything that
 * comes back is plain and serialisable — instants leave as ISO strings, counts as numbers, and no
 * Drizzle row with a live `Date` on it ever crosses the RSC boundary (`CLAUDE.md`).
 *
 * This module **fetches**; it decides nothing. The rules live in the pure modules next to it:
 * `match-lines.ts` (cache or reduction), `ratings.ts` (whose means are out), `aggregate.ts` (every
 * season number). That separation is what lets the interesting cases be tested from hand-written
 * fixtures instead of from a database.
 *
 * ## Cost
 *
 * Five small round trips, all independent of the number of players: the matches, their scores, the
 * cached per-player rows, the sheets, the ratings — plus the member list and the slot catalogue. The event log is read **only** for finished matches that have no cached row
 * (`matchesNeedingReduction`), which is the entire point of `match_player_stats` being a cache: once
 * M4 freezes a match at the final whistle, a season aggregate replays nothing at all.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import {
  competitions,
  formationSlots,
  formations,
  matchEvents,
  matchPlayerStats,
  matchSquad,
  matches,
  ratings,
  teamMembers,
  users,
} from "@/db/schema";
import type { SquadRole } from "@/db/schema";
import type { SlotInfo } from "@/lib/match/lineup";
import { getMatchScores } from "@/lib/match/queries";
import type { MatchEventRecord } from "@/lib/match/reducer";
import {
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
import {
  type MatchPublicationRow,
  type VisibleRatingRow,
  seasonRatingPublication,
} from "./ratings";

/* -------------------------------------------------------------------------- */
/* The filter                                                                 */
/* -------------------------------------------------------------------------- */

export type StatsFilter = {
  /**
   * `competitions.id`, or null for every competition (`docs/PLAN.md`: stats filterable by
   * competition). An id and not a word, since decision 107: the label is the coach's and may change
   * under a bookmarked URL, the row it names does not.
   */
  competitionId: string | null;
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
    competitionLabel: string;
    periodsCount: number;
    periodMinutes: number;
    /** When the coach released this match's means, in epoch ms, or null (decision 137). */
    ratingsPublishedAtMs: number | null;
  }>;
  liveCount: number;
}> {
  const competitionPredicate = filter.competitionId
    ? eq(matches.competitionId, filter.competitionId)
    : undefined;

  const rows = await db
    .select({
      id: matches.id,
      kickoffAt: matches.kickoffAt,
      opponentName: matches.opponentName,
      isHome: matches.isHome,
      competitionLabel: competitions.labelFr,
      periodsCount: matches.periodsCount,
      periodMinutes: matches.periodMinutes,
      ratingsPublishedAt: matches.ratingsPublishedAt,
    })
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "finished"), competitionPredicate))
    .orderBy(matches.kickoffAt);

  const live = await db
    .select({ count: sql<string>`count(*)` })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "live"), competitionPredicate));

  return {
    rows: rows.map(({ ratingsPublishedAt, ...row }) => ({
      ...row,
      kickoffAt: row.kickoffAt.toISOString(),
      ratingsPublishedAtMs: ratingsPublishedAt?.getTime() ?? null,
    })),
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
 * The slot catalogue: the built-in formations — the one offered and the retired ones an old log may
 * still mention (decision 157) — plus this team's own. Without it the reducer cannot know which slot
 * is the goal, so goalkeeping minutes would silently stay at zero.
 *
 * A handful of formations of seven slots is a tiny table, and it is only read when something
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

/**
 * Which of these matches hold at least one note — **ids only, no score and no author**.
 *
 * All `ratings.ts` needs beyond the published column, and asking for no more than that is deliberate:
 * an unpublished match's scores should not leave the database at all, rather than be fetched and then
 * filtered out in JavaScript, where a later refactor could quietly forget the filter. It used to select
 * the whole rater→rated graph, because publication depended on every expected set being in; decision
 * 139 made it the coach's column, so the graph is no longer anybody's business up here.
 */
async function getRatedMatchIds(matchIds: readonly string[]): Promise<string[]> {
  if (matchIds.length === 0) return [];
  const rows = await db
    .selectDistinct({ matchId: ratings.matchId })
    .from(ratings)
    .where(inArray(ratings.matchId, [...matchIds]));
  return rows.map((row) => row.matchId);
}

/** The scores themselves, for the matches whose means are out — and for no others. */
async function getVisibleRatingScores(
  publishedMatchIds: readonly string[],
): Promise<VisibleRatingRow[]> {
  if (publishedMatchIds.length === 0) return [];
  return db
    .select({
      matchId: ratings.matchId,
      ratedMemberId: ratings.ratedMemberId,
      score: ratings.score,
    })
    .from(ratings)
    .where(inArray(ratings.matchId, [...publishedMatchIds]));
}

/* -------------------------------------------------------------------------- */
/* The season                                                                 */
/* -------------------------------------------------------------------------- */

export type SeasonStatsResult = SeasonStats & {
  /** Echo of what was asked for, so the screen never has to re-derive it. */
  competitionId: string | null;
  /** Finished matches in the filter, including those with nothing logged. */
  matchesConsidered: number;
  /** Matches in progress, excluded on purpose. */
  liveMatches: number;
  /**
   * Matches whose numbers had to be replayed from the log because the cache had no row for them.
   * Zero once M4 freezes every final whistle; useful while it does not.
   */
  reducedFromLog: number;
};

/**
 * Everything `/stats` shows, for one team. **The same numbers for every reader.**
 *
 * It used to take a `viewerMemberId`, because decision 021 made a season average a view of what the
 * reader had earned: he saw the matches he had rated and a count of the ones he had not. Decision 137
 * removes the premise — nobody reads an individual note but the coach, so a mean is either out or it
 * is not — and with it the parameter, the per-member hidden counts, and the three screens that had to
 * say « d'après les matchs que tu as notés ». A number two teammates can compare is worth more than
 * one each of them had to earn.
 *
 * It also takes **no clock**. It used to take `nowMs`, to work out which rating windows the calendar
 * had shut; decision 138 removed that clause, so whether a season's means are out is now a question
 * about rows only. One round trip fewer, and one fewer thing whose answer changes between two renders
 * of the same page.
 *
 * `cache()`d so a page that renders the team card, the tables and a per-player card costs a single
 * pass — and so `generateMetadata` is free.
 */
export const getSeasonStats = cache(
  async (
    teamId: string,
    filter: StatsFilter = { competitionId: null },
  ): Promise<SeasonStatsResult> => {
    const [{ rows: matchRows, liveCount }, members] = await Promise.all([
      getFinishedMatches(teamId, filter),
      getStatsMembers(teamId),
    ]);

    const matchIds = matchRows.map((match) => match.id);

    const [scores, cached, squad, ratedMatchIds] = await Promise.all([
      getMatchScores(matchIds),
      getCachedStatRows(matchIds),
      getSquadRows(matchIds),
      getRatedMatchIds(matchIds),
    ]);

    /*
     * Publication is decided here, before a single score is read, and it needs nothing but rows: the
     * coach's column and whether a match holds notes at all (decision 139). It used to sit below
     * `resolveMatchStatLines`, because it needed every player's minutes to work out whether every
     * expected set was in — so the second round trip could not start until the whole log had been
     * reduced. Now it starts immediately, and the scores load while the logs are being replayed.
     */
    const publication = seasonRatingPublication({
      matchIds,
      ratedMatchIds,
      matches: matchRows.map(
        (match): MatchPublicationRow => ({
          matchId: match.id,
          publishedAtMs: match.ratingsPublishedAtMs,
        }),
      ),
    });

    // A second round trip, on purpose: publication is decided first, and only then are any scores
    // read. A hidden match's notes never reach this process.
    const visibleRatings = getVisibleRatingScores(publication.publishedMatchIds);

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

    const visibleRatingRows = await visibleRatings;

    const statsMatches: StatsMatch[] = matchRows.map((match) => ({
      id: match.id,
      kickoffAt: match.kickoffAt,
      opponentName: match.opponentName,
      isHome: match.isHome,
      competitionLabel: match.competitionLabel,
      // No entry in the scores map means not a single live event: nothing was ever recorded, which
      // is not the same fact as 0-0 (`aggregate.ts`, rule 7).
      score: scores.get(match.id) ?? null,
    }));

    const season = aggregateSeason({
      members,
      matches: statsMatches,
      lines,
      squad,
      ratings: visibleRatingRows,
      pendingRatingMatches: publication.pendingMatchIds.length,
    });

    return {
      ...season,
      competitionId: filter.competitionId,
      matchesConsidered: matchRows.length,
      liveMatches: liveCount,
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
  teamMemberId: string,
  filter: StatsFilter = { competitionId: null },
): Promise<{ player: SeasonStats["players"][number] | null; season: SeasonStatsResult }> {
  const season = await getSeasonStats(teamId, filter);
  return {
    player: season.players.find((row) => row.teamMemberId === teamMemberId) ?? null,
    season,
  };
}

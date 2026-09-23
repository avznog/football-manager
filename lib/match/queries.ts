import "server-only";

/**
 * Reads about matches. Queries live apart from actions so a Server Component never imports a
 * `"use server"` module just to render a list (`CLAUDE.md`).
 *
 * Everything returned is plain and serialisable: instants leave as ISO strings, counts as
 * numbers. No Drizzle row with a live `Date` on it crosses the RSC boundary.
 */

import { and, asc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { competitions, matchAvailability, matchEvents, matches } from "@/db/schema";
import type { AvailabilityStatus, EntryMode, MatchStatus } from "@/db/schema";
import type { MatchDeletionHolds } from "@/lib/calendar/deletion";

export type MatchRow = {
  id: string;
  teamId: string;
  /** ISO 8601. Rendered through `lib/calendar/time.ts`, which pins Europe/Paris. */
  kickoffAt: string;
  opponentName: string;
  isHome: boolean;
  venue: string | null;
  /** `competitions.id` — what the match form posts back, and what the stats filter is keyed on. */
  competitionId: string;
  /**
   * The word the coach typed for it (decision 107), read through the join rather than mapped from a
   * fixed table of four: a rename on `/equipe` then reaches every screen at once.
   */
  competitionLabel: string;
  periodsCount: number;
  periodMinutes: number;
  status: MatchStatus;
  operatorUserId: string | null;
  /**
   * How the log came to exist: `live` means somebody stood on the touchline with the phone, `retro`
   * means the match was typed up afterwards.
   *
   * A **label, not a behaviour** — `lib/retro/actions.ts` says the same thing where it sets it, and
   * one reducer serves both paths (decision 013). It is here because a reader deserves to know:
   * decision 048 stamps the minutes a coach could not remember, so « 34’ » on a retro match is the
   * app's best guess while the score is exact either way. Every screen that prints a minute a human
   * did not type owes him that sentence.
   */
  entryMode: EntryMode;
};

const MATCH_COLUMNS = {
  id: matches.id,
  teamId: matches.teamId,
  kickoffAt: matches.kickoffAt,
  opponentName: matches.opponentName,
  isHome: matches.isHome,
  venue: matches.venue,
  competitionId: matches.competitionId,
  competitionLabel: competitions.labelFr,
  periodsCount: matches.periodsCount,
  periodMinutes: matches.periodMinutes,
  status: matches.status,
  operatorUserId: matches.operatorUserId,
  entryMode: matches.entryMode,
};

function toMatchRow(row: {
  id: string;
  teamId: string;
  kickoffAt: Date;
  opponentName: string;
  isHome: boolean;
  venue: string | null;
  competitionId: string;
  competitionLabel: string;
  periodsCount: number;
  periodMinutes: number;
  status: MatchStatus;
  operatorUserId: string | null;
  entryMode: EntryMode;
}): MatchRow {
  return { ...row, kickoffAt: row.kickoffAt.toISOString() };
}

/** Every match of the season, oldest first. A team plays a few dozen a year — no pagination. */
export async function getTeamMatches(teamId: string): Promise<MatchRow[]> {
  const rows = await db
    .select(MATCH_COLUMNS)
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(eq(matches.teamId, teamId))
    .orderBy(asc(matches.kickoffAt));

  return rows.map(toMatchRow);
}

/**
 * One match, scoped to the team.
 *
 * The `teamId` is part of the predicate rather than checked afterwards: a match id from another
 * team must come back as "not found", not as a match the caller then forgets to reject.
 */
export async function getMatch(teamId: string, matchId: string): Promise<MatchRow | null> {
  const rows = await db
    .select(MATCH_COLUMNS)
    .from(matches)
    .innerJoin(competitions, eq(competitions.id, matches.competitionId))
    .where(and(eq(matches.id, matchId), eq(matches.teamId, teamId)))
    .limit(1);

  return rows[0] ? toMatchRow(rows[0]) : null;
}

/* -------------------------------------------------------------------------- */
/* Availability                                                               */
/* -------------------------------------------------------------------------- */

export type MatchAnswer = {
  matchId: string;
  teamMemberId: string;
  status: AvailabilityStatus;
  note: string | null;
};

/**
 * Every answer for every match of the team, in one round trip.
 *
 * Thirteen players times a season of matches is a few hundred rows; aggregating them in
 * JavaScript costs less than the four grouped queries it would otherwise take to get counts,
 * the viewer's own answer, and the names behind them.
 */
export async function getTeamMatchAnswers(teamId: string): Promise<MatchAnswer[]> {
  return db
    .select({
      matchId: matchAvailability.matchId,
      teamMemberId: matchAvailability.teamMemberId,
      status: matchAvailability.status,
      note: matchAvailability.note,
    })
    .from(matchAvailability)
    .innerJoin(matches, eq(matches.id, matchAvailability.matchId))
    .where(eq(matches.teamId, teamId));
}

/** The answers for a single match — what the coach's grid and non-responder list are built on. */
export async function getMatchAnswers(matchId: string): Promise<MatchAnswer[]> {
  return db
    .select({
      matchId: matchAvailability.matchId,
      teamMemberId: matchAvailability.teamMemberId,
      status: matchAvailability.status,
      note: matchAvailability.note,
    })
    .from(matchAvailability)
    .where(eq(matchAvailability.matchId, matchId));
}

/* -------------------------------------------------------------------------- */
/* The derived score                                                          */
/* -------------------------------------------------------------------------- */

export type MatchScore = { goalsFor: number; goalsAgainst: number };

/**
 * The score of finished matches, counted straight out of the event log.
 *
 * The score is **never stored** (decision 003), so the calendar has to derive it. This is a plain
 * aggregate, deliberately *not* a second reducer: `lib/match/reducer.ts` owns everything about
 * minutes, who was on the pitch and clean sheets, and the calendar needs none of that — only two
 * numbers per row.
 *
 * Voided events are excluded the same way the reducer excludes them: a `VOID` row points at the
 * mistake through `voids_event_id`, and nothing is ever deleted.
 */
export async function getMatchScores(
  matchIds: readonly string[],
): Promise<Map<string, MatchScore>> {
  if (matchIds.length === 0) return new Map();

  const rows = await db
    .select({
      matchId: matchEvents.matchId,
      goalsFor: sql<string>`count(*) filter (where ${matchEvents.type} in ('GOAL_FOR', 'PENALTY_SCORED'))`,
      goalsAgainst: sql<string>`count(*) filter (where ${matchEvents.type} in ('GOAL_AGAINST', 'OWN_GOAL'))`,
    })
    .from(matchEvents)
    .where(
      and(
        inArray(matchEvents.matchId, [...matchIds]),
        sql`not exists (select 1 from match_events voiding where voiding.voids_event_id = ${matchEvents.id})`,
      ),
    )
    .groupBy(matchEvents.matchId);

  // `count(*)` comes back as a bigint, which postgres.js hands over as a string.
  return new Map(
    rows.map((row) => [
      row.matchId,
      { goalsFor: Number(row.goalsFor), goalsAgainst: Number(row.goalsAgainst) },
    ]),
  );
}

/**
 * Whether anything has ever been logged for this match.
 *
 * The one question the « supprimer » button needs: `match_events` is append-only (decision 003),
 * so a match with a log is corrected, never deleted. `deleteMatch` enforces it; this is what lets
 * the UI avoid offering a button that would silently do nothing.
 */
export async function hasMatchEvents(matchId: string): Promise<boolean> {
  const rows = await db
    .select({ id: matchEvents.id })
    .from(matchEvents)
    .where(eq(matchEvents.matchId, matchId))
    .limit(1);

  return rows.length > 0;
}

/**
 * What would go with this match, for the sentence on the « supprimer » card.
 *
 * Three counts in one round trip, from a match row that is not joined to anything: scalar
 * subqueries, so a match with no answers and no sheet still comes back with zeros rather than no
 * row at all.
 */
export async function getMatchDeletionHolds(matchId: string): Promise<MatchDeletionHolds> {
  const [row] = await db
    .select({
      answers: sql<string>`(select count(*) from match_availability where match_id = ${matchId})`,
      squad: sql<string>`(select count(*) from match_squad where match_id = ${matchId})`,
      lineups: sql<string>`(select count(*) from lineups where match_id = ${matchId})`,
    })
    .from(matches)
    .where(eq(matches.id, matchId));

  // `count(*)` is a bigint, which postgres.js hands over as a string.
  return {
    answers: Number(row?.answers ?? 0),
    squad: Number(row?.squad ?? 0),
    lineups: Number(row?.lineups ?? 0),
  };
}

/** Convenience for the match page, which needs exactly one score. */
export async function getMatchScore(matchId: string): Promise<MatchScore | null> {
  const scores = await getMatchScores([matchId]);
  return scores.get(matchId) ?? null;
}

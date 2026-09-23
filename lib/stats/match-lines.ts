/**
 * One player's numbers for one match — and **the only place in the application that decides where
 * those numbers come from**.
 *
 * `match_player_stats` is a cache, not a source of truth (`docs/DATA_MODEL.md`): it is written by
 * reducing the event log at the final whistle and recomputed from scratch on an amendment. So a
 * season aggregate has two possible sources for any given match:
 *
 *   1. the cached row, when the final whistle has already frozen it — the common case, and the
 *      whole reason the cache exists: thirteen players over a season of matches is one cheap
 *      `select`, with no log to replay;
 *   2. `reduceMatch`, when there is no cached row — a match played before the freezing existed, or
 *      one whose cache a migration dropped.
 *
 * Both paths must produce the same line, which is a property rather than a hope:
 * `match-lines.test.ts` reduces a log, writes what M4 will write, reads it back through
 * `linesFromCache`, and asserts the two are identical. The contract M4 owes this module is
 * therefore exactly one sentence: **the cache holds `toMatchPlayerStats(reduceMatch(...))`, column
 * for column.**
 *
 * Everything here is pure. `lib/stats/queries.ts` fetches, calls `matchesNeedingReduction` to learn
 * which logs it has to load, and hands them back in — so the "cache or reduce" rule lives here,
 * once, and the query layer only obeys it.
 */

import type { SquadRole } from "@/db/schema";
import type { SlotInfo } from "@/lib/match/lineup";
import {
  type MatchEventRecord,
  type PlannedLineup,
  type SquadEntry,
  reduceMatch,
  toMatchPlayerStats,
} from "@/lib/match/reducer";

/* -------------------------------------------------------------------------- */
/* The line                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The per-match, per-player unit every season aggregate is built from. Deliberately the exact
 * column set of `match_player_stats` plus its `matchId`: a line that carried anything the cache
 * cannot store would make the two paths diverge the moment M4 lands.
 *
 * Minutes are whole minutes, as the cache stores them. That is why "played this match" is
 * `minutes > 0` throughout `lib/stats/` and not a flag of its own: the exact `playedMs` the
 * reducer knows does not survive the freeze, so deriving the flag from `minutes` is the only rule
 * that reads the same on both paths. A cameo of under thirty seconds therefore does not count as
 * an appearance — see `aggregate.ts`.
 */
export type MatchStatLine = {
  matchId: string;
  teamMemberId: string;
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  gkMinutes: number;
  cleanMinutes: number;
  concededWhileOn: number;
  gkCleanMinutes: number;
  concededWhileGk: number;
  squadRole: SquadRole | null;
};

/** A row of `match_player_stats`, as the query layer reads it. */
export type CachedStatRow = MatchStatLine;

/** Everything `reduceMatch` needs for one match, gathered by the query layer. */
export type MatchLogInput = {
  events: readonly MatchEventRecord[];
  /** `match_squad`, so supporters and unused substitutes still get a line with their role. */
  squad?: readonly SquadEntry[] | null;
  /** The slot catalogue, without which goalkeeping minutes cannot be known. */
  slots?: readonly SlotInfo[] | null;
  lineups?: readonly PlannedLineup[] | null;
  periodsCount?: number | null;
  periodMinutes?: number | null;
};

/* -------------------------------------------------------------------------- */
/* The two paths                                                              */
/* -------------------------------------------------------------------------- */

/** Deterministic order, so the two paths are comparable field by field and row by row. */
function byMatchThenMember(a: MatchStatLine, b: MatchStatLine): number {
  if (a.matchId !== b.matchId) return a.matchId < b.matchId ? -1 : 1;
  if (a.teamMemberId === b.teamMemberId) return 0;
  return a.teamMemberId < b.teamMemberId ? -1 : 1;
}

/** The cheap path: the cache already holds the reduction. */
export function linesFromCache(rows: readonly CachedStatRow[]): MatchStatLine[] {
  return rows.map((row) => ({ ...row })).sort(byMatchThenMember);
}

/**
 * The fallback path: replay the log. Never called for a match that has a cached row.
 *
 * No `nowMs` is passed on purpose — only finished matches are counted in season statistics, so
 * everything is computed as of the last event and the result is stable rather than creeping
 * forward between two renders.
 */
export function linesFromLog(matchId: string, input: MatchLogInput): MatchStatLine[] {
  const state = reduceMatch(input.events, input.lineups ?? [], {
    slots: input.slots ?? null,
    squad: input.squad ?? null,
    periodsCount: input.periodsCount ?? null,
    periodMinutes: input.periodMinutes ?? null,
  });

  return toMatchPlayerStats(state)
    .map((player) => ({ matchId, ...player }))
    .sort(byMatchThenMember);
}

/* -------------------------------------------------------------------------- */
/* The rule                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Which matches the query layer has to load a log for: those with **no** cached row at all.
 *
 * A match is cached or it is not — the freeze writes every player of the sheet in one transaction,
 * so a single row is proof that the whole match is there. Mixing a partial cache with a partial
 * reduction would double-count, so it is never attempted.
 */
export function matchesNeedingReduction(
  matchIds: readonly string[],
  cached: readonly CachedStatRow[],
): string[] {
  const haveCache = new Set(cached.map((row) => row.matchId));
  return matchIds.filter((id) => !haveCache.has(id));
}

export type ResolvedStatLines = {
  lines: MatchStatLine[];
  /** Matches whose numbers came from the log. Empty once M4 has frozen every match. */
  reducedMatchIds: string[];
  /** Matches with neither a cache nor a log — an empty event log, most likely. */
  emptyMatchIds: string[];
};

/**
 * Cache first, log second, for a whole set of matches at once.
 *
 * `logs` only needs an entry for each id `matchesNeedingReduction` returned; anything else in it
 * is ignored, which is what keeps a cached season from replaying a single event.
 */
export function resolveMatchStatLines(input: {
  matchIds: readonly string[];
  cached: readonly CachedStatRow[];
  logs?: ReadonlyMap<string, MatchLogInput> | null;
}): ResolvedStatLines {
  const wanted = new Set(input.matchIds);
  const lines: MatchStatLine[] = [];
  const reducedMatchIds: string[] = [];
  const emptyMatchIds: string[] = [];

  for (const row of input.cached) {
    if (wanted.has(row.matchId)) lines.push({ ...row });
  }

  for (const matchId of matchesNeedingReduction(input.matchIds, input.cached)) {
    const log = input.logs?.get(matchId);
    if (!log || log.events.length === 0) {
      emptyMatchIds.push(matchId);
      continue;
    }
    lines.push(...linesFromLog(matchId, log));
    reducedMatchIds.push(matchId);
  }

  return { lines: lines.sort(byMatchThenMember), reducedMatchIds, emptyMatchIds };
}

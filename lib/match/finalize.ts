import "server-only";

/**
 * The final whistle: freeze `match_player_stats` and close the match.
 *
 * `match_player_stats` is a **cache, not a source of truth** (`docs/DATA_MODEL.md`). The log stays
 * the only record of what happened; this table exists so that M5 can answer "how many minutes has
 * Karim played this season" with one indexed query instead of replaying every match of the season.
 *
 * Which is why the write is a wholesale replace, never an increment: the rows are recomputed from
 * `reduceMatch` over the entire log, so running this twice — or again after an amendment in M7 —
 * produces exactly the same table. There is no arithmetic here at all; every number comes from
 * `toMatchPlayerStats`, i.e. from the reducer (invariant 2).
 */

import { and, eq } from "drizzle-orm";

import { db } from "@/db/client";
import { matchPlayerPositions, matchPlayerStats, matches } from "@/db/schema";
import { getLiveMatch, type LiveMatch } from "./live";
import { reduceLive } from "./presenter";
import { toMatchPlayerPositions, toMatchPlayerStats } from "./reducer";

export type FinalizeResult = {
  /** False when the log holds no final whistle: nothing is frozen and the status is untouched. */
  finished: boolean;
  /** How many `match_player_stats` rows the match now has. */
  players: number;
  /** How many `match_player_positions` rows (decision 160). */
  positions: number;
};

/**
 * Freeze a match whose log says it is over.
 *
 * `nowMs` is deliberately omitted from the reduction: a finished match is computed as of its last
 * event, so the frozen minutes are the minutes that were played and not the minutes that have
 * elapsed since somebody left the tab open.
 */
export async function finalizeMatch(live: LiveMatch): Promise<FinalizeResult> {
  const state = reduceLive(live, [], null);
  if (!state.finished) return { finished: false, players: 0, positions: 0 };

  const rows = toMatchPlayerStats(state).map((row) => ({
    ...row,
    matchId: live.match.id,
    computedAt: new Date(),
  }));
  const positionRows = toMatchPlayerPositions(state).map((row) => ({
    ...row,
    matchId: live.match.id,
  }));

  await db.transaction(async (tx) => {
    // Delete then insert rather than upsert: a player who has disappeared from the log (their only
    // appearance was voided) must disappear from the cache too, and an upsert would leave them.
    await tx.delete(matchPlayerStats).where(eq(matchPlayerStats.matchId, live.match.id));
    if (rows.length > 0) await tx.insert(matchPlayerStats).values(rows);
    // The per-position cache is the same reduction cut finer (decision 160): same writer, same
    // transaction, same wholesale replace, so the two tables can never describe different logs.
    await tx.delete(matchPlayerPositions).where(eq(matchPlayerPositions.matchId, live.match.id));
    if (positionRows.length > 0) await tx.insert(matchPlayerPositions).values(positionRows);

    await tx
      .update(matches)
      .set({ status: "finished" })
      .where(and(eq(matches.id, live.match.id), eq(matches.teamId, live.match.teamId)));
  });

  return { finished: true, players: rows.length, positions: positionRows.length };
}

/**
 * Freeze a match by id, loading it first.
 *
 * Used in two places: right after the final whistle lands in the log, and defensively when game
 * mode opens a match whose log is finished but whose `status` is not — which is what a device that
 * died between the POST and the response leaves behind.
 */
export async function finalizeMatchById(teamId: string, matchId: string): Promise<FinalizeResult> {
  const live = await getLiveMatch(teamId, matchId);
  if (!live) return { finished: false, players: 0, positions: 0 };
  return finalizeMatch(live);
}

import "server-only";

/**
 * Reads about a team's competitions. Plain serialisable objects only, no Drizzle row with a live
 * `Date` on it crossing the RSC boundary (`CLAUDE.md`).
 *
 * The match count comes back with every row because three screens need it: the card on `/equipe`
 * counts what a deletion would cost (decision 098), the delete action re-counts before refusing, and
 * the stats filter has no business offering a competition nothing was played in.
 */

import { asc, eq, sql } from "drizzle-orm";

import { db } from "@/db/client";
import { competitions, matches } from "@/db/schema";
import type { CompetitionSummary } from "./options";

/** Every competition of the team, archived ones included, each with what points at it. */
export async function getTeamCompetitions(teamId: string): Promise<CompetitionSummary[]> {
  const rows = await db
    .select({
      id: competitions.id,
      labelFr: competitions.labelFr,
      sort: competitions.sort,
      archivedAt: competitions.archivedAt,
      matchCount: sql<string>`count(${matches.id})`,
    })
    .from(competitions)
    .leftJoin(matches, eq(matches.competitionId, competitions.id))
    .where(eq(competitions.teamId, teamId))
    .groupBy(competitions.id)
    .orderBy(asc(competitions.sort), asc(competitions.labelFr));

  return rows.map((row) => ({
    id: row.id,
    labelFr: row.labelFr,
    sort: row.sort,
    archived: row.archivedAt !== null,
    matchCount: Number(row.matchCount),
  }));
}

/**
 * One competition of one team, or null.
 *
 * The `teamId` is inside the predicate rather than checked afterwards: a competition id belonging to
 * another team must come back as « does not exist », not as a row the caller then forgets to reject.
 */
export async function getTeamCompetition(
  teamId: string,
  competitionId: string,
): Promise<CompetitionSummary | null> {
  const all = await getTeamCompetitions(teamId);
  return all.find((competition) => competition.id === competitionId) ?? null;
}

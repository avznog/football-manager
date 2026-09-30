import "server-only";

/**
 * Which shape the team actually plays — the read behind `/stats/equipe-type`.
 *
 * The « équipe type » needs seven posts before it can rank anybody into them, and the only
 * non-arbitrary source for those seven is the formation the team has played most. Hard-coding a
 * 1-3-2-1 would publish a tactical opinion as a fact; picking the first row of `formations` would
 * publish an insertion order as one.
 *
 * Same contract as `lib/stats/queries.ts`: this module **fetches and counts**, it decides nothing
 * about players, the `teamId` is inside the predicate, and everything that comes back is plain and
 * serialisable — the kickoff instant leaves as an ISO string, so no Drizzle row with a live `Date`
 * on it crosses the RSC boundary (`CLAUDE.md`). The ranking itself is `lib/stats/best-seven.ts`,
 * which is pure and takes these slots as input.
 *
 * ## What counts as "played in this formation"
 *
 * A composition is a `lineups` row — the table is called `lineups`, the UI calls it « composition »
 * (decision 012 keeps the two vocabularies apart). A formation counts for a match when **any**
 * composition of that match uses it, and each match counts **once** for it however many
 * compositions it appears in: the figure the screen prints is « utilisée dans N matchs », so the
 * denominator has to be matches, not rows. A mid-match shape change therefore credits both
 * formations with that match, which is the truth — the team played both.
 *
 * Only **finished** matches in the filter are considered, for the reason `getFinishedMatches` gives:
 * a live match is still moving and a scheduled one has not happened, so counting either would make
 * the pitch's seven posts change under the reader between two refreshes.
 *
 * An unapplied composition still counts. It is tempting to require `applied_event_id` — decision 006
 * is what makes "planned" and "actually happened" distinguishable, and only an applied composition is
 * tied to the append-only log. But decision 013 exists precisely because matches get played without
 * game mode ever being opened, and on those Sundays the drawn composition is the only record of the
 * shape the team lined up in; demanding a confirmation event would hand the « équipe type » an empty
 * state for a whole season of real football. So both count, and `appliedMatches` travels alongside so
 * the screen can say how much of the figure game mode witnessed rather than leave it implied.
 */

import { and, eq } from "drizzle-orm";
import { cache } from "react";

import { db } from "@/db/client";
import { lineups, matches } from "@/db/schema";
import { getFormations, type FormationSlotRow } from "@/lib/formation/queries";

import { byUsage, type RankableFormation } from "./formation-usage.rank";
import type { StatsFilter } from "./queries";

/* -------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Built on `RankableFormation` rather than repeating its six fields, so the compiler — and not a
 * reader's memory — guarantees that what the screen shows is what the comparator ranked. `matches`
 * in particular is never returned without the shape it counts: « 2-3-1 » alone is a claim with a
 * hidden denominator (`aggregate.ts`, rule 2, applied to a label rather than to a rate).
 */
export type FormationUsage = RankableFormation & {
  /** The coach's name for it, e.g. « Losange ». The `label` is the shape, this is the name. */
  name: string;
  /** The seven posts, `sort` ascending — exactly what `best-seven.ts` fills. */
  slots: FormationSlotRow[];
};

export type FormationUsageResult = {
  /**
   * The shape to build the seven on. **Null when not one composition was ever recorded** over the
   * filtered matches: the screen has an empty state for that, and any other answer here would be a
   * guess dressed as a measurement.
   */
  mostUsed: FormationUsage | null;
  /**
   * Every formation this team may use — the built-in templates and its own — in `getFormations`'
   * order, so the override picker reads the way the formation picker does everywhere else in the
   * app. Ordering it by usage instead would make the same list two different lists.
   */
  formations: FormationUsage[];
  /** Finished matches in the filter: the denominator behind « utilisée dans N matchs sur M ». */
  matchesConsidered: number;
  /**
   * Finished matches with no composition at all — retro-entered, or played before anybody drew one
   * (decision 013). Surfaced rather than subtracted silently, so the reader can see that the winning
   * shape is a majority of what was *recorded*, not of what was played.
   */
  matchesWithoutComposition: number;
  /** Echo of what was asked for, so the screen never re-derives it. Mirrors `SeasonStatsResult`. */
  competitionId: string | null;
};

/* -------------------------------------------------------------------------- */
/* The query                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * One row per composition of a finished match in the filter. Deliberately not a `group by` in SQL:
 * the counting unit is the *match*, so the de-duplication has to happen over match ids anyway, and a
 * season holds a few dozen compositions of seven slots — the set arithmetic is cheaper to read in
 * JavaScript than a `count(distinct)` per formation would be to maintain.
 */
async function getCompositionRows(teamId: string, filter: StatsFilter) {
  const competitionPredicate = filter.competitionId
    ? eq(matches.competitionId, filter.competitionId)
    : undefined;

  return db
    .select({
      formationId: lineups.formationId,
      matchId: lineups.matchId,
      kickoffAt: matches.kickoffAt,
      appliedEventId: lineups.appliedEventId,
    })
    .from(lineups)
    .innerJoin(matches, eq(matches.id, lineups.matchId))
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "finished"), competitionPredicate));
}

/**
 * The finished matches the filter holds — the denominator. Listed rather than counted, so the
 * matches with no composition can be subtracted by id instead of by a `count(*)` that a second
 * predicate could quietly stop agreeing with.
 */
async function getFinishedMatchIds(teamId: string, filter: StatsFilter): Promise<string[]> {
  const competitionPredicate = filter.competitionId
    ? eq(matches.competitionId, filter.competitionId)
    : undefined;

  const rows = await db
    .select({ id: matches.id })
    .from(matches)
    .where(and(eq(matches.teamId, teamId), eq(matches.status, "finished"), competitionPredicate));

  return rows.map((row) => row.id);
}

/**
 * The formation the team has played most, plus the catalogue for the override picker.
 *
 * `cache()`d like `getSeasonStats`, and for the same reason: `/stats/equipe-type` reads the shape
 * once for its title, once for the pitch and once in `generateMetadata`, and all three must agree
 * within a render.
 */
export const getFormationUsage = cache(
  async (
    teamId: string,
    filter: StatsFilter = { competitionId: null },
  ): Promise<FormationUsageResult> => {
    const [catalogue, compositionRows, finishedMatchIds] = await Promise.all([
      getFormations(teamId),
      getCompositionRows(teamId, filter),
      getFinishedMatchIds(teamId, filter),
    ]);

    const matchesByFormation = new Map<string, Set<string>>();
    const appliedByFormation = new Map<string, Set<string>>();
    const lastUsedByFormation = new Map<string, string>();
    const matchesWithComposition = new Set<string>();

    for (const row of compositionRows) {
      matchesWithComposition.add(row.matchId);

      const played = matchesByFormation.get(row.formationId) ?? new Set<string>();
      played.add(row.matchId);
      matchesByFormation.set(row.formationId, played);

      if (row.appliedEventId !== null) {
        const applied = appliedByFormation.get(row.formationId) ?? new Set<string>();
        applied.add(row.matchId);
        appliedByFormation.set(row.formationId, applied);
      }

      const kickoffAt = row.kickoffAt.toISOString();
      const seen = lastUsedByFormation.get(row.formationId);
      if (seen === undefined || kickoffAt > seen) {
        lastUsedByFormation.set(row.formationId, kickoffAt);
      }
    }

    // Counted against the catalogue, not against the composition rows: a composition can only point
    // at a built-in or at one of this team's own formations, so every id here has an entry. If a
    // deletion ever broke that, the shape would be missing its name and its seven slots — better to
    // leave it out of a picker than to render a formation nobody can label.
    const formations: FormationUsage[] = catalogue.map((formation) => ({
      formationId: formation.id,
      name: formation.name,
      label: formation.label,
      isBuiltin: formation.isBuiltin,
      matches: matchesByFormation.get(formation.id)?.size ?? 0,
      appliedMatches: appliedByFormation.get(formation.id)?.size ?? 0,
      lastUsedAt: lastUsedByFormation.get(formation.id) ?? null,
      slots: formation.slots,
    }));

    const ranked = [...formations].sort(byUsage);
    const winner = ranked[0];

    return {
      // `ranked[0]` is only the winner if it was played at all: with an empty season every formation
      // ties at zero and the sort still has to return something first (rule 1 of `aggregate.ts`
      // again — nothing recorded is `null`, not the alphabetically luckiest shape).
      mostUsed: winner && winner.matches > 0 ? winner : null,
      formations,
      matchesConsidered: finishedMatchIds.length,
      matchesWithoutComposition: finishedMatchIds.filter(
        (matchId) => !matchesWithComposition.has(matchId),
      ).length,
      competitionId: filter.competitionId,
    };
  },
);

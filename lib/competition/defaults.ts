/**
 * The competitions a brand-new team starts with.
 *
 * Until decision 107 these four were a Postgres enum, and they are still the right *starting point*:
 * an amateur 7-a-side team plays a league, a cup, friendlies and the odd tournament. The difference
 * is that they are now rows the coach may rename (« Championnat D3 »), extend (« Coupe du Crédit
 * Mutuel ») or retire, on `/equipe`.
 *
 * Pure, and the single source of that list: `lib/team/actions.ts` (a team created in the app),
 * `db/seed-reference.ts` (bootstrap and the demo season) and `e2e/fixtures/seed.ts` all read it.
 * The one unavoidable copy is `db/migrations/0002_tough_hydra.sql`, which backfilled the teams that
 * predate the table — a migration is frozen and may not import a file that can change under it.
 */

export const DEFAULT_COMPETITIONS = [
  { labelFr: "Championnat", sort: 0 },
  { labelFr: "Coupe", sort: 1 },
  { labelFr: "Amical", sort: 2 },
  { labelFr: "Tournoi", sort: 3 },
] as const;

/** The label a match form lands on when nothing else is known: the league, the common case. */
export const DEFAULT_COMPETITION_LABEL = DEFAULT_COMPETITIONS[0].labelFr;

export type CompetitionInsert = {
  teamId: string;
  labelFr: string;
  sort: number;
};

/** The rows to insert for a team that has none — `onConflictDoNothing` makes it idempotent. */
export function defaultCompetitionRows(teamId: string): CompetitionInsert[] {
  return DEFAULT_COMPETITIONS.map((competition) => ({
    teamId,
    labelFr: competition.labelFr,
    sort: competition.sort,
  }));
}

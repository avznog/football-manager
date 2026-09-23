/**
 * Statistiques — screen 11 of `docs/PLAN.md`.
 *
 * Everything on this page is derived: the score of a match comes from its event log, a player's
 * minutes from the reducer, a rate from `présent / pointé`. Nothing is a stored total that could
 * drift away from the log (invariant 2 in `CLAUDE.md`), and nothing is invented: a number nobody has
 * yet reads « pas encore de données » rather than `0`.
 *
 * Read-only, so no new permission: any member of the team may read it (`team:read`, decision 002),
 * and the layout guard has already refused anyone with no team. The one thing that differs between
 * two readers is the ratings, which decision 007 gates per match — see `lib/stats/ratings.ts`.
 */

import { EmptyState } from "@/components/ui/empty-state";
import { requireTeamContext } from "@/lib/auth/dal";
import { competitionLabelOf, statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { MIN_RATINGS, isPlayerSortKey, sortPlayers } from "@/lib/stats/aggregate";
import { formatRating, matchCount, plural } from "@/lib/stats/format";
import { getSeasonStats } from "@/lib/stats/queries";

import { Attendance } from "./_components/attendance";
import {
  COMPETITION_PARAM,
  CompetitionFilter,
  DEFAULT_SORT,
  SORT_PARAM,
  type StatsQuery,
} from "./_components/filters";
import { Keepers } from "./_components/keepers";
import { Leaderboard } from "./_components/leaderboard";
import { PlayerList } from "./_components/player-list";
import { TeamSummary } from "./_components/team-summary";

export const metadata = { title: "Stats" };

/**
 * A hand-typed or stale query string must degrade to "everything", never to an error.
 *
 * Which now includes an id that named a competition somebody has since deleted or that belongs to
 * another team: it is only kept if it is in this team's own list.
 */
function parseCompetitionId(
  value: string | string[] | undefined,
  competitions: readonly { id: string }[],
): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  return competitions.find((competition) => competition.id === first)?.id ?? null;
}

export default async function StatsPage({ searchParams }: PageProps<"/stats">) {
  const [{ team }, params] = await Promise.all([requireTeamContext(), searchParams]);

  const competitions = statsFilterOptions(await getTeamCompetitions(team.id));

  const rawSort = params[SORT_PARAM];
  const sortValue = Array.isArray(rawSort) ? rawSort[0] : rawSort;
  const query: StatsQuery = {
    competitionId: parseCompetitionId(params[COMPETITION_PARAM], competitions),
    sort: isPlayerSortKey(sortValue) ? sortValue : DEFAULT_SORT,
  };

  const stats = await getSeasonStats(team.id, team.membershipId, {
    competitionId: query.competitionId,
  });

  // The coach's own word for it, lowercased into the sentence — « Saison en cours, championnat D3 ».
  const filterLabel = competitionLabelOf(competitions, query.competitionId);
  const scopeLabel = filterLabel?.toLocaleLowerCase("fr-FR") ?? "toutes compétitions";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Statistiques</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            Saison en cours, {scopeLabel} · {matchCount(stats.matchesConsidered)} terminé
            {stats.matchesConsidered > 1 ? "s" : ""}
          </p>
        </div>
        <CompetitionFilter query={query} competitions={competitions} />
      </header>

      {/* Nothing at all: one honest empty state rather than eight cards full of dashes. */}
      {stats.isEmpty ? (
        <EmptyState
          title="Pas encore de statistiques"
          description={
            filterLabel === null
              ? "Dès qu’un match sera terminé ou qu’une séance sera pointée, les buts, les minutes et les présences apparaîtront ici."
              : `Aucun match terminé en ${scopeLabel}, et aucune note à afficher. Choisis « Toutes » pour voir la saison entière.`
          }
        />
      ) : (
        <SeasonCards query={query} stats={stats} />
      )}
    </div>
  );
}

/** The season itself, once there is something to show. */
function SeasonCards({
  query,
  stats,
}: {
  query: StatsQuery;
  stats: Awaited<ReturnType<typeof getSeasonStats>>;
}) {
  /**
   * A filter that excludes every match leaves nothing but the trainings, which carry no competition
   * (decision 020). Saying that once beats stacking a bilan, three leaderboards and a table of
   * dashes that all mean the same thing.
   */
  if (stats.matchesConsidered === 0) {
    return (
      <>
        <EmptyState
          title="Aucun match terminé dans cette sélection"
          description={
            query.competitionId === null
              ? "Les statistiques de match arriveront après le premier coup de sifflet final."
              : "Change de compétition, ou choisis « Toutes » pour voir la saison entière."
          }
        />
        {stats.liveMatches > 0 ? (
          <p className="text-sm text-ink-muted">
            {matchCount(stats.liveMatches)} en cours{" "}
            {stats.liveMatches > 1 ? "sont exclus" : "est exclu"} : ses minutes bougent encore.
          </p>
        ) : null}
        <Attendance
          players={stats.players}
          markedSessions={stats.markedSessions}
          filtered={query.competitionId !== null}
        />
      </>
    );
  }

  return (
    <>
      <TeamSummary
        team={stats.team}
        matchesConsidered={stats.matchesConsidered}
        liveMatches={stats.liveMatches}
      />

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Classements</h2>
        <Leaderboard
          title="Meilleurs buteurs"
          entries={stats.topScorers}
          valueLabel={(entry) => plural(entry.value, "but")}
          emptyMessage="Aucun but attribué à un joueur sur cette sélection. Un but peut être saisi sans buteur : le score de l’équipe reste juste."
          note={
            stats.team.unattributedGoals > 0
              ? `${plural(stats.team.unattributedGoals, "but")} de l’équipe sans buteur renseigné, donc absent${stats.team.unattributedGoals > 1 ? "s" : ""} de ce classement.`
              : undefined
          }
        />
        <Leaderboard
          title="Meilleurs passeurs"
          entries={stats.topAssists}
          valueLabel={(entry) => plural(entry.value, "passe décisive", "passes décisives")}
          emptyMessage="Aucune passe décisive saisie sur cette sélection. Elle est optionnelle au moment du but."
        />
        <Leaderboard
          title="Meilleures notes"
          description={`Moyenne reçue, à partir de ${plural(MIN_RATINGS, "note")}`}
          entries={stats.topRated}
          valueLabel={(entry) => formatRating(entry.value)}
          countLabel={(entry) => plural(entry.count, "note")}
          emptyMessage={
            // A masked average and a missing average are two different facts, and saying « personne
            // n’a été noté » to somebody who simply has not voted yet would be a lie.
            stats.hiddenRatingMatches > 0
              ? "Aucune moyenne à afficher pour l’instant."
              : `Personne n’a encore reçu ${plural(MIN_RATINGS, "note")} : une moyenne sur une ou deux notes ne veut rien dire, donc le classement attend.`
          }
          note={
            stats.hiddenRatingMatches > 0
              ? `${matchCount(stats.hiddenRatingMatches)} ${stats.hiddenRatingMatches > 1 ? "sont exclus" : "est exclu"} de ces moyennes : tu étais sur la feuille et tu n’as pas encore noté tes coéquipiers. Tes notes débloquent les leurs.`
              : undefined
          }
        />
      </div>

      <PlayerList
        players={sortPlayers(stats.players, query.sort)}
        query={query}
        markedSessions={stats.markedSessions}
        hiddenRatingMatches={stats.hiddenRatingMatches}
      />

      <div className="space-y-4">
        <h2 className="text-base font-semibold text-ink">Détail</h2>
        <Keepers keepers={stats.keepers} />
        <Attendance
          players={stats.players}
          markedSessions={stats.markedSessions}
          filtered={query.competitionId !== null}
        />
      </div>
    </>
  );
}

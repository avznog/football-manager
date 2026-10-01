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

import Link from "next/link";
import { Suspense, type ReactNode } from "react";

import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireTeamContext } from "@/lib/auth/dal";
import { competitionLabelOf, statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { MIN_RATINGS, isPlayerSortKey, sortPlayers } from "@/lib/stats/aggregate";
import {
  DEFAULT_CRITERION,
  DEFAULT_DIRECTION,
  equipeTypeHref,
} from "@/lib/stats/best-seven-copy";
import {
  formatRating,
  hiddenRatingMatchesNoteFr,
  matchCount,
  plural,
} from "@/lib/stats/format";
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

  /**
   * Started here and awaited twice below, rather than awaited here.
   *
   * This is the slowest query in the app — 844 ms from tap to heading on an emulated 4G phone
   * against 342–367 ms for the three other tabs, its own aggregation and not the shared auth prefix
   * — and holding the whole document for it is what made the tab read as a tap that had missed.
   * Awaited inside two `<Suspense>` boundaries instead, so the title, the scope and the competition
   * chips are on screen while it runs and the chips stay tappable. One promise handed to both of
   * them rather than two calls: `getSeasonStats` is `cache()`d, so two calls would also cost one
   * pass, but a single promise says that in the code instead of relying on it.
   */
  const stats = getSeasonStats(team.id, team.membershipId, {
    competitionId: query.competitionId,
  });

  // The coach's own word for it, lowercased into the sentence — « Saison en cours, championnat D3 ».
  const filterLabel = competitionLabelOf(competitions, query.competitionId);
  const scopeLabel = filterLabel?.toLocaleLowerCase("fr-FR") ?? "toutes compétitions";

  /**
   * Keyed on the filter so a chip tap shows the fallback again.
   *
   * Without a key, React keeps the previous competition's figures on screen until the new ones
   * arrive — under a different chip, which now has `aria-current`. Two chips disagreeing about what
   * the numbers below them count is the one thing this screen may not do.
   */
  const boundaryKey = query.competitionId ?? "toutes";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink">Statistiques</h1>
          {/* The scope is known before the count is, so it is said before the count is. The fallback
              is the same sentence minus its second half, never a placeholder figure. */}
          <Suspense
            key={`scope-${boundaryKey}`}
            fallback={<ScopeLine>Saison en cours, {scopeLabel}</ScopeLine>}
          >
            <ScopeWithCount stats={stats} scopeLabel={scopeLabel} />
          </Suspense>
        </div>
        <CompetitionFilter query={query} competitions={competitions} />
      </header>

      <Suspense key={`season-${boundaryKey}`} fallback={<SeasonSkeleton />}>
        <Season query={query} stats={stats} filterLabel={filterLabel} scopeLabel={scopeLabel} />
      </Suspense>
    </div>
  );
}

type SeasonStats = Awaited<ReturnType<typeof getSeasonStats>>;

/** The line under the title, in both its states, so the two cannot drift apart. */
function ScopeLine({ children }: { children: ReactNode }) {
  return <p className="mt-0.5 text-sm text-ink-muted">{children}</p>;
}

async function ScopeWithCount({
  stats,
  scopeLabel,
}: {
  stats: Promise<SeasonStats>;
  scopeLabel: string;
}) {
  const { matchesConsidered } = await stats;
  return (
    <ScopeLine>
      Saison en cours, {scopeLabel} · {matchCount(matchesConsidered)} terminé
      {matchesConsidered > 1 ? "s" : ""}
    </ScopeLine>
  );
}

/** Everything that needs the season itself. */
async function Season({
  query,
  stats,
  filterLabel,
  scopeLabel,
}: {
  query: StatsQuery;
  stats: Promise<SeasonStats>;
  filterLabel: string | null;
  scopeLabel: string;
}) {
  const season = await stats;

  // Nothing at all: one honest empty state rather than eight cards full of dashes.
  if (season.isEmpty) {
    return (
      <EmptyState
        title="Pas encore de statistiques"
        description={
          filterLabel === null
            ? "Dès qu’un match sera terminé ou qu’une séance sera pointée, les buts, les minutes et les présences apparaîtront ici."
            : `Aucun match terminé en ${scopeLabel}, et aucune note à afficher. Choisis « Toutes » pour voir la saison entière.`
        }
      />
    );
  }

  return <SeasonCards query={query} stats={season} />;
}

/**
 * The first `<Suspense>` fallback in this repository, and therefore the shape every later one should
 * copy: card outlines, bars, and not one character of content.
 *
 * Every figure on this screen is a claim about a season somebody played, so a skeleton holding « 0 »,
 * a dash or a plausible row would be the defect every wave of this audit found — a screen stating
 * something it does not know — in the one place the reader cannot even dismiss it. The bars are the
 * only thing that is true while the query runs: there will be cards here, about this many.
 *
 * `animate-pulse` is the one piece of motion, and it is functional rather than decorative: it is what
 * separates « loading » from « three empty cards ». Under `prefers-reduced-motion` the block in
 * `app/globals.css` freezes it at full opacity, which still reads as a shape and not as data.
 */
function SeasonSkeleton() {
  return (
    <div role="status" className="space-y-4">
      <span className="sr-only">Chargement des statistiques…</span>
      {[0, 1, 2].map((card) => (
        <Card key={card} className="animate-pulse">
          <div className="space-y-3">
            <div className="h-4 w-1/3 rounded-full bg-surface-2" />
            <div className="h-3 rounded-full bg-surface-2" />
            <div className="h-3 w-5/6 rounded-full bg-surface-2" />
          </div>
        </Card>
      ))}
    </div>
  );
}

/** The season itself, once there is something to show. */
function SeasonCards({
  query,
  stats,
}: {
  query: StatsQuery;
  stats: SeasonStats;
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

      {/* The one place the season's figures turn into a claim about next Sunday. Kept as a link
          rather than a section of this page: it needs its own criterion, direction and shape in the
          URL, and four more chips here would bury the season under its own controls. The competition
          filter travels with it so the two screens agree on what they are talking about. */}
      <Link
        href={equipeTypeHref({
          competitionId: query.competitionId,
          criterion: DEFAULT_CRITERION,
          direction: DEFAULT_DIRECTION,
          formationId: null,
        })}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">L’équipe type</span>
          <span className="block text-xs text-ink-muted">
            La meilleure — ou la pire — équipe possible sur un critère, à ta forme la plus jouée
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-subtle">
          →
        </span>
      </Link>

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
          // Shared with `/stats/equipe-type`, which builds a seven out of these same averages and
          // owes the reader the same sentence about them (decision 021). Same words, one source.
          note={hiddenRatingMatchesNoteFr(stats.hiddenRatingMatches) ?? undefined}
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

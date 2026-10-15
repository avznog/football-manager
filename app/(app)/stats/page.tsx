/**
 * Statistiques — screen 11 of `docs/PLAN.md`.
 *
 * Everything on this page is derived: the score of a match comes from its event log, a player's
 * minutes from the reducer. Nothing is a stored total that could
 * drift away from the log (invariant 2 in `CLAUDE.md`), and nothing is invented: a number nobody has
 * yet reads « pas encore de données » rather than `0`.
 *
 * Read-only, so no new permission: any member of the team may read it (`team:read`, decision 002),
 * and the layout guard has already refused anyone with no team. **Nothing on it differs between two
 * readers.** That used to be false — decision 021 gated the ratings per viewer, so two teammates saw
 * two « meilleures notes » and neither could tell which was the team's. Decision 137 publishes a
 * match's means to everybody at once or to nobody, so there is one answer and this page prints it.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { EmptyState } from "@/components/ui/empty-state";
import { requireTeamContext } from "@/lib/auth/dal";
import { competitionLabelOf, statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { MIN_RATED_MATCHES, isPlayerSortKey, sortPlayers } from "@/lib/stats/aggregate";
import {
  DEFAULT_SEVEN,
  equipeTypeHref,
} from "@/lib/stats/best-seven-copy";
import {
  ASSIST_WORDS_FR,
  GOAL_WORDS_FR,
  concededCountRowFr,
  formatMinutes,
  formatRating,
  matchCount,
  pendingRatingMatchesNoteFr,
  plural,
} from "@/lib/stats/format";
import { getSeasonStats } from "@/lib/stats/queries";

import {
  COMPETITION_PARAM,
  CompetitionFilter,
  DEFAULT_SORT,
  SORT_PARAM,
  type StatsQuery,
} from "./_components/filters";
import { ImpactByPosition } from "./_components/impact";
import { Leaderboard } from "./_components/leaderboard";
import { PlayerList } from "./_components/player-list";
import { EventRateBoard, RateBoard } from "./_components/rate-board";
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

  const stats = await getSeasonStats(team.id, { competitionId: query.competitionId });

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
              ? "Dès qu’un match sera terminé, les buts, les minutes et les notes apparaîtront ici."
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
   * A filter that excludes every match leaves nothing to show. Saying that once beats stacking a
   * bilan, three leaderboards and a table of dashes that all mean the same thing.
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
          rather than a section of this page: it needs its own choice of seven in the URL, and four more chips here would bury the season under its own controls. The competition
          filter travels with it so the two screens agree on what they are talking about. */}
      <Link
        href={equipeTypeHref({ competitionId: query.competitionId, seven: DEFAULT_SEVEN })}
        className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-surface px-4 py-3 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <span className="min-w-0">
          <span className="block font-semibold text-ink">L’équipe type</span>
          <span className="block text-xs text-ink-muted">
            Offensive, défensive, le 7 de légende ou aux notes, aux postes indiqués par le coach
          </span>
        </span>
        <span aria-hidden="true" className="shrink-0 text-ink-subtle">
          →
        </span>
      </Link>

      {/* Grouped the way the cahier lists them — Attaque · Défense · Gardiens · Temps de jeu · Impact par
          poste — then the notes, then the whole squad. One giant table does not fit a phone; five short
          sections with a heading each do (decision 162).

          **Inside a section: the totals first, then the frequencies** (decision 195). « Meilleurs
          buteurs » then « Qui marque le plus souvent »; « Buts encaissés sur le terrain » then « Qui
          encaisse le moins souvent sur le terrain ». Two cards of each pair would otherwise read as two
          answers to one question — and the heading is where the reader is told which: a plain noun
          heads a count, « Qui … le plus / le moins souvent » heads a rate, everywhere on the page. */}
      <Section title="Attaque">
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
        {/* His own goals over his own outfield minutes (decision 197, narrowed by 203) — not the
            team's while he was on, which is the « Impact par poste » card further down. The subtitle
            says « sur le terrain » because the time in goal is out of the denominator. */}
        <EventRateBoard
          title="Qui marque le plus souvent"
          description="Du plus fréquent au moins fréquent : 1 but marqué toutes les X minutes sur le terrain, hors temps au goal"
          board={stats.scoringRate}
          words={GOAL_WORDS_FR}
          emptyMessage="Sur cette sélection, personne n’a encore de minutes sur le terrain."
        />
        <EventRateBoard
          title="Qui fait marquer le plus souvent"
          description="Du plus fréquent au moins fréquent : 1 passe décisive toutes les X minutes sur le terrain, hors temps au goal"
          board={stats.assistRate}
          words={ASSIST_WORDS_FR}
          emptyMessage="Sur cette sélection, personne n’a encore de minutes sur le terrain."
        />
      </Section>

      <Section title="Défense">
        <Leaderboard
          title="Buts encaissés sur le terrain"
          /* Fewest first since decision 195, and the heading says so: a list of totals that starts at
             the top is read as a ranking of the worst, and this one is the opposite. */
          description="Du total le plus faible au plus élevé : les buts pris pendant qu’il jouait, hors temps au goal"
          entries={stats.topConcededOutfield}
          valueLabel={(entry) => concededCountRowFr(entry.value, entry.count).value}
          /* The rate under the total, with the minutes it is a rate over (decision 184). The card is
             ranked on the count above — « qui encaisse le moins souvent » below ranks on the rate. */
          countLabel={(entry) => concededCountRowFr(entry.value, entry.count).detail}
          emptyMessage="Personne n’a encore de minutes de joueur de champ sur cette sélection."
        />
        {/* « … sur le terrain » is in the description and not in the heading: a `Card` title is one
            truncated line, and at 390 px the longer wording came out as « Qui encaisse le moins
            souvent sur le te… ». The section is « Défense » and the keeper card carries « au goal »,
            so the pair still reads unambiguously. */}
        <RateBoard
          title="Qui encaisse le moins souvent"
          description="Joueur de champ, du plus rare au plus fréquent : 1 but encaissé toutes les X minutes sur le terrain"
          board={stats.outfieldConcededRate}
          emptyMessage="Personne n’a encore de minutes de joueur de champ sur cette sélection."
        />
      </Section>

      <Section title="Gardiens">
        <Leaderboard
          title="Buts encaissés au goal"
          description="Du total le plus faible au plus élevé : les buts pris pendant qu’il était dans les buts"
          entries={stats.topConcededGk}
          valueLabel={(entry) => concededCountRowFr(entry.value, entry.count).value}
          countLabel={(entry) => concededCountRowFr(entry.value, entry.count).detail}
          emptyMessage="Personne n’a encore joué dans les buts sur cette sélection."
        />
        <RateBoard
          title="Qui encaisse le moins souvent au goal"
          description="Du plus rare au plus fréquent : 1 but encaissé toutes les X minutes dans les buts"
          board={stats.keeperConcededRate}
          emptyMessage="Personne n’a encore joué dans les buts sur cette sélection."
        />
      </Section>

      {/* Three populations, three lists (decision 196): the whole time played, then the two halves it
          is made of. A player with no minute in one of them is not in its list at all. */}
      <Section title="Temps de jeu">
        <Leaderboard
          title="Toutes les minutes jouées"
          description="Dans les buts et sur le terrain, additionnées"
          entries={stats.topMinutes}
          valueLabel={(entry) => formatMinutes(entry.value)}
          countLabel={(entry) => matchCount(entry.count)}
          emptyMessage="Personne n’a encore de minutes sur cette sélection."
        />
        <Leaderboard
          title="Minutes jouées sur le terrain"
          description="Hors temps au goal"
          entries={stats.topOutfieldMinutes}
          valueLabel={(entry) => formatMinutes(entry.value)}
          countLabel={(entry) => matchCount(entry.count)}
          emptyMessage="Personne n’a encore de minutes de joueur de champ sur cette sélection."
        />
        <Leaderboard
          title="Minutes jouées au goal"
          description="Le temps passé dans les buts, qui vient du poste occupé et non de la feuille de match"
          entries={stats.topGkMinutes}
          valueLabel={(entry) => formatMinutes(entry.value)}
          countLabel={(entry) => matchCount(entry.count)}
          emptyMessage="Personne n’a encore joué dans les buts sur cette sélection."
        />
      </Section>

      <Section title="Impact par poste">
        <ImpactByPosition impact={stats.impact} />
      </Section>

      <Section title="Notes">
        <Leaderboard
          title="Meilleures notes"
          /* « à partir de 3 matchs notés », not « 3 notes » (decision 137). A season average is the
             mean of one settled figure per match now, so the threshold counts matches — and the old
             wording was the more forgiving of the two, which is the direction that misleads. */
          description={`Moyenne reçue, à partir de ${plural(MIN_RATED_MATCHES, "match noté", "matchs notés")}`}
          entries={stats.topRated}
          valueLabel={(entry) => formatRating(entry.value)}
          countLabel={(entry) => plural(entry.count, "match noté", "matchs notés")}
          emptyMessage={
            // A ranking waiting on the notes to come in and a ranking nobody qualifies for are two
            // different facts, and saying « personne n’a assez de matchs » while three matches are
            // still being rated would be the wrong one.
            stats.pendingRatingMatches > 0
              ? "Aucune moyenne à afficher pour l’instant : des matchs attendent encore leurs notes."
              : `Personne n’a encore ${plural(MIN_RATED_MATCHES, "match noté", "matchs notés")} : une moyenne sur un ou deux matchs ne veut rien dire, donc le classement attend.`
          }
          // Shared with `/stats/equipe-type`, which builds a seven out of these same averages and
          // owes the reader the same sentence about them. Same words, one source.
          note={pendingRatingMatchesNoteFr(stats.pendingRatingMatches) ?? undefined}
        />
      </Section>

      <PlayerList
        players={sortPlayers(stats.players, query.sort)}
        query={query}
        pendingRatingMatches={stats.pendingRatingMatches}
      />
    </>
  );
}

/** One of the page's sections: a heading and its cards. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

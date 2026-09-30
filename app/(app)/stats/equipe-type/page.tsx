/**
 * L'équipe type — the best (or the worst) seven the season's figures can justify, on one criterion.
 *
 * This screen is one claim — « voilà la meilleure équipe » — and that claim is wrong in four ways
 * nobody can see from a pitch full of names. So it states all four, in French, under the pitch:
 *
 * 1. **The posts are declarations, not measurements.** `player_positions` is what a man said about
 *    himself (decision 005); there is no per-post minute data anywhere in this database —
 *    `match_player_stats.gkMinutes` is the only positional figure that exists, and the reducer's
 *    `positionSpells` never reach a table. « Meilleur milieu droit » would therefore be a measurement
 *    the app cannot make (`DECLARED_POSTS_FR`, and `docs/ROADMAP.md`'s `minutes_by_position`).
 * 2. **A ratings seven belongs to one reader.** Decision 021 applies decision 007's gate to season
 *    averages, so two teammates read two different sevens off the same season and neither is wrong.
 * 3. **Every figure was shrunk**, and by a measured amount (rule 3 of `best-seven.ts`) — which the
 *    screen prints, in the unit it was measured in, or admits it could not measure.
 * 4. **There are two invincibilités** (decision 011), and this screen reads both: the keeper on his
 *    minutes in goal, the six others on their minutes on the pitch.
 *
 * Read-only, so no new permission: `team:read` (decision 002), and the layout guard has already
 * refused anybody with no team.
 *
 * ## Why so little happens here
 *
 * The page queries, adapts and words. The arithmetic is `lib/stats/best-seven.ts` (pure, no imports),
 * the join is `lib/stats/best-seven-input.ts` (pure, tested field by field), every sentence is
 * `lib/stats/best-seven-copy.ts` (pure, tested) — decision 097's lesson is that a test on a pure
 * function proves nothing about a screen that never calls it, so the way to make the tests worth
 * something is for the screen to be nothing but calls to them.
 */

import Link from "next/link";

import { Card, EmptyState } from "@/components/ui";
import { requireTeamContext } from "@/lib/auth/dal";
import { competitionLabelOf, statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { bestSeven, evaluateSquad, hasOwnExposure } from "@/lib/stats/best-seven";
import {
  CRITERION_CHIP_FR,
  CRITERION_PARAM,
  DIRECTION_PARAM,
  FORMATION_PARAM,
  NO_FORMATION_FR,
  cleanSheetReadingsFr,
  declaredPostsFr,
  emptySlotsFr,
  equipeTypeHref,
  excludedFromSquadFr,
  formationOverrideFr,
  formationUsageFr,
  goalkeeperShrinkageSentenceFr,
  matchesWithoutCompositionFr,
  noBasisFr,
  outOfPositionNoteFr,
  parseCriterion,
  parseDirection,
  shrinkageSentenceFr,
  squadMeanStandInFr,
  viewerRelativeRatingsFr,
  type BestSevenQuery,
} from "@/lib/stats/best-seven-copy";
import { toBestSevenSlots, toBestSevenSquad } from "@/lib/stats/best-seven-input";
import { hiddenRatingMatchesNoteFr, matchCount } from "@/lib/stats/format";
import { getFormationUsage } from "@/lib/stats/formation-usage";
import { getSeasonStats } from "@/lib/stats/queries";
import { getSquad } from "@/lib/team/queries";

import { COMPETITION_PARAM } from "../_components/filters";
import { SevenControls } from "./_components/controls";
import { SevenPitch, type SevenCell } from "./_components/seven-pitch";

export const metadata = { title: "Équipe type" };

/** Same rule as `/stats`: a stale or forged id degrades to « toutes », never to an error. */
function firstOf(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function EquipeTypePage({
  searchParams,
}: PageProps<"/stats/equipe-type">) {
  const [{ team }, params] = await Promise.all([requireTeamContext(), searchParams]);

  const competitions = statsFilterOptions(await getTeamCompetitions(team.id));
  const requestedCompetition = firstOf(params[COMPETITION_PARAM]);
  const competitionId =
    competitions.find((competition) => competition.id === requestedCompetition)?.id ?? null;

  const [stats, usage, squad] = await Promise.all([
    getSeasonStats(team.id, team.membershipId, { competitionId }),
    getFormationUsage(team.id, { competitionId }),
    // Declared posts come from the **current** squad, which is what `getSquad` returns; the reason a
    // departed player cannot be a candidate at all is argued in `best-seven-input.ts`.
    getSquad(team.id),
  ]);

  // The override is only honoured if it names a shape this team has actually played: a chip is the
  // only way to set it, and a hand-typed id must not lay the seven out on a formation nobody uses.
  const requestedFormation = firstOf(params[FORMATION_PARAM]);
  /**
   * **Naming the most-played shape is not overriding it.** `formationOverrideFr` ends « Ce n'est pas la
   * forme que l'équipe a le plus jouée », which was printed about the very shape the chip row had just
   * labelled « (la plus jouée) »: two chips, identical layout, contradictory captions. The chip for it
   * is gone from `SevenControls`, but a bookmark or a hand-typed `?formation=` can still carry that id,
   * so the request is resolved to null here — one place, rather than a special case in the sentence, in
   * the chip's `active` test and in `equipeTypeHref` separately. The shape drawn is identical either
   * way: `override ?? usage.mostUsed`.
   */
  const override =
    usage.formations.find(
      (formation) =>
        formation.formationId === requestedFormation &&
        formation.matches > 0 &&
        formation.formationId !== usage.mostUsed?.formationId,
    ) ?? null;

  const query: BestSevenQuery = {
    competitionId,
    criterion: parseCriterion(params[CRITERION_PARAM]),
    direction: parseDirection(params[DIRECTION_PARAM]),
    formationId: override?.formationId ?? null,
  };

  const filterLabel = competitionLabelOf(competitions, competitionId);
  const scopeLabel = filterLabel?.toLocaleLowerCase("fr-FR") ?? "toutes compétitions";

  const controls = (
    <SevenControls
      query={query}
      competitions={competitions}
      formations={usage.formations.filter((formation) => formation.matches > 0)}
      mostUsed={usage.mostUsed}
    />
  );

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div>
          {/* `min-h-11` and `inline-flex`, the same back link as every other `/match/[id]`-style
              screen: at `text-xs` alone it measured 81 × 17 px, which is a target no thumb hits at
              390 px. Nothing invented here — the class list is the one eleven other headers use. */}
          <Link
            href={`/stats${competitionId === null ? "" : `?${COMPETITION_PARAM}=${competitionId}`}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            ← Statistiques
          </Link>
          <h1 className="text-xl font-bold tracking-tight text-ink">L’équipe type</h1>
          <p className="mt-0.5 text-sm text-ink-muted">
            {CRITERION_CHIP_FR[query.criterion]} · saison en cours, {scopeLabel} ·{" "}
            {matchCount(stats.matchesConsidered)} terminé
            {stats.matchesConsidered > 1 ? "s" : ""}
          </p>
        </div>
        {controls}
      </header>

      <Body
        query={query}
        stats={stats}
        usage={usage}
        squad={squad}
        override={override}
        kit={{ primaryColor: team.primaryColor, secondaryColor: team.secondaryColor }}
        filterLabel={filterLabel}
        scopeLabel={scopeLabel}
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* The three ways there is nothing to draw, then the seven                    */
/* -------------------------------------------------------------------------- */

function Body({
  query,
  stats,
  usage,
  squad,
  override,
  kit,
  filterLabel,
  scopeLabel,
}: {
  query: BestSevenQuery;
  stats: Awaited<ReturnType<typeof getSeasonStats>>;
  usage: Awaited<ReturnType<typeof getFormationUsage>>;
  squad: Awaited<ReturnType<typeof getSquad>>;
  override: Awaited<ReturnType<typeof getFormationUsage>>["formations"][number] | null;
  kit: { primaryColor: string; secondaryColor: string };
  filterLabel: string | null;
  scopeLabel: string;
}) {
  /**
   * The same three empty states as `/stats`, word for word.
   *
   * Not out of laziness: the two screens read the same season through the same filter, so a reader
   * who bounced off « Pas encore de statistiques » there and reads a differently worded version of it
   * here has been given two facts to reconcile where there is one.
   */
  if (stats.isEmpty) {
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

  const formation = override ?? usage.mostUsed;

  // Nobody ever drew a composition on a finished match. Seven invented posts would be an opinion
  // dressed as a measurement, so the screen draws nothing and says what to do about it.
  if (formation === null) {
    return <EmptyState title="Aucune forme de jeu connue" description={NO_FORMATION_FR} />;
  }

  const slots = toBestSevenSlots(formation.slots);
  const { candidates, departedWithData, nonPlayers } = toBestSevenSquad(stats.players, squad);

  const result = bestSeven({
    criterion: query.criterion,
    direction: query.direction,
    slots,
    candidates,
  });
  /**
   * The whole table, so a swap on the client is a lookup rather than a second implementation of the
   * shrinkage. Computed on **these** candidates — `bestSeven` re-sorts its own copy by its tie-breaks,
   * but a cell only depends on the (candidate, slot) pair, so the client's `candidateIndex` map is
   * safe against that.
   */
  const evaluation = evaluateSquad(candidates, slots, query.criterion);

  const cells: SevenCell[][] = evaluation.cells.map((row) =>
    row.map((cell) => ({ fit: cell.fit, adjusted: cell.adjusted, observed: cell.observed })),
  );

  const optimumBySlot: Record<string, string | null> = {};
  for (const pick of result.picks) optimumBySlot[pick.slotId] = pick.player?.id ?? null;

  const emptySlots = result.picks.filter((pick) => pick.player === null).length;
  /**
   * Picks whose figure is the squad's rather than their own (rule 2: no exposure lands exactly on the
   * mean). Counted on the picks and not on the squad: a man with nothing to his name only misleads the
   * reader if he is actually *on* the pitch, and the discs say so one by one.
   */
  const squadMeanStandIns = result.picks.filter(
    (pick) => pick.player !== null && pick.adjusted !== null && !hasOwnExposure(pick.observed),
  ).length;

  const notes = [
    // 1 — the posts are declarations. First, because it is the sentence that changes what the whole
    // pitch means.
    declaredPostsFr(query.direction),
    outOfPositionNoteFr(result.outOfPositionCount),
    // 2 — a ratings seven is one reader's. Only on `ratings`; the other three are the event log.
    viewerRelativeRatingsFr(query.criterion),
    query.criterion === "ratings" ? hiddenRatingMatchesNoteFr(stats.hiddenRatingMatches) : null,
    // 3 — what the shrinkage did, with the measured prior strength or the admission that there is
    // none to print.
    shrinkageSentenceFr(query.criterion, result.shrinkage),
    goalkeeperShrinkageSentenceFr(query.criterion, result.goalkeeperShrinkage),
    // 3b — and how many of the seven figures are the squad's own, worn by somebody who has none. Each
    // such disc also says it on its face: this paragraph is the count, not the only statement.
    squadMeanStandInFr(squadMeanStandIns),
    // 4 — which invincibilité. `cleanSheetReadingsFr` is null on the other three criteria.
    cleanSheetReadingsFr(query.criterion),
    // And the facts about the shape and the squad the seven was drawn from.
    override === null
      ? formationUsageFr({
          label: formation.label,
          matches: formation.matches,
          matchesConsidered: usage.matchesConsidered,
        })
      : formationOverrideFr(formation.label),
    matchesWithoutCompositionFr(usage.matchesWithoutComposition),
    excludedFromSquadFr({ departedWithData, nonPlayers }),
    emptySlotsFr(emptySlots),
    /**
     * « Personne n'a encore de chiffre » — and it has to be true of **both** models before it is
     * printed, now that `hasBasis` is the all-pitch one alone. On `cleanSheet` a season whose only
     * recorded minutes are a keeper's has `hasBasis === false` and a GB disc showing a real figure, so
     * keying on `hasBasis` alone would print « personne » under a number (decision 011's two readings
     * again). `goalkeeperHasBasis` is `null` on the three criteria that have no second model, which
     * means « not applicable » and never « false ».
     *
     * The opposite case — field figures, no keeper minutes anywhere, reachable whenever a match was run
     * in game mode without a confirmed composition — is already stated by
     * `goalkeeperShrinkageSentenceFr`, whose `noData` branch names that exact cause.
     */
    result.hasBasis || result.goalkeeperHasBasis === true
      ? null
      : noBasisFr(query.criterion),
  ].filter((note): note is string => note !== null);

  return (
    <>
      <SevenPitch
        criterion={query.criterion}
        direction={query.direction}
        aggregation={result.aggregation}
        slots={formation.slots.map((slot) => ({
          slotId: slot.id,
          positionCode: slot.positionCode,
          x: slot.x,
          y: slot.y,
        }))}
        candidates={candidates.map((candidate) => ({
          id: candidate.id,
          displayName: candidate.displayName,
          jerseyNumber: candidate.jerseyNumber,
          minutes: candidate.minutes,
        }))}
        cells={cells}
        optimumBySlot={optimumBySlot}
        optimumAggregate={result.aggregate}
        kit={kit}
      />

      {/* One card, one paragraph per caveat. Printed, never hovered (decision 072), and never folded
          behind a « en savoir plus »: a reader who does not open the accordion has read a claim the
          screen knows to be incomplete. */}
      <Card className="space-y-3">
        <h2 className="text-base font-semibold text-ink">Ce que ce sept dit, et ce qu’il ne dit pas</h2>
        {notes.map((note) => (
          <p key={note} className="text-xs leading-relaxed text-ink-subtle">
            {note}
          </p>
        ))}
      </Card>

      {/* The link that flips the whole screen, and therefore a primary action rather than a footnote:
          at `text-xs` in a paragraph it measured 215 × 17 px. Sized like every other link-shaped action
          in the app — `inline-flex min-h-11 items-center`, `text-accent`, underline on hover. */}
      <Link
        href={equipeTypeHref({
          ...query,
          direction: query.direction === "best" ? "worst" : "best",
        })}
        scroll={false}
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {query.direction === "best"
          ? "Et la pire équipe, sur le même critère ?"
          : "Et la meilleure équipe, sur le même critère ?"}
      </Link>
    </>
  );
}

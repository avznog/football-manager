/**
 * L'équipe type — the four sevens of the cahier des charges (decisions 171 and 172): offensive,
 * défensive, 7 de légende, and the notes seven the owner kept.
 *
 * Each is one claim — « voilà la meilleure attaque » — and the screen states what it rests on, in
 * French, above and under the pitch:
 *
 * 1. **The rule of the seven**, in one line under the title (`SEVEN_RULE_FR`).
 * 2. **The posts are the coach's** (S5): a player only goes to a post set for him, primary first, while
 *    the squad allows it, and a disc says « pas son poste » when it does not.
 * 3. **Who may keep goal**: somebody who has played there, and in the légende never somebody below the
 *    keepers' average (Q8) — `keeperRuleFr` says how many were considered and refused.
 * 4. **Every figure was smoothed**, and each disc prints the raw record beside the ranked figure.
 * 5. **Who was not in the running**: whoever has left, the encadrement, and — decision 187 — anybody
 *    with no minute of game time in this selection (`excludedFromSquadFr`). A post nobody is left for
 *    stays « Poste vide » and says why (`emptySlotsFr`), rather than being filled to look complete.
 * 6. **Where the seven came from** (decision 204): the model that composed it and when, or that the
 *    algorithm answered because the model could not — and in that case *why*, in plain French.
 *
 * Read-only, so no new permission: `team:read` (decision 002), and the layout guard has already
 * refused anybody with no team. The Server Action that resolves the seven asserts the same one.
 *
 * ## The order of the screen
 *
 * Title and the seven's rule, then the pitch, then the controls, then the caveats. The controls used
 * to be four chip rows in the `<header>` — about 216 px of ways to ask the question above any answer
 * to it — and they are `SevenControls`' `<select>`s under the pitch now, joined by the context field
 * of decision 204, which is what the owner asked for and what `_components/controls.tsx` argues at
 * length.
 *
 * ## Why the seven streams
 *
 * The answer may come from a 120-billion-parameter model on a free endpoint, so it can take seconds.
 * Everything that does not depend on it — the header, the seven's rule, the match count, the selects,
 * the context field — is rendered and usable at once, and only the pitch, its sentences and its caveats
 * are inside a `<Suspense>`. `SevenSkeleton` holds the exact footprint of what is coming, controls
 * included, so nothing jumps under a thumb when the model answers.
 *
 * ## The shape
 *
 * The seven posts are the one formation's (decision 157). They used to be the formation the team had
 * played most, with a select to override it; with one formation there is nothing to count and nothing
 * to choose, so neither the « forme de jeu » select nor the sentences about it exist any more.
 *
 * ## Why so little happens here
 *
 * The page queries, adapts and words. The arithmetic is `lib/stats/best-seven.ts` (pure, no imports),
 * the join is `lib/stats/best-seven-input.ts` (pure, tested field by field), every sentence is
 * `lib/stats/best-seven-copy.ts` (pure, tested), the choice between the cache, the model and the
 * algorithm is `actions.ts` — decision 097's lesson is that a test on a pure
 * function proves nothing about a screen that never calls it, so the way to make the tests worth
 * something is for the screen to be nothing but calls to them.
 */

import Link from "next/link";
import { Suspense } from "react";

import { Card, EmptyState } from "@/components/ui";
import { requireTeamContext } from "@/lib/auth/dal";
import { formatDate, formatTime } from "@/lib/calendar/time";
import { competitionLabelOf, statsFilterOptions } from "@/lib/competition/options";
import { getTeamCompetitions } from "@/lib/competition/queries";
import { aggregateSeven, hasOwnExposure } from "@/lib/stats/best-seven";
import {
  CONTEXT_PARAM,
  CRITERION_PARAM,
  SEVEN_OPTION_FR,
  SEVEN_RULE_FR,
  SEVEN_SUMMARY_HEADING_FR,
  declaredPostsFr,
  emptySlotsFr,
  excludedFromSquadFr,
  keeperRuleFr,
  outOfPositionNoteFr,
  parseCompetitionId,
  parseSeven,
  parseSevenContext,
  sevenQuestionKey,
  sevenSmoothingFr,
  sevenSourceFr,
  shrinkageSentenceFr,
  squadMeanStandInFr,
  type BestSevenQuery,
} from "@/lib/stats/best-seven-copy";
import { matchCount, pendingRatingMatchesNoteFr } from "@/lib/stats/format";
import { getTheFormation } from "@/lib/formation/queries";
import { getSeasonStats } from "@/lib/stats/queries";

import { COMPETITION_PARAM } from "../_components/filters";
import { askSeven } from "@/lib/stats/actions";
import { SevenContextField } from "./_components/context-field";
import { SevenControls } from "./_components/controls";
import { SevenSkeleton } from "./_components/seven-skeleton";
import { SevenPitch, type SevenCell } from "./_components/seven-pitch";

export const metadata = { title: "Équipe type" };

/**
 * Seconds this route is allowed to run for.
 *
 * Nothing set it before decision 204 and nothing needed to: the screen was four small reads and a
 * bitmask DP. It now asks a model on OpenRouter, and with no `maxDuration` the platform default (10 s
 * for a Node function on the App Router) cut it off mid-call, which the reader met as a crash rather
 * than as a fallback.
 *
 * **30.** It was 60 — the ceiling on Vercel's **Hobby** plan, which is the plan this project is on
 * (`docs/DEPLOY.md`) — while the model was a free 120B that once took 53 seconds. Now the call owns a
 * ceiling of its own: `SEVEN_TOTAL_TIMEOUT_MS` is 24 s across both attempts, so a hung model gives up
 * here and the screen says so. 30 is that budget plus room for the reads, the DP and the render, and
 * anything longer would only be waiting for a timeout that has already fired.
 */
export const maxDuration = 30;

export default async function EquipeTypePage({
  searchParams,
}: PageProps<"/stats/equipe-type">) {
  const [{ team }, params] = await Promise.all([requireTeamContext(), searchParams]);

  const competitions = statsFilterOptions(await getTeamCompetitions(team.id));
  // Every one of the reads below tolerates a **missing, forged or empty** value: the controls are a
  // `method="get"` form now, and a browser with no JavaScript submits `?critere=&competition=` for
  // whatever the reader left alone. All four are pinned in `best-seven-copy.test.ts`.
  const competitionId = parseCompetitionId(params[COMPETITION_PARAM], competitions);
  // The free text of decision 204, clipped and whitespace-normalised: it reaches a prompt, so a forged
  // URL may not stuff one.
  const context = parseSevenContext(params[CONTEXT_PARAM]);

  const [stats, formation] = await Promise.all([
    getSeasonStats(team.id, { competitionId }),
    // `cache()`d, and read again inside `askSeven`: the empty state below needs it before the model is
    // ever asked, and the shared formation cannot change between the two reads.
    getTheFormation(),
  ]);

  const query: BestSevenQuery = {
    competitionId,
    // Old bookmarks (`?critere=goals`, `?sens=pire`) land on the default seven (decision 171).
    seven: parseSeven(params[CRITERION_PARAM]),
  };

  const filterLabel = competitionLabelOf(competitions, competitionId);
  const scopeLabel = filterLabel?.toLocaleLowerCase("fr-FR") ?? "toutes compétitions";

  /**
   * Built here and **rendered by `Body`**, because where it goes depends on what there is to show: under
   * the pitch and above the notes when there is a seven, under the empty state when there is not. It is
   * never absent — an empty state whose own text says « choisis « Toutes » » with no select on screen
   * would be an instruction to use a control the reader does not have.
   *
   * Rendering it is necessary and was not sufficient: the block is on screen, and each select inside it
   * decides for itself whether it has anything to offer. The competition one used to require two
   * competitions, so a team with one and a bookmarked `?competition=<id>` got the « Choisis « Toutes » »
   * sentence over a form with no competition select in it. `showsCompetitionSelect` now keeps it for a
   * reader who arrived filtered, which is the state that prints the sentence.
   *
   * It is also what the `<Suspense>` fallback renders, so the selects and the context field are on
   * screen and working while the model is out, in the place they will still be when it answers.
   */
  const controls = (
    <>
      <SevenControls
        query={query}
        competitions={competitions}
        competitionParam={COMPETITION_PARAM}
      />
      <SevenContextField
        query={query}
        context={context}
        competitionParam={COMPETITION_PARAM}
      />
    </>
  );

  return (
    <div className="space-y-6">
      <header>
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
            {SEVEN_OPTION_FR[query.seven]} · saison en cours, {scopeLabel} ·{" "}
            {matchCount(stats.matchesConsidered)} terminé
            {stats.matchesConsidered > 1 ? "s" : ""}
          </p>
          {/* The seven's rule, before its names: what the claim is a claim about. */}
          <p className="mt-2 text-sm text-ink">{SEVEN_RULE_FR[query.seven]}</p>
        </div>
      </header>

      <Body
        controls={controls}
        query={query}
        context={context}
        stats={stats}
        hasFormation={formation !== null}
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
  controls,
  query,
  context,
  stats,
  hasFormation,
  kit,
  filterLabel,
  scopeLabel,
}: {
  /** The two forms, placed under whatever this function decided to draw. */
  controls: React.ReactNode;
  query: BestSevenQuery;
  context: string;
  stats: Awaited<ReturnType<typeof getSeasonStats>>;
  hasFormation: boolean;
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
      <>
        <EmptyState
          title="Pas encore de statistiques"
          description={
            filterLabel === null
              ? "Dès qu’un match sera terminé, les buts, les minutes et les notes apparaîtront ici."
              : `Aucun match terminé en ${scopeLabel}, et aucune note à afficher. Choisis « Toutes » pour voir la saison entière.`
          }
        />
        {controls}
      </>
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
        {controls}
      </>
    );
  }

  // Only on a database that never loaded the formation (`0009_seed_formations.sql` makes that
  // impossible after `db:migrate`). Seven invented posts would be worse than saying so.
  if (!hasFormation) {
    return (
      <>
        <EmptyState
          title="Aucune formation disponible"
          description="La formation n’a pas été chargée dans la base."
        />
        {controls}
      </>
    );
  }

  return (
    /* Keyed to the question, context included: a new question is a new wait, so the skeleton has to
       come back rather than the previous seven staying on screen under a new header. */
    <Suspense
      key={`${sevenQuestionKey(query)}|${context}`}
      fallback={<SevenSkeleton controls={controls} />}
    >
      <Seven controls={controls} query={query} context={context} stats={stats} kit={kit} />
    </Suspense>
  );
}

/* -------------------------------------------------------------------------- */
/* The seven itself — the one thing on this screen that is waited for         */
/* -------------------------------------------------------------------------- */

async function Seven({
  controls,
  query,
  context,
  stats,
  kit,
}: {
  controls: React.ReactNode;
  query: BestSevenQuery;
  context: string;
  stats: Awaited<ReturnType<typeof getSeasonStats>>;
  kit: { primaryColor: string; secondaryColor: string };
}) {
  const answer = await askSeven({
    seven: query.seven,
    competitionId: query.competitionId,
    context,
  });

  // `Body` has already drawn the « aucune formation » empty state, so this cannot be reached from the
  // page. Narrowing rather than asserting: nothing below has seven posts to draw on.
  if (answer.slots === null) return null;

  const { result } = answer;

  // The whole table, in the DP's candidate order, so a swap on the client is a lookup rather than a
  // second implementation of the smoothing.
  const cells: SevenCell[][] = result.cells.map((row) =>
    row.map((cell) => ({
      fit: cell.fit,
      adjusted: cell.adjusted,
      observed: cell.observed,
      figure: cell.figure,
      allowed: cell.allowed,
    })),
  );

  const optimumBySlot: Record<string, string | null> = {};
  for (const pick of result.picks) optimumBySlot[pick.slotId] = pick.player?.id ?? null;

  // Only the notes seven has a team figure: the three others mix figures slot by slot (decision 171).
  const aggregation = query.seven === "notes" ? ("mean" as const) : null;
  const optimumValues = result.picks
    .filter((pick) => pick.player !== null)
    .map((pick) => pick.cell?.adjusted ?? null);
  const optimumAggregate = aggregation === null ? null : aggregateSeven(optimumValues, "ratings");

  const emptySlots = result.picks.filter((pick) => pick.player === null).length;
  /** Picks whose figure is the squad's (or the post's) rather than their own: no exposure of their own. */
  const squadMeanStandIns = result.picks.filter(
    (pick) =>
      pick.player !== null &&
      pick.cell !== null &&
      pick.cell.adjusted !== null &&
      !hasOwnExposure(pick.cell.observed),
  ).length;

  const notes = [
    declaredPostsFr(),
    outOfPositionNoteFr(result.outOfPositionCount),
    keeperRuleFr({
      seven: query.seven,
      considered: result.keepersConsidered,
      refused: result.keepersRefused,
      average: result.keeperModel?.squadMean ?? null,
    }),
    sevenSmoothingFr(query.seven),
    // The notes seven keeps the old screen's two sentences: what is still waiting on the coach, and the
    // measured strength of the shrinkage.
    query.seven === "notes" ? pendingRatingMatchesNoteFr(stats.pendingRatingMatches) : null,
    query.seven === "notes" && result.ratingsModel !== null
      ? shrinkageSentenceFr("ratings", result.ratingsModel)
      : null,
    squadMeanStandInFr(squadMeanStandIns),
    excludedFromSquadFr(answer.squad),
    emptySlotsFr({
      count: emptySlots,
      eligible: answer.squad.eligible,
      withoutMinutes: answer.squad.withoutMinutes,
    }),
  ].filter((note): note is string => note !== null);

  return (
    <>
      {/* Whose seven this is, immediately above it and never behind a hover (decision 072). The three
          model failures read as facts about the model with the algorithm's seven still on the pitch,
          and never as a status code: a rate limit is a busy minute and a hang says only that the
          model took too long. */}
      {answer.source !== null ? (
        <p className="text-xs leading-relaxed text-ink-muted">
          {sevenSourceFr(answer.source, whenFr(answer.computedAt))}
        </p>
      ) : null}

      {/* Still keyed to the question itself, and not only to the `<Suspense>` above — which carries the
          same key plus the context, because a new context is a new wait. Both, deliberately: the
          boundary's key is what brings the skeleton back, and `sevenQuestionKey` on the pitch is what
          `best-seven-copy.test.ts` scans for and what the comment on that function argues. Either one
          alone would throw the reader's own swaps away at the right moment; keeping the pitch's makes
          the reason readable where the state lives. */}
      <SevenPitch
        key={sevenQuestionKey(query)}
        seven={query.seven}
        aggregation={aggregation}
        slots={answer.slots}
        candidates={result.candidates.map((candidate) => ({
          id: candidate.id,
          displayName: candidate.displayName,
          jerseyNumber: candidate.jerseyNumber,
          minutes: candidate.minutes,
        }))}
        cells={cells}
        optimumBySlot={optimumBySlot}
        optimumAggregate={optimumAggregate}
        whyByCandidateId={answer.whyByCandidateId}
        kit={kit}
      />

      {/* The model's few sentences on the seven as a whole, right under the pitch it is about, and only
          when a model wrote them: the algorithm has nothing to say and an empty card would read as one
          the model declined to fill. */}
      {answer.summary !== null ? (
        <Card className="space-y-2">
          <h2 className="text-base font-semibold text-ink">{SEVEN_SUMMARY_HEADING_FR}</h2>
          <p className="text-sm leading-relaxed text-ink">{answer.summary}</p>
        </Card>
      ) : null}

      {/* The selects and the context field sit here, between the seven and the paragraphs about it: the
          reader meets the answer first, then the ways of asking a different question. Four chip rows
          above the pitch put about 216 px of controls before anything they control. */}
      {controls}

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
    </>
  );
}

/**
 * When a cached answer was computed, in Paris (`CLAUDE.md`), as the fragment `sevenSourceFr` drops into
 * « calculé … ». Null for an answer that has just arrived — there is nothing to date about « à
 * l'instant ».
 */
function whenFr(iso: string | null): string | null {
  if (iso === null) return null;
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;
  return `le ${formatDate(instant)} à ${formatTime(instant)}`;
}

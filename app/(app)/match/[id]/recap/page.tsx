/**
 * « Résumé » — the post-match recap (screen 6 of `docs/PLAN.md`).
 *
 * The one place the app celebrates. Everything on it is **derived**: the score, the scorers, the
 * minutes played and the timeline come from `reduceMatch` over the append-only log (invariant 2), and
 * the man of the match from the ratings (decision 007). Nothing here is stored.
 *
 * The ratings section is gated in the query, not here, and under decision 137 the gate asks a
 * different question: not « has this reader earned the notes » but « are this match's means published
 * at all », plus « is this reader the coach ». An unpublished match comes back as `published: false`
 * with no score in the payload, and a reader who is not the coach never receives an individual note or
 * the count behind a mean (`lib/rating/queries.ts`).
 *
 * This lives at its own route rather than inside `/match/[id]`: the match page is the *organising*
 * page — availability, composition, game mode — and this is the *reading* page, with a different
 * shape, a different mood, and a different set of people coming to it.
 */

import Link from "next/link";
import { notFound } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import { entryModeBadgeFr, venueSideLabel } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import type { MatchRow } from "@/lib/match/queries";
import { MIN_NOTES_FOR_MEAN } from "@/lib/rating/aggregate";
import { getMatchRecap, getRatingResults } from "@/lib/rating/queries";
import { ratingUrgencyFr } from "@/lib/rating/window";
import { ManOfTheMatchCard } from "./_components/man-of-the-match";
import { MinutesTable } from "./_components/minutes-table";
import { RatingsPanel } from "./_components/ratings-panel";
import { Scoreboard } from "./_components/scoreboard";
import { TimelineList } from "./_components/timeline-list";

export async function generateMetadata({ params }: PageProps<"/match/[id]/recap">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const view = await getMatchRecap({ teamId: team.id, matchId: id });
  return { title: view ? `Résumé · ${view.match.opponentName}` : "Match introuvable" };
}

export default async function RecapPage({ params }: PageProps<"/match/[id]/recap">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const view = await getMatchRecap({ teamId: team.id, matchId: id });
  if (!view) notFound();

  // The sheet is not read here any more: who rates is the log's answer (decision 137), and the one
  // thing this page used it for was `isOnRateableSheet`, which is gone with the rule.
  const { match, recap } = view;
  const kickoff = new Date(match.kickoffAt);

  // A match nobody has played has nothing to recap.
  if (match.status === "scheduled") {
    return (
      <div className="space-y-6">
        <RecapHeader match={match} kickoff={kickoff} recorded={false} />
        <EmptyState
          title="Ce match n’a pas encore été joué"
          description="Le résumé apparaîtra ici quand le match aura été suivi et terminé."
          action={
            <ButtonLink href={`/match/${match.id}`} variant="secondary">
              Retour au match
            </ButtonLink>
          }
        />
      </div>
    );
  }

  /**
   * A match that has kicked off but has no final whistle has no result to celebrate either. The page
   * below would state a man of the match, minutes played and a score under « Victoire » about an
   * afternoon still being played — and the match page was offering the link next to « Reprendre le
   * mode match », so both were true at once. The live match is read in game mode; this page opens at
   * the final whistle. Same shape as the `scheduled` refusal above, and the same way out: the one
   * screen that can actually end the match (decision 113).
   */
  if (match.status !== "finished") {
    return (
      <div className="space-y-6">
        <RecapHeader match={match} kickoff={kickoff} recorded={recap.recorded} />
        <EmptyState
          title="Le match n’est pas terminé"
          description="Le résumé s’ouvre au coup de sifflet final. En attendant, tu suis le match en direct dans le mode match."
          action={
            <ButtonLink href={`/match/${match.id}/jeu`} variant="secondary">
              Reprendre le mode match
            </ButtonLink>
          }
        />
      </div>
    );
  }

  /*
   * Invariant 4: every one of these is an answer from `can()` and none of them is a role read here.
   * The three are genuinely three: `rating:submit` is self-scoped and false for a coach who did not
   * play, while `rating:readNotes` and `rating:publish` are his and his alone (decision 137).
   */
  const canSubmit = can(actor, "rating:submit", { teamId: team.id });
  const results = await getRatingResults({
    teamId: team.id,
    matchId: match.id,
    membershipId: team.membershipId,
    canSubmit,
    canSeeNotes: can(actor, "rating:readNotes", { teamId: team.id }),
    canPublish: can(actor, "rating:publish", { teamId: team.id }),
  });

  /*
   * Whether he is *asked* for notes is the log's answer, not the sheet's (decision 137): a named
   * substitute who never came on has nothing to judge. `progress.requiredCount` carries it — it is
   * built from `ratingTargetsFor`, which is empty for anybody who did not play — so the sheet is no
   * longer read here at all.
   */
  /*
   * And whether the window is still open needs no query of its own any more: under decision 138 it is
   * shut exactly when the means are out, which `results` has already answered. `getRatingWindow` would
   * re-read the log and the pairs to arrive at the same boolean, and a second answer is a second
   * chance to contradict the panel underneath.
   */
  const canStillRate =
    canSubmit &&
    match.status === "finished" &&
    results !== null &&
    !results.published &&
    results.progress.requiredCount > 0;

  return (
    <div className="space-y-6">
      <RecapHeader match={match} kickoff={kickoff} recorded={recap.recorded} />

      <Scoreboard
        recap={recap}
        opponentName={match.opponentName}
        status={match.status}
      />

      {/* What decision 041 promised: the state that says « rien saisi » is the state that offers to
          fix it. A coach who lands here from the calendar should not have to find his way back to the
          match page to type the afternoon up. */}
      {match.status === "finished" &&
      !recap.recorded &&
      can(actor, "match:amend", { teamId: team.id }) ? (
        <Card title="Saisir le match" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Renseigne qui a joué et les buts : le score, les minutes et les clean sheets se
              déduisent, et ce résumé se remplira tout seul.
            </p>
            <ButtonLink href={`/match/${match.id}/saisie`} fullWidth>
              Saisir le match
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {/* The prompt of screen 6: the recap asks for the notes, it does not wait to be found. It no
          longer promises anything in return — « tu verras les notes de tout le monde dès que tu auras
          fini » was decision 021's trade, and under 137 his own notes unlock nothing for him
          (`ratings-panel.tsx`). What is left is that the means come out without him. */}
      {canStillRate && results !== null && !results.progress.complete ? (
        <Card title="À toi de noter" as="h2" className="border-accent/40 bg-accent/10">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Une note pour chaque joueur qui était sur le terrain avec toi. L’équipe lira une
              moyenne par joueur, jamais ta note à toi.
            </p>
            {/* What closes the window, which this card never said (decision 079). */}
            <p className="text-sm font-medium text-ink">{ratingUrgencyFr()}</p>
            <ButtonLink href={`/match/${match.id}/notation`}>
              {results.progress.submittedCount > 0 ? "Finir mes notes" : "Noter mes coéquipiers"}
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {results?.published ? (
        <ManOfTheMatchCard manOfTheMatch={results.manOfTheMatch} minRatings={MIN_NOTES_FOR_MEAN} />
      ) : null}

      {results ? (
        <RatingsPanel
          results={results}
          teamId={team.id}
          matchId={match.id}
          canStillRate={canStillRate}
        />
      ) : null}

      {/* With an empty log every man on the sheet would be listed « non entré » at 0’, which is not
          « il n'est pas entré » but « on ne sait pas » — the scoreboard has already said so, and the
          timeline below says it again. Nine false lines would be the third telling, and a wrong one. */}
      {recap.recorded ? (
        <MinutesTable players={recap.players} entryMode={match.entryMode} />
      ) : null}

      <TimelineList entries={recap.timeline} />
    </div>
  );
}

function RecapHeader({
  match,
  kickoff,
  recorded,
}: {
  match: MatchRow;
  kickoff: Date;
  /** Whether there is a log at all: an empty one is not a log that was « saisi après le match ». */
  recorded: boolean;
}) {
  const entryBadge = entryModeBadgeFr(match.entryMode, { recorded });

  return (
    <header className="space-y-2">
      <Link
        href={`/match/${match.id}`}
        className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ← {match.opponentName}
      </Link>

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{match.competitionLabel}</Badge>
        <Badge variant={match.isHome ? "neutral" : "warning"}>
          {capitalizeFirst(venueSideLabel(match.isHome))}
        </Badge>
        {/* The reading page of a match nobody followed live. Everything below is derived from a log
            that was reconstructed afterwards, and the minutes table says what that costs. */}
        {entryBadge !== null ? <Badge variant="neutral">{entryBadge}</Badge> : null}
      </div>

      <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
        {match.opponentName}
      </h1>

      <p className="text-sm text-ink-muted">
        {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)}
        {match.venue ? ` · ${match.venue}` : ""}
      </p>
    </header>
  );
}

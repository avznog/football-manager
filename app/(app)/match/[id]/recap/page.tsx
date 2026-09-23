/**
 * « Résumé » — the post-match recap (screen 6 of `docs/PLAN.md`).
 *
 * The one place the app celebrates. Everything on it is **derived**: the score, the scorers, the
 * minutes played and the timeline come from `reduceMatch` over the append-only log (invariant 2), and
 * the man of the match from the ratings (decision 007). Nothing here is stored.
 *
 * The ratings section is gated in the query, not here: a player who has not finished rating his
 * teammates gets a `visible: false` result whose payload contains no score at all
 * (`lib/rating/queries.ts`).
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
import { COMPETITION_LABELS, entryModeBadgeFr, venueSideLabel } from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import type { MatchRow } from "@/lib/match/queries";
import { MOTM_MIN_RATINGS } from "@/lib/rating/aggregate";
import { isOnRateableSheet } from "@/lib/rating/progress";
import { getMatchRecap, getRatingResults, getRatingWindow } from "@/lib/rating/queries";
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

  const { match, recap, sheet } = view;
  const kickoff = new Date(match.kickoffAt);
  const now = new Date();

  // A match nobody has played has nothing to recap.
  if (match.status === "scheduled") {
    return (
      <div className="space-y-6">
        <RecapHeader match={match} kickoff={kickoff} now={now} recorded={false} />
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

  // Invariant 4: the permission comes from `can()`, and the sheet decides the rest (decision 007).
  const canSubmit = can(actor, "rating:submit", { teamId: team.id });
  const [results, window] = await Promise.all([
    getRatingResults({
      teamId: team.id,
      matchId: match.id,
      membershipId: team.membershipId,
      canSubmit,
    }),
    getRatingWindow(match),
  ]);

  const mayRate = canSubmit && isOnRateableSheet(sheet, team.membershipId);
  const canStillRate = mayRate && window.isOpen;
  const gated = results !== null && !results.visible;

  return (
    <div className="space-y-6">
      <RecapHeader match={match} kickoff={kickoff} now={now} recorded={recap.recorded} />

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

      {/* The prompt of screen 6: the recap asks for the notes, it does not wait to be found. */}
      {canStillRate && gated ? (
        <Card title="À toi de noter" as="h2" className="border-accent/40 bg-accent/10">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              Mets une note à chaque joueur de la feuille de match, toi compris. Tu verras les notes
              de tout le monde dès que tu auras fini.
            </p>
            <ButtonLink href={`/match/${match.id}/notation`}>
              {results !== null && !results.visible && results.progress.submittedCount > 0
                ? "Finir mes notes"
                : "Noter mes coéquipiers"}
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {results?.visible ? (
        <ManOfTheMatchCard manOfTheMatch={results.manOfTheMatch} minRatings={MOTM_MIN_RATINGS} />
      ) : null}

      {results ? (
        <RatingsPanel results={results} matchId={match.id} canStillRate={canStillRate} />
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
  now,
  recorded,
}: {
  match: MatchRow;
  kickoff: Date;
  now: Date;
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
        <Badge variant="accent">{COMPETITION_LABELS[match.competition]}</Badge>
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
        {capitalizeFirst(formatDay(kickoff, now))} à {formatTime(kickoff)}
        {match.venue ? ` · ${match.venue}` : ""}
      </p>
    </header>
  );
}

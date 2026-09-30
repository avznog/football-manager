/**
 * A match: when, where, who is available, and who still owes an answer.
 *
 * Readable by every member of the team. Editing is coach-only and goes through `can()`; declaring
 * availability is every player for themselves, which `setMatchAvailability` enforces — a coach
 * cannot answer on somebody's behalf (`docs/DATA_MODEL.md`).
 *
 * `params` is a Promise in Next 16 and `PageProps<"/match/[id]">` comes from `next typegen`
 * (`docs/NEXTJS16.md`). A match id from another team is a 404: `getMatch` scopes its query by
 * team, so nothing leaks.
 *
 * The composition card (M3) is coach-only and loads its own data, so a player's match page pays
 * nothing for it. Game mode is open to everybody — it is read-only for anyone who is not the
 * operator, and following the score from the touchline is a legitimate use of it.
 *
 * Once the match is played this page becomes the hub for the two screens that read it: the recap,
 * and the rating flow for whoever still owes notes. Whether he owes any is asked of
 * `getNotationView`, which owns decision 007's rule — this page restates none of it.
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import {
  entryModeBadgeFr,
  MATCH_STATUS_LABELS,
  matchNameFr,
  matchReminderTitleFr,
  periodsLabel,
  resultLabel,
  scoreLineFr,
  venueSideLabel,
} from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime, formatWhen } from "@/lib/calendar/time";
import { buildReminderMessage, tallyAvailability, type Responder } from "@/lib/calendar/timeline";
import { reopenMatch } from "@/lib/match/actions";
import { getMatch, getMatchAnswers, getMatchScore, hasMatchEvents } from "@/lib/match/queries";
import { getNotationView } from "@/lib/rating/queries";
import { ratingDeadlineFr } from "@/lib/rating/window";
import { getSquad } from "@/lib/team/queries";
import { FinishMatchCard } from "./_components/finish-match-card";
import { CompositionCard } from "./composition/_components/composition-card";
import { AvailabilityControl } from "../../calendrier/_components/availability-control";
import { AvailabilityGrid } from "../../calendrier/_components/availability-grid";
import { ReminderCard } from "../../calendrier/_components/reminder-card";

export async function generateMetadata({ params }: PageProps<"/match/[id]">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Match · ${match.opponentName}` : "Match introuvable" };
}

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const [answers, squad, score, logged] = await Promise.all([
    getMatchAnswers(match.id),
    getSquad(team.id),
    // A scheduled match has nothing in its log yet, so do not even ask.
    match.status === "scheduled" ? Promise.resolve(null) : getMatchScore(match.id),
    /*
     * Asked for every status, unlike the score: it is what the two cards about *declaring* a match
     * over are gated on, and one of them appears on a scheduled match. It is also the stricter
     * question — `score === null` ignores voided events, so a match whose every action was
     * corrected away reads as empty there and as logged here. Declaring is the case that must not
     * get it wrong, because it is what decides whether the déroulé can still be contradicted.
     */
    hasMatchEvents(match.id),
  ]);

  /**
   * The state of *this* viewer's rating duty, asked of the module that owns the rule rather than
   * re-derived here from the sheet and the next kick-off — two implementations of that rule is
   * exactly how the season averages once leaked (decision 021). Only a finished match has a duty,
   * so a scheduled one pays nothing.
   */
  const notation =
    match.status === "finished"
      ? await getNotationView({
          teamId: team.id,
          matchId: match.id,
          membershipId: team.membershipId,
        })
      : null;

  const kickoff = new Date(match.kickoffAt);
  const now = new Date();
  // `score === null` is this page's own test for "not one event was ever recorded", used again by
  // the « Saisir le match » card below: with no log there is no entry to label.
  const entryBadge = entryModeBadgeFr(match.entryMode, { recorded: score !== null });

  const players: Responder[] = squad
    .filter((member) => member.isPlayer)
    .map((member) => ({ membershipId: member.membershipId, displayName: member.displayName }));
  const tally = tallyAvailability(players, answers);
  const notes = new Map(answers.map((answer) => [answer.teamMemberId, answer.note]));

  const isCoach = can(actor, "match:update", { teamId: team.id });
  // Typing a match up, or rewriting it days later, is the coach's — not the match operator's
  // (decision 004). Invariant 4: the permission is `can()`'s answer.
  const mayAmend = can(actor, "match:amend", { teamId: team.id });
  /**
   * This viewer's rating duty, or null when he has none: not on the sheet, window shut, or not
   * allowed to rate at all. Invariant 4 — the permission is `can()`'s answer, not a role read here.
   */
  const ratingDuty =
    notation !== null &&
    notation.onSheet &&
    notation.window.state === "open" &&
    can(actor, "rating:submit", { teamId: team.id })
      ? notation.progress
      : null;
  /** Only meaningful next to `ratingDuty`: it is the deadline on notes this viewer still owes. */
  const ratingDeadline =
    ratingDuty !== null && notation !== null
      ? ratingDeadlineFr(notation.window.closesAtMs, now.getTime())
      : null;
  /**
   * Whether the « Terminer le match » card is offered, and which of its two slots it goes in.
   *
   * `!logged` is the line decision 121 draws: a match with a déroulé is `live` or `finished`
   * already, and a `live` one has a correct way to end — game mode's own final whistle, which
   * derives the minute from the reducer instead of inventing one out here.
   */
  const mayFinish = mayAmend && match.status !== "finished" && !logged;
  /** The kick-off has come round. Only the card's placement and its extra sentence depend on it. */
  const played = kickoff.getTime() <= now.getTime();
  const declarable = team.isPlayer && match.status === "scheduled";
  const myAnswer =
    answers.find((answer) => answer.teamMemberId === team.membershipId)?.status ?? null;

  const reminder = buildReminderMessage({
    // The group chat is being asked « dispo ? », and the next question is always *where*: the side
    // and the pitch travel with the opponent's name (`matchReminderTitleFr`). The competition is
    // the team's own label now (decision 107); the function lowercases it.
    title: matchReminderTitleFr({
      opponentName: match.opponentName,
      competitionFr: match.competitionLabel,
      isHome: match.isHome,
      venue: match.venue,
    }),
    when: formatWhen(kickoff, now),
    pending: tally.pending,
  });

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          href="/calendrier"
          className="inline-flex min-h-11 items-center text-sm font-medium text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          ← Calendrier
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="accent">{match.competitionLabel}</Badge>
          <Badge variant={match.isHome ? "neutral" : "warning"}>
            {capitalizeFirst(venueSideLabel(match.isHome))}
          </Badge>
          {match.status === "live" ? (
            <Badge variant="danger" solid>
              {MATCH_STATUS_LABELS.live}
            </Badge>
          ) : null}
          {/* The log of this match was reconstructed from memory rather than watched: decision 013
              put the column in the database for this sentence, and nothing had ever printed it. */}
          {entryBadge !== null ? <Badge variant="neutral">{entryBadge}</Badge> : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          {match.opponentName}
        </h1>

        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff))} à {formatTime(kickoff)}
          {match.venue ? ` · ${match.venue}` : ""}
          {` · ${periodsLabel(match.periodsCount, match.periodMinutes)}`}
        </p>

        {score ? (
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-ink tabular-nums">
              {scoreLineFr(score.goalsFor, score.goalsAgainst)}
            </span>
            {/* The score of a live match is true — it is counted from the log — but « Victoire » is
                not a thing anybody knows in the 20th minute. The result waits for the final whistle;
                the « En cours » badge above already says what state the match is in. */}
            {match.status === "finished" ? (
              <span className="text-sm font-medium text-ink-muted">
                {resultLabel(score.goalsFor, score.goalsAgainst)}
              </span>
            ) : null}
          </p>
        ) : null}

        {isCoach ? (
          <div className="pt-1">
            <ButtonLink href={`/match/${match.id}/modifier`} variant="secondary" size="sm">
              Modifier
            </ButtonLink>
          </div>
        ) : null}
      </header>

      {/* A match already played, with nothing in its log, is on this page for exactly one reason:
          the coach is here to type it up (decision 121). So it leads — above the availability grid
          and the « relancer » message, which are both a record of a question that closed. The same
          argument the comment below makes for moving « Après le match » up. */}
      {mayFinish && played ? (
        <FinishMatchCard teamId={team.id} matchId={match.id} beforeKickoff={false} />
      ) : null}

      {declarable ? (
        <Card title="Ta réponse" description="Un seul appui. Tu peux changer d’avis jusqu’au coup d’envoi.">
          <AvailabilityControl
            kind="match"
            teamId={team.id}
            eventId={match.id}
            value={myAnswer}
            legend={`Ta disponibilité pour le match ${matchNameFr(match.opponentName, match.isHome)}`}
          />
        </Card>
      ) : null}

      {/* Before the kick-off this is the question of the day, so it leads. Afterwards it is a record
          of something nobody can change, and it was pushing « Après le match » — the one thing a
          player still has to do, and the one that expires at the next kick-off (decision 007) —
          nine hundred pixels down a phone. It moves to the bottom, below. */}
      {match.status === "scheduled" ? (
        <AvailabilityGrid tally={tally} notes={notes} selfMembershipId={team.membershipId} />
      ) : null}

      {/* Nothing left to chase once the match has kicked off. */}
      {isCoach && match.status === "scheduled" ? (
        <ReminderCard message={reminder} pending={tally.pending.length} />
      ) : null}

      {/* The match sheet and the compositions are the coach's job (`docs/PLAN.md`, screen 3): a
          player sees the availability grid above and nothing else. */}
      {isCoach ? <CompositionCard team={team} match={match} /> : null}

      {/* The reading half of the match, once it is **over**: the recap for everybody, and the rating
          flow for whoever still owes notes. A player who has finished is told so, because a link that
          silently disappears reads as a bug.

          `finished`, not « has kicked off ». A live match had this card and « Mode match » on screen
          at the same time — « Voir le résumé » directly above « Reprendre le mode match » — and the
          summary it opened stated a man of the match and the minutes played of an afternoon that was
          0–0 in its 12th minute. The recap refuses a live match now too; this is the link that should
          never have offered it (decision 113). */}
      {match.status === "finished" ? (
        <Card title="Après le match" as="h2">
          <div className="space-y-3">
            {ratingDuty && !ratingDuty.complete ? (
              <>
                <p className="text-sm text-ink-muted">
                  {ratingDuty.partial
                    ? `Il te reste ${ratingDuty.missingIds.length} note${ratingDuty.missingIds.length > 1 ? "s" : ""} à donner. Tu verras celles des autres quand tu auras fini.`
                    : "Tu n’as pas encore noté tes coéquipiers. Les notes des autres restent cachées jusque-là."}
                </p>
                {/* The comment above calls this « the one that expires at the next kick-off », and
                    the card never said when that was (decision 079). */}
                {ratingDeadline ? (
                  <p className="text-sm font-medium text-ink">{ratingDeadline}</p>
                ) : null}
                <ButtonLink href={`/match/${match.id}/notation`} fullWidth>
                  Noter mes coéquipiers
                </ButtonLink>
              </>
            ) : null}

            {ratingDuty?.complete ? (
              <p className="text-sm text-ink-muted">
                Tu as noté tout le monde&nbsp;: les notes de l’équipe sont visibles dans le résumé.
              </p>
            ) : null}

            <ButtonLink
              href={`/match/${match.id}/recap`}
              variant={ratingDuty && !ratingDuty.complete ? "secondary" : "primary"}
              fullWidth
            >
              Voir le résumé
            </ButtonLink>
          </div>
        </Card>
      ) : null}

      {/* The second of the two slots `mayFinish` can fill: a fixture still to come. Low on the page,
          because closing one before its kick-off is a rare deliberate act and must not push « Ta
          réponse » and the composition down the screen. */}
      {mayFinish && !played ? (
        <FinishMatchCard teamId={team.id} matchId={match.id} beforeKickoff />
      ) : null}

      {/* « Saisie rétroactive » (`docs/PLAN.md`, screen 8). A match played without the phone is typed
          up here and becomes an ordinary event log; a match that already has one is corrected action
          by action. `score === null` means not one event was ever recorded. */}
      {mayAmend && match.status === "finished" ? (
        <Card title={score === null ? "Saisir le match" : "Corriger le match"} as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {score === null
                ? "Ce match a été joué sans le téléphone. Renseigne qui a joué et les buts : le score, les minutes et les clean sheets se déduisent."
                : "Un but attribué au mauvais joueur, une action oubliée : la correction s’ajoute au déroulé, elle ne le réécrit pas."}
            </p>
            <ButtonLink
              href={`/match/${match.id}/saisie`}
              variant={score === null ? "primary" : "secondary"}
              fullWidth
            >
              {score === null ? "Saisir le match" : "Corriger une action"}
            </ButtonLink>
            {/* The undo for « Marquer comme terminé », and the reason that button needs no dialog.
                Only while the log is empty: once there is a déroulé, going back to `scheduled` would
                mean voiding events to stay coherent, which is a different feature (decision 121). */}
            {!logged ? (
              <form action={reopenMatch}>
                <input type="hidden" name="teamId" value={team.id} />
                <input type="hidden" name="matchId" value={match.id} />
                <Button type="submit" variant="ghost" fullWidth>
                  Terminé par erreur ? Rouvrir le match
                </Button>
              </form>
            ) : null}
          </div>
        </Card>
      ) : null}

      {/* Open to every member, not just the operator: following the score from the touchline is
          legitimate, and game mode itself decides who may record an action (`can()`).

          Not offered at all for a match that is over with nothing recorded — `score === null`, the
          same signal the « Saisir le match » card above uses. « Le déroulé reste consultable » is
          untrue there: opening it shows « Rien pour l’instant », and a full-width primary button is
          a poor way to say that nothing happened. The card above is the real next action, and
          decision 013's whole point is that the app does not pretend to hold a record of an
          afternoon nobody recorded. */}
      {match.status === "finished" && score === null ? null : (
        <Card title="Mode match" as="h2">
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {match.status === "finished"
                ? "Le match est terminé : le déroulé reste consultable."
                : "Chronomètre, buts, remplacements et minutes jouées, en direct."}
            </p>
            <ButtonLink href={`/match/${match.id}/jeu`} fullWidth>
              {match.status === "live"
                ? "Reprendre le mode match"
                : match.status === "finished"
                  ? "Voir le déroulé"
                  : "Ouvrir le mode match"}
            </ButtonLink>
          </div>
        </Card>
      )}

      {/* Last, once the match has started: who had said what is worth keeping — Mehdi's « en
          déplacement ce week-end » is why he is not in the log — but it is history, and `past` is
          what stops the card asking a question that closed at the kick-off. */}
      {match.status === "scheduled" ? null : (
        <AvailabilityGrid
          tally={tally}
          notes={notes}
          selfMembershipId={team.membershipId}
          past="match"
        />
      )}
    </div>
  );
}

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
 */

import { notFound } from "next/navigation";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { can } from "@/lib/auth/can";
import { requireTeamContext } from "@/lib/auth/dal";
import {
  COMPETITION_LABELS,
  MATCH_STATUS_LABELS,
  periodsLabel,
  resultLabel,
  venueSideLabel,
} from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime, formatWhen } from "@/lib/calendar/time";
import { buildReminderMessage, tallyAvailability, type Responder } from "@/lib/calendar/timeline";
import { getMatch, getMatchAnswers, getMatchScore } from "@/lib/match/queries";
import { getSquad } from "@/lib/team/queries";
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

  const [answers, squad, score] = await Promise.all([
    getMatchAnswers(match.id),
    getSquad(team.id),
    // A scheduled match has nothing in its log yet, so do not even ask.
    match.status === "scheduled" ? Promise.resolve(null) : getMatchScore(match.id),
  ]);

  const kickoff = new Date(match.kickoffAt);
  const now = new Date();

  const players: Responder[] = squad
    .filter((member) => member.isPlayer)
    .map((member) => ({ membershipId: member.membershipId, displayName: member.displayName }));
  const tally = tallyAvailability(players, answers);
  const notes = new Map(answers.map((answer) => [answer.teamMemberId, answer.note]));

  const isCoach = can(actor, "match:update", { teamId: team.id });
  const declarable = team.isPlayer && match.status === "scheduled";
  const myAnswer =
    answers.find((answer) => answer.teamMemberId === team.membershipId)?.status ?? null;

  const reminder = buildReminderMessage({
    title: `${match.opponentName} (${COMPETITION_LABELS[match.competition].toLocaleLowerCase("fr-FR")})`,
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
          <Badge variant="accent">{COMPETITION_LABELS[match.competition]}</Badge>
          <Badge variant={match.isHome ? "neutral" : "warning"}>
            {capitalizeFirst(venueSideLabel(match.isHome))}
          </Badge>
          {match.status === "live" ? (
            <Badge variant="danger" solid>
              {MATCH_STATUS_LABELS.live}
            </Badge>
          ) : null}
        </div>

        <h1 className="text-2xl leading-tight font-bold tracking-tight text-ink">
          {match.opponentName}
        </h1>

        <p className="text-sm text-ink-muted">
          {capitalizeFirst(formatDay(kickoff, now))} à {formatTime(kickoff)}
          {match.venue ? ` · ${match.venue}` : ""}
          {` · ${periodsLabel(match.periodsCount, match.periodMinutes)}`}
        </p>

        {score ? (
          <p className="flex items-baseline gap-3">
            <span className="font-mono text-3xl font-bold text-ink tabular-nums">
              {score.goalsFor} – {score.goalsAgainst}
            </span>
            <span className="text-sm font-medium text-ink-muted">
              {resultLabel(score.goalsFor, score.goalsAgainst)}
            </span>
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

      {declarable ? (
        <Card title="Ta réponse" description="Un seul appui. Tu peux changer d’avis jusqu’au coup d’envoi.">
          <AvailabilityControl
            kind="match"
            teamId={team.id}
            eventId={match.id}
            value={myAnswer}
            legend={`Ta disponibilité contre ${match.opponentName}`}
          />
        </Card>
      ) : null}

      <AvailabilityGrid tally={tally} notes={notes} selfMembershipId={team.membershipId} />

      {/* Nothing left to chase once the match has kicked off. */}
      {isCoach && match.status === "scheduled" ? (
        <ReminderCard message={reminder} pending={tally.pending.length} />
      ) : null}

      {/* The match sheet and the compositions are the coach's job (`docs/PLAN.md`, screen 3): a
          player sees the availability grid above and nothing else. */}
      {isCoach ? <CompositionCard team={team} match={match} /> : null}

      {/* Open to every member, not just the operator: following the score from the touchline is
          legitimate, and game mode itself decides who may record an action (`can()`). */}
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
    </div>
  );
}

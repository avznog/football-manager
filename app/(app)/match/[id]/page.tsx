/**
 * A match: when, where, and what can be done with it.
 *
 * Readable by every member of the team. Editing is coach-only and goes through `can()`. It used to
 * lead with « Ta réponse » and the squad's availability grid, and the coach's « relancer » message;
 * all three went with availability (decision 156).
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
 * `getNotationView`, which owns the rule (decision 159: the sheet's starters, substitutes and
 * supporters) — this page restates none of it.
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
  periodsLabel,
  resultLabel,
  scoreLineFr,
  venueSideLabel,
} from "@/lib/calendar/labels";
import { capitalizeFirst, formatDay, formatTime } from "@/lib/calendar/time";
import { reopenMatch } from "@/lib/match/actions";
import { getMatch, getMatchScore, hasMatchEvents } from "@/lib/match/queries";
import { ratingInvitationFr } from "@/lib/rating/labels";
import { getNotationView } from "@/lib/rating/queries";
import { FinishMatchCard } from "./_components/finish-match-card";
import { CompositionCard } from "./composition/_components/composition-card";

export async function generateMetadata({ params }: PageProps<"/match/[id]">) {
  const [{ team }, { id }] = await Promise.all([requireTeamContext(), params]);
  const match = await getMatch(team.id, id);
  return { title: match ? `Match · ${match.opponentName}` : "Match introuvable" };
}

export default async function MatchPage({ params }: PageProps<"/match/[id]">) {
  const [{ actor, team }, { id }] = await Promise.all([requireTeamContext(), params]);

  const match = await getMatch(team.id, id);
  if (!match) notFound();

  const [score, logged] = await Promise.all([
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

  const isCoach = can(actor, "match:update", { teamId: team.id });
  // Typing a match up, or rewriting it days later, is the coach's — not the match operator's
  // (decision 004). Invariant 4: the permission is `can()`'s answer.
  const mayAmend = can(actor, "match:amend", { teamId: team.id });
  /**
   * This viewer's rating duty, or null when he has none: the match is not finished, his account may
   * not rate, or he was not on this match's sheet (`notation.eligible`, decision 159 — a member who was
   * not selected is not asked). Invariant 4 — the permission is `can()`'s answer, and the sheet half is
   * `getNotationView`'s; neither is a role read here.
   *
   * It used to require `notation.played` and an open window. Decision 139 removed both and nothing
   * closes, so a supporter gets this card and a man who has read the means still gets it if he never
   * sent his notes.
   *
   * `requiredCount > 0` stays, and it carries more weight than it looks: an empty set is *vacuously*
   * complete, so without it a match nobody played would congratulate every reader on having noted
   * everybody. `notation.played` used to rule that out as a side effect.
   */
  const ratingDuty =
    notation !== null &&
    notation.finished &&
    notation.eligible &&
    notation.progress.requiredCount > 0 &&
    can(actor, "rating:submit", { teamId: team.id })
      ? notation.progress
      : null;
  /**
   * Whether the « Terminer le match » card is offered.
   *
   * `!logged` is the line decision 121 draws: a match with a déroulé is `live` or `finished`
   * already, and a `live` one has a correct way to end — game mode's own final whistle, which
   * derives the minute from the reducer instead of inventing one out here.
   */
  const mayFinish = mayAmend && match.status !== "finished" && !logged;
  /** The kick-off has come round. Only the card's extra sentence depends on it now (decision 174). */
  const played = kickoff.getTime() <= now.getTime();
  const finished = match.status === "finished";

  /*
   * Open to every member, not just the operator: following the score from the touchline is
   * legitimate, and game mode itself decides who may record an action (`can()`).
   *
   * Not offered at all for a match that is over with nothing recorded — `score === null`, the same
   * signal the « Saisir le match » card uses. « Le déroulé reste consultable » is untrue there:
   * opening it shows « Rien pour l’instant », and a full-width primary button is a poor way to say
   * that nothing happened. The retro card is the real next action, and decision 013's whole point is
   * that the app does not pretend to hold a record of an afternoon nobody recorded.
   *
   * Where it goes depends on whether the match is over (decision 174): first while it is still to be
   * played or being played, because that is what the page is opened for on a Sunday; last once it is
   * finished, under the recap and the corrections that are then the reasons to be here.
   */
  const gameModeCard =
    finished && score === null ? null : (
      <Card title="Mode match" as="h2">
        <div className="space-y-3">
          <p className="text-sm text-ink-muted">
            {finished
              ? "Le match est terminé : le déroulé reste consultable."
              : "Chronomètre, buts, remplacements et minutes jouées, en direct."}
          </p>
          <ButtonLink href={`/match/${match.id}/jeu`} fullWidth>
            {match.status === "live"
              ? "Reprendre le mode match"
              : finished
                ? "Voir le déroulé"
                : "Ouvrir le mode match"}
          </ButtonLink>
        </div>
      </Card>
    );

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

      {/* A match not over yet reads in the order of the afternoon (decision 174): « Mode match », the
          composition, then « Terminer le match ». */}
      {finished ? null : gameModeCard}

      {/* The match sheet and the compositions are the coach's job (`docs/PLAN.md`, screen 3): a
          player does not see them here. */}
      {isCoach ? <CompositionCard team={team} match={match} /> : null}

      {/* The reading half of the match, once it is **over**: the recap for everybody, and the rating
          flow for whoever still owes notes. A player who has finished is told so, because a link that
          silently disappears reads as a bug.

          `finished`, not « has kicked off ». A live match had this card and « Mode match » on screen
          at the same time — « Voir le résumé » directly above « Reprendre le mode match » — and the
          summary it opened stated a man of the match and the minutes played of an afternoon that was
          0–0 in its 12th minute. The recap refuses a live match now too; this is the link that should
          never have offered it (decision 113). */}
      {finished ? (
        <Card title="Après le match" as="h2">
          <div className="space-y-3">
            {ratingDuty && !ratingDuty.complete ? (
              <>
                {/* Both sentences used to end in the bargain decision 021 struck — « tu verras
                    celles des autres quand tu auras fini », « les notes des autres restent cachées
                    jusque-là ». Decision 137 pays nobody for rating, and decision 139 leaves nothing
                    to wait for either: what is left is the duty itself. « les joueurs » rather than
                    « ceux qui étaient sur le terrain avec toi », because the reader may not have been
                    on it at all. */}
                <p className="text-sm text-ink-muted">
                  {ratingDuty.partial
                    ? `Il te reste ${ratingDuty.missingIds.length} note${ratingDuty.missingIds.length > 1 ? "s" : ""} à donner.`
                    : "Tu n’as pas encore noté les joueurs de ce match."}
                </p>
                {/* No deadline to state (decision 079 applied to the absence of one): who decides, and
                    whether the figures he is about to move are already out. */}
                <p className="text-sm font-medium text-ink">
                  {ratingInvitationFr(notation?.meansVisible ?? false)}
                </p>
                <ButtonLink href={`/match/${match.id}/notation`} fullWidth>
                  Noter les joueurs
                </ButtonLink>
              </>
            ) : null}

            {ratingDuty?.complete ? (
              <p className="text-sm text-ink-muted">
                {notation?.meansVisible
                  ? "Tu as noté tout le monde, et les moyennes de ce match sont sorties."
                  : "Tu as noté tout le monde : les moyennes sortiront quand le coach les sortira."}
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

      {/* Under the composition whether or not the kick-off has come round (decision 174, which moved
          it from the top of the page for a match already played): declaring a match over is the last
          thing done with it, and it must not push game mode and the composition down the screen. */}
      {mayFinish ? (
        <FinishMatchCard teamId={team.id} matchId={match.id} beforeKickoff={!played} />
      ) : null}

      {/* « Saisie rétroactive » (`docs/PLAN.md`, screen 8). A match played without the phone is typed
          up here and becomes an ordinary event log; a match that already has one is corrected action
          by action. `score === null` means not one event was ever recorded. */}
      {mayAmend && finished ? (
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

      {/* A finished match keeps game mode last: the déroulé is consultation now. */}
      {finished ? gameModeCard : null}
    </div>
  );
}

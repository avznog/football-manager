/**
 * The ratings of the match: one mean per player for everybody, and the notes themselves for the coach.
 *
 * ## Two readers, one component, and the difference is in the data
 *
 * Decision 137 splits this screen in two, and the split is **not** done here. `getRatingResults`
 * decides both halves before it issues a select: an unpublished match's scores are never read for the
 * team at all, and a reader who is not the coach receives `received: []` and `count: null` for every
 * player. So the `canSeeNotes` branches below are about *layout*, not about secrecy — there is
 * nothing in the RSC payload for a crafted request or a DevTools inspection to find. See
 * `lib/rating/queries.ts`.
 *
 * What each reader gets:
 *
 * - **a player** reads « Karim · 7,5 », once the coach has shown the means. No count, which is the
 *   question the owner was asked and answered: on his own row the count is an invitation to work out
 *   who did not rate him, and in a squad of a dozen that arithmetic is easy and poisonous;
 * - **the coach** reads « Karim · 7,5 (5 notes) » and under it every note with its author —
 *   **whether or not he has shown them** (decision 190). When he has not, the card says so above the
 *   figures and his « Sortir les moyennes » button sits under them: what he is looking at is not what
 *   the squad can look at, and a screen that did not say which of the two it was showing him would be
 *   worse than one that made him publish to find out.
 *
 * ## Why « en attente » is not a locked door any more
 *
 * Decision 007 showed this panel empty with « note tes coéquipiers pour voir les notes » — the reader's
 * own debt was the lock, and the sentence was about him. Decision 021 was that rule and it is gone. Under
 * decision 139 the wait is not the team's either: **it is the coach's call, per match**, and nothing else
 * ever opens this. So the empty state names who decides rather than counting who is late — a player
 * reading « on attend encore 4 personnes » would be waiting for something that is not what gates him.
 *
 * The switch goes both ways, which is why the published half of this component also carries a form: a
 * coach who can show the means can always take them back (`ratings-visibility-form.tsx`).
 */

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pluralize } from "@/lib/calendar/labels";
import { MIN_NOTES_FOR_MEAN } from "@/lib/rating/aggregate";
import { noteAuthorFr, ratingCountNoteFr, ratingScoreFr } from "@/lib/rating/labels";
import type { RatedPlayer, RatingResultsView } from "@/lib/rating/queries";
import { RatingsVisibilityForm } from "./ratings-visibility-form";

export function RatingsPanel({
  results,
  teamId,
  matchId,
  mayRate,
}: {
  results: RatingResultsView;
  teamId: string;
  matchId: string;
  /**
   * He has notes left to give, so the « noter mes coéquipiers » button leads somewhere. Not « the window
   * is still open » any more: nothing closes (decision 139), so this is only about his own set.
   */
  mayRate: boolean;
}) {
  if (!results.readable) {
    return (
      <Card title="Les notes" as="h2">
        <div className="space-y-3">
          <EmptyState
            title="Les moyennes ne sont pas encore sorties"
            description={pendingDescriptionFr(results, mayRate)}
            action={
              mayRate && !results.progress.complete ? (
                <ButtonLink href={`/match/${matchId}/notation`}>
                  {results.progress.submittedCount > 0
                    ? "Finir mes notes"
                    : "Noter mes coéquipiers"}
                </ButtonLink>
              ) : undefined
            }
          />

          {/* Unreachable as the permissions stand, and kept rather than deleted: `rating:readNotes`
              and `rating:publish` are both the coach's (`lib/auth/can.ts`), so a reader who lands in
              this branch — he cannot read the notes, hence decision 190 does not open the figures for
              him — never has the switch either. If the two are ever separated, the man who may
              publish must not lose the button. */}
          {results.canPublish ? (
            <RatingsVisibilityForm
              teamId={teamId}
              matchId={matchId}
              mode="show"
              silent={results.tally?.silent.length ?? 0}
            />
          ) : null}
        </div>
      </Card>
    );
  }

  const rated = results.players.filter((player) => player.average !== null);

  /**
   * A published match can hold notes and still produce no mean at all: `MIN_NOTES_FOR_MEAN` is about
   * the **figure**, not about the notes. The coach is the one reader the notes belong to, so he keeps
   * them and reads « — » where the mean is withheld; for everybody else there is genuinely nothing on
   * the screen, and they get the sentence instead. Hiding the notes from the coach here would mean the
   * one state in which he most wants to know what little came in is the one state he cannot look at.
   */
  const hasRows = rated.length > 0 || (results.canSeeNotes && results.ratingCount > 0);

  /**
   * The switch, whichever way it points, and null for a reader who does not hold it.
   *
   * One expression rather than two call sites, because under decision 190 the coach reaches the
   * *published* layout of this card while the means are still in — so « Sortir les moyennes » now has
   * to be reachable from the full panel and from the « pas encore assez de notes » state, and not
   * only from the empty one it used to live in.
   */
  const visibilitySwitch = results.canHide ? (
    <RatingsVisibilityForm teamId={teamId} matchId={matchId} mode="hide" silent={0} />
  ) : results.canPublish ? (
    <RatingsVisibilityForm
      teamId={teamId}
      matchId={matchId}
      mode="show"
      silent={results.tally?.silent.length ?? 0}
    />
  ) : null;

  /** « pas encore sorties » — the coach is reading figures the squad cannot (decision 190). */
  const hiddenBadge = results.published ? null : (
    <Badge variant="warning">pas encore sorties</Badge>
  );

  if (!hasRows) {
    return (
      <Card title="Les notes" as="h2" action={hiddenBadge ?? undefined}>
        <div className="space-y-3">
          <EmptyState
            title="Pas encore assez de notes"
            description={`Il en faut au moins ${MIN_NOTES_FOR_MEAN} sur un même joueur pour en faire une moyenne : deux avis ne sont pas un verdict.`}
            action={
              mayRate ? (
                <ButtonLink href={`/match/${matchId}/notation`}>Noter mes coéquipiers</ButtonLink>
              ) : undefined
            }
          />

          {/* Either half of the switch. Published and empty is the state the coach will want to undo;
              unpublished and empty is the state he reads before deciding — and he gets here now
              rather than to the « pas encore sorties » card above (decision 190). */}
          {visibilitySwitch}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Les notes"
      description={panelDescriptionFr(results, rated.length)}
      as="h2"
      action={hiddenBadge ?? undefined}
      flush
    >
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {results.players.map((player) => (
          <li key={player.memberId} className="px-4 py-3">
            <PlayerRow player={player} />
          </li>
        ))}
      </ul>

      {/* The switch. Below the figures rather than above them, because the card is here to be read and
          this is an action on it — and `flush` means the padding is ours. */}
      {visibilitySwitch ? (
        <div className="border-t border-border/60 px-4 py-3">{visibilitySwitch}</div>
      ) : null}
    </Card>
  );
}

/**
 * What the card says about itself, to the two people who can be reading it.
 *
 * The coach alone gets a denominator, and it is **the match sheet** rather than the players with
 * minutes or the whole team: its starters, substitutes and supporters are who may rate (decision
 * 159), so « 23 notes, 5 sur 12 de la feuille de match » is the state of the collection. `tally` is
 * null for every other reader.
 *
 * And since decision 190 it also has to say **which of the two screens he is on**: a coach reading
 * figures nobody else can read is told so in words, not only by the badge. « tu es le seul à les
 * voir » rather than « elles sont masquées » — the second describes the team's screen, and the
 * sentence is about his.
 */
function panelDescriptionFr(
  results: Extract<RatingResultsView, { readable: true }>,
  ratedCount: number,
): string {
  if (!results.tally) {
    return "La moyenne des notes des coéquipiers, pour chaque joueur qui était sur le terrain.";
  }

  const parts = [`${pluralize(results.ratingCount, "note")}, ${tallyFractionFr(results.tally)}.`];
  if (!results.published) {
    parts.push("Les moyennes ne sont pas encore sorties : tu es le seul à les voir.");
  }
  if (ratedCount === 0) {
    // « ne se calcule » rather than « n'est sortie », which decision 190 made ambiguous: on his
    // screen « sortie » is now about publication and this sentence is about the floor.
    parts.push(
      `Aucune moyenne ne se calcule : il en faut ${MIN_NOTES_FOR_MEAN} sur un même joueur.`,
    );
  }
  return parts.join(" ");
}

/**
 * Why the means are not out, said differently to the two people who can read it.
 *
 * The coach is told **who** has sent nothing, by name: he is the one who can go and ask, and the
 * alternative is a button that shows the means « sans les séries qui manquent » without saying whose. The
 * denominator is the match sheet — its starters, substitutes and supporters — not the players with
 * minutes and not the whole team, because that is who may rate (decision 159). Nobody who was not
 * selected is named: he cannot rate, and asking him to would be asking for a refusal.
 *
 * Everybody else is told that the coach decides, and nothing else. Not « quand tout le monde aura
 * noté » — that was decision 137's rule and it published matches by itself; a reader waiting for the
 * squad would be waiting for the wrong thing. And not the names either: they would turn a wait into a
 * list of people to blame, when the only person who can end it is the coach.
 */
function pendingDescriptionFr(
  results: Extract<RatingResultsView, { readable: false }>,
  mayRate: boolean,
): string {
  const mine =
    mayRate && !results.progress.complete
      ? ` Il te reste ${pluralize(results.progress.missingIds.length, "note")} à mettre.`
      : "";

  const tally = results.tally;
  // `tally` is the coach's and nobody else's, so it is also what decides the person of the sentence: he
  // is addressed as the one who decides, everybody else is told who does.
  const decides = tally
    ? "C’est toi qui décides quand les moyennes sortent."
    : "C’est le coach qui décide quand les moyennes sortent.";

  if (tally && tally.silent.length > 0) {
    const names = tally.silent.map((member) => member.displayName).join(", ");
    return (
      `${tallyFractionFr(tally)} ${tally.raterCount > 1 ? "ont" : "a"} noté. ` +
      `Pas encore de note de ${names}. ${decides}${mine}`
    );
  }

  return `${decides}${mine}`;
}

/**
 * « 5 sur 12 de la feuille de match » — who has spoken, out of whom. Named after the sheet rather than
 * « membres », because the denominator is not the team any more (decision 159) and a coach reading
 * « 12 » next to a squad of 18 is owed the reason.
 */
function tallyFractionFr(tally: { raterCount: number; memberTotal: number }): string {
  return `${tally.raterCount} sur ${tally.memberTotal} de la feuille de match`;
}

function PlayerRow({ player }: { player: RatedPlayer }) {
  return (
    <>
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {player.jerseyNumber !== null ? (
              <span className="font-mono text-xs text-ink-subtle tabular-nums">
                {player.jerseyNumber}
              </span>
            ) : null}
            <span className="truncate font-medium text-ink">{player.displayName}</span>
            {player.squadRole === "substitute" ? (
              <Badge variant="neutral">entré en jeu</Badge>
            ) : null}
          </span>

          {/* How many notes the figure rests on — **coach only**. `count` is null for every other
              reader, so there is nothing to hide with a conditional class. */}
          {player.count !== null ? (
            <span className="mt-0.5 block text-xs text-ink-subtle">
              {ratingCountNoteFr(player.count)}
            </span>
          ) : null}
        </span>

        <span className="shrink-0 text-right">
          <span className="font-mono text-2xl font-bold text-ink tabular-nums">
            {player.averageLabel}
          </span>
          <span className="block text-xs text-ink-subtle">/ 10</span>
        </span>
      </div>

      {/* The only place in the app where an individual note appears, and the only reader who ever gets
          one. `received` is empty for everybody else (decision 137). */}
      {player.received.length > 0 ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {player.received.map((note) => (
            <li
              key={note.raterMemberId}
              className="flex items-baseline gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-muted"
            >
              <span className="font-mono font-semibold text-ink tabular-nums">
                {ratingScoreFr(note.score)}
              </span>
              <span className="truncate">{noteAuthorFr(note)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

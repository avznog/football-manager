/**
 * The ratings of the match: one mean per player for everybody, and the notes themselves for the coach.
 *
 * ## Two readers, one component, and the difference is in the data
 *
 * Decision 137 splits this screen in two, and the split is **not** done here. `getRatingResults`
 * decides both halves before it issues a select: an unpublished match's scores are never read at all,
 * and a reader who is not the coach receives `received: []` and `count: null` for every player. So the
 * `canSeeNotes` branches below are about *layout*, not about secrecy — there is nothing in the RSC
 * payload for a crafted request or a DevTools inspection to find. See `lib/rating/queries.ts`.
 *
 * What each reader gets:
 *
 * - **a player** reads « Karim · 7,5 ». No count, which is the question the owner was asked and
 *   answered: on his own row the count is an invitation to work out who did not rate him, and in a
 *   squad of a dozen that arithmetic is easy and poisonous;
 * - **the coach** reads « Karim · 7,5 (5 notes) » and under it every note with its author.
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
  if (!results.published) {
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

          {/* Coach only, and the only thing that ever opens this (decision 139) — nothing publishes a
              match by itself any more, so this is not an escape hatch but the door. */}
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

  if (!hasRows) {
    return (
      <Card title="Les notes" as="h2">
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

          {/* The coach has shown a match that has nothing to show, which is exactly the state he will
              want to undo. Offering the way back here rather than only on the full panel is the whole
              point of a switch that goes both ways. */}
          {results.canHide ? (
            <RatingsVisibilityForm teamId={teamId} matchId={matchId} mode="hide" silent={0} />
          ) : null}
        </div>
      </Card>
    );
  }

  return (
    <Card
      title="Les notes"
      /* The coach alone gets a denominator, and it is now **the members** rather than the players with
         minutes: everybody may rate (decision 139), so « 23 notes, 5 membres sur 11 » is the state of the
         collection. `tally` is null for every other reader. */
      description={
        results.tally
          ? `${pluralize(results.ratingCount, "note")}, ${results.tally.raterCount} membre${results.tally.raterCount > 1 ? "s" : ""} sur ${results.tally.memberTotal}.` +
            (rated.length === 0
              ? ` Aucune moyenne n’est sortie : il en faut ${MIN_NOTES_FOR_MEAN} sur un même joueur.`
              : "")
          : "La moyenne des notes des coéquipiers, pour chaque joueur qui était sur le terrain."
      }
      as="h2"
      flush
    >
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {results.players.map((player) => (
          <li key={player.memberId} className="px-4 py-3">
            <PlayerRow player={player} />
          </li>
        ))}
      </ul>

      {/* The other half of the switch. Below the figures rather than above them, because the card is
          here to be read and this is an action on it — and `flush` means the padding is ours. */}
      {results.canHide ? (
        <div className="border-t border-border/60 px-4 py-3">
          <RatingsVisibilityForm teamId={teamId} matchId={matchId} mode="hide" silent={0} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Why the means are not out, said differently to the two people who can read it.
 *
 * The coach is told **who** has sent nothing, by name: he is the one who can go and ask, and the
 * alternative is a button that shows the means « sans les séries qui manquent » without saying whose. The
 * denominator is the active members, not the players with minutes, because that is who may rate now
 * (decision 139).
 *
 * Everybody else is told that the coach decides, and nothing else. Not « quand tout le monde aura
 * noté » — that was decision 137's rule and it published matches by itself; a reader waiting for the
 * squad would be waiting for the wrong thing. And not the names either: they would turn a wait into a
 * list of people to blame, when the only person who can end it is the coach.
 */
function pendingDescriptionFr(
  results: Extract<RatingResultsView, { published: false }>,
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
      `${tally.raterCount} membre${tally.raterCount > 1 ? "s" : ""} sur ${tally.memberTotal} ${tally.raterCount > 1 ? "ont" : "a"} noté. ` +
      `Pas encore de note de ${names}. ${decides}${mine}`
    );
  }

  return `${decides}${mine}`;
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

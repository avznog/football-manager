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
 * own debt was the lock, and the sentence was about him. Decision 021 was that rule and it is gone: the
 * means come out when *everybody* has rated, so the waiting is the team's and the sentence says so.
 * Nobody is reproached for a figure he cannot unlock alone, and the anti-anchoring property the gate
 * existed for is kept more strongly than before — no player reads any individual note, ever.
 */

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pluralize } from "@/lib/calendar/labels";
import { MIN_NOTES_FOR_MEAN } from "@/lib/rating/aggregate";
import { noteAuthorFr, ratingCountNoteFr, ratingScoreFr } from "@/lib/rating/labels";
import type { RatedPlayer, RatingResultsView } from "@/lib/rating/queries";
import { PublishRatingsForm } from "./publish-ratings-form";

export function RatingsPanel({
  results,
  teamId,
  matchId,
  canStillRate,
}: {
  results: RatingResultsView;
  teamId: string;
  matchId: string;
  /** The window is still open, so the « note tes coéquipiers » button leads somewhere. */
  canStillRate: boolean;
}) {
  if (!results.published) {
    return (
      <Card title="Les notes" as="h2">
        <div className="space-y-3">
          <EmptyState
            title="Les moyennes ne sont pas encore sorties"
            description={pendingDescriptionFr(results, canStillRate)}
            action={
              canStillRate && !results.progress.complete ? (
                <ButtonLink href={`/match/${matchId}/notation`}>
                  {results.progress.submittedCount > 0
                    ? "Finir mes notes"
                    : "Noter mes coéquipiers"}
                </ButtonLink>
              ) : undefined
            }
          />

          {/* Coach only, and only while something is actually owed — `canPublish` carries both. */}
          {results.canPublish ? (
            <PublishRatingsForm teamId={teamId} matchId={matchId} owing={results.owing.length} />
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
        <EmptyState
          title="Pas encore assez de notes"
          description={`Il en faut au moins ${MIN_NOTES_FOR_MEAN} sur un même joueur pour en faire une moyenne : deux avis ne sont pas un verdict.`}
          action={
            canStillRate ? (
              <ButtonLink href={`/match/${matchId}/notation`}>Noter mes coéquipiers</ButtonLink>
            ) : undefined
          }
        />
      </Card>
    );
  }

  return (
    <Card
      title="Les notes"
      /* The coach alone gets a denominator: « 23 notes de 5 joueurs sur 7 » is the state of the
         collection, and `raterTotal` is 0 for everybody else. */
      description={
        results.canSeeNotes
          ? `${pluralize(results.ratingCount, "note")} sur ${pluralize(results.raterTotal, "joueur")} à noter.` +
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
    </Card>
  );
}

/**
 * Why the means are not out, said differently to the two people who can read it.
 *
 * The coach is told **who** is missing, by name: he is the one who can go and ask, and the alternative
 * is a button that publishes « sans les séries qui manquent » without saying whose. Everybody else is
 * told how many are missing and not who — the names would turn a wait into a list of people to blame,
 * and a player cannot do anything about it anyway.
 */
function pendingDescriptionFr(
  results: Extract<RatingResultsView, { published: false }>,
  canStillRate: boolean,
): string {
  const mine =
    canStillRate && !results.progress.complete
      ? ` Il te reste ${pluralize(results.progress.missingIds.length, "note")} à mettre.`
      : "";

  if (results.canSeeNotes && results.owing.length > 0) {
    const names = results.owing.map((rater) => rater.displayName).join(", ");
    return (
      `${pluralize(results.owing.length, "joueur")} sur ${results.raterTotal} ${results.owing.length > 1 ? "n’ont" : "n’a"} pas fini : ${names}. ` +
      `Les moyennes sortiront d’un coup quand tout le monde aura noté.${mine}`
    );
  }

  return `Elles sortiront d’un coup quand tout le monde aura noté.${mine}`;
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

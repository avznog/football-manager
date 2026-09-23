/**
 * The ratings of the match — averages, who gave what, and the comments.
 *
 * Two states, and the closed one is not a UI trick: when `getRatingResults` returns
 * `visible: false`, no score of anybody else's was ever selected from the database, so there is
 * nothing in the page, the RSC payload or the DOM to uncover. See `lib/rating/queries.ts`.
 *
 * Author names are visible to everyone (decision 007): in a team of thirteen who all know each
 * other, anonymity would only invite a 2 nobody has to own.
 */

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { pluralize } from "@/lib/calendar/labels";
import type { RatingResultsView } from "@/lib/rating/queries";

export function RatingsPanel({
  results,
  matchId,
  canStillRate,
}: {
  results: RatingResultsView;
  matchId: string;
  /** The window is still open, so the « note tes coéquipiers » button leads somewhere. */
  canStillRate: boolean;
}) {
  if (!results.visible) {
    return (
      <Card title="Les notes" as="h2">
        <EmptyState
          title="Note tes coéquipiers pour voir les notes"
          description={
            canStillRate
              ? `Tu en as mis ${results.progress.submittedCount} sur ${results.progress.requiredCount}. Les notes des autres apparaissent quand tu as noté tout le monde — comme ça personne ne recopie.`
              : results.progress.submittedCount === 0
                ? "La notation est fermée et tu n’avais mis aucune note. Les notes de ce match restent masquées."
                : `La notation est fermée et tu n’avais noté que ${pluralize(results.progress.submittedCount, "joueur")} sur ${results.progress.requiredCount}. Les notes de ce match restent masquées.`
          }
          action={
            canStillRate ? (
              <ButtonLink href={`/match/${matchId}/notation`}>
                {results.progress.submittedCount > 0 ? "Finir mes notes" : "Noter mes coéquipiers"}
              </ButtonLink>
            ) : undefined
          }
        />
      </Card>
    );
  }

  const rated = results.players.filter((player) => player.count > 0);

  if (rated.length === 0) {
    return (
      <Card title="Les notes" as="h2">
        <EmptyState
          title="Personne n’a encore noté"
          description="Les notes apparaîtront ici dès que les joueurs de la feuille de match en auront mis."
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
      description={`${pluralize(results.ratingCount, "note")} de ${pluralize(results.raterCount, "joueur")} sur ${results.raterTotal}.`}
      as="h2"
      flush
    >
      <ul className="divide-y divide-border/60 border-t border-border/60">
        {results.players.map((player) => (
          <li key={player.memberId} className="px-4 py-3">
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
                <span className="mt-0.5 block text-xs text-ink-subtle">
                  {player.count === 0
                    ? "pas encore noté"
                    : `${pluralize(player.count, "note")}${
                        player.selfScore !== null ? ` · il s’est mis ${player.selfScore}` : ""
                      }`}
                </span>
              </span>

              <span className="shrink-0 text-right">
                <span className="font-mono text-2xl font-bold text-ink tabular-nums">
                  {player.averageLabel}
                </span>
                <span className="block text-xs text-ink-subtle">/ 10</span>
              </span>
            </div>

            {player.received.length > 0 ? (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {player.received.map((note) => (
                  <li
                    key={note.raterMemberId}
                    className="flex items-baseline gap-1 rounded-lg bg-surface-2 px-2 py-1 text-xs text-ink-muted"
                  >
                    <span className="font-mono font-semibold text-ink tabular-nums">
                      {note.score}
                    </span>
                    <span className="truncate">
                      {note.isSelf ? "lui-même" : note.raterName}
                      {note.isViewer && !note.isSelf ? " (toi)" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {player.received.some((note) => note.comment) ? (
              <ul className="mt-2 space-y-1">
                {player.received
                  .filter((note) => note.comment)
                  .map((note) => (
                    <li key={`${note.raterMemberId}-comment`} className="text-sm text-ink-muted">
                      <span className="italic">« {note.comment} »</span>{" "}
                      <span className="text-ink-subtle">
                        — {note.isSelf ? "lui-même" : note.raterName}
                      </span>
                    </li>
                  ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

/**
 * « Terminer le match » — declaring a match over without running game mode for it (decision 121).
 *
 * The card the coach actually wants is the retro-entry one, and that is gated on `finished`; the only
 * other writer of that column is `finalizeMatch`, which refuses without a `FINAL_WHISTLE` in the log,
 * and the only thing that appends one is game mode. So typing up a match played three weeks ago
 * without the phone used to mean starting a live clock for an afternoon that was already over.
 *
 * Two buttons, one destination. The primary finishes **and** opens the entry form, because that is
 * what the coach came for; the secondary just closes the match, for somebody who will type it up
 * later. Plain forms, no confirmation dialog: « Rouvrir le match », in the retro card once the match
 * is closed, is the undo — and a reversible action is a better answer to a mis-tap than a dialog.
 *
 * It is a component rather than inline JSX because the match page renders it in one of two places.
 * For a match already played it is the only reason the coach is on that page, so it leads; for a
 * fixture still to come, closing it is a rare deliberate act that must not push « Ta réponse » and
 * the composition down the screen.
 */

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { finishMatch } from "@/lib/match/actions";

export function FinishMatchCard({
  teamId,
  matchId,
  beforeKickoff,
}: {
  teamId: string;
  matchId: string;
  /** The kick-off has not come round yet, which is allowed and is worth saying out loud. */
  beforeKickoff: boolean;
}) {
  return (
    <Card title="Terminer le match" as="h2">
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Pas besoin du mode match pour un match joué sans le téléphone. Termine-le ici, puis
          renseigne qui a joué et les buts : le score, les minutes et les clean sheets se déduisent.
        </p>
        {/* Said out loud rather than forbidden: closing a match that has not kicked off is allowed
            on purpose, and an app that does it silently looks broken. */}
        {beforeKickoff ? (
          <p className="text-sm text-ink-muted">
            Le coup d’envoi n’a pas encore eu lieu : ce match passera dans l’historique.
          </p>
        ) : null}
        <form action={finishMatch}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="then" value="saisie" />
          <Button type="submit" fullWidth>
            Saisir le match
          </Button>
        </form>
        <form action={finishMatch}>
          <input type="hidden" name="teamId" value={teamId} />
          <input type="hidden" name="matchId" value={matchId} />
          <Button type="submit" variant="secondary" fullWidth>
            Marquer comme terminé
          </Button>
        </form>
      </div>
    </Card>
  );
}

"use client";

/**
 * « Sortir les moyennes maintenant » — the coach's escape hatch.
 *
 * It exists because the only other way a match's means come out is the whole squad finishing, and one
 * man who never rates would hold them back for ever. Somebody has to be able to say « c'est bon, on
 * n'attend plus », and `publishRatings` is idempotent so two taps on a slow connection do not move the
 * moment the notes came out.
 *
 * Since decision 138 there is no third way — the next kick-off used to shut the rating window and
 * publish what there was, and it never fired for the last match of a season, which has no next
 * kick-off. So **this button is the deadline**, and it is the only one.
 *
 * A client component for one reason: `publishRatings` has the `(prevState, formData)` shape, so the
 * error has somewhere to be shown. On success the server revalidates and this card is replaced by the
 * means themselves, which is why there is no success message to write here.
 *
 * It says what it costs, and it costs more than it used to. Publishing with notes owed is not « release
 * them a bit early »: the means are final from this tap onwards, and the people who have not rated
 * never will — not because a deadline is coming, but because this tap *is* the deadline. Before
 * decision 138 they had until the next kick-off whatever the coach did; now the window they still have
 * open is the one this button shuts.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { publishRatings } from "@/lib/rating/actions";

export function PublishRatingsForm({
  teamId,
  matchId,
  /** How many of the expected raters have not finished — the thing the coach gives up on. */
  owing,
}: {
  teamId: string;
  matchId: string;
  owing: number;
}) {
  const [state, action, pending] = useActionState(publishRatings, undefined);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="teamId" value={teamId} />
      <input type="hidden" name="matchId" value={matchId} />

      {state?.error ? (
        <p role="alert" className="text-sm font-medium text-danger">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" variant="secondary" fullWidth pending={pending}>
        Sortir les moyennes maintenant
      </Button>
      {/* Both halves are needed, and the second is new: the figures stop moving *and* the notation
          closes. It used to close on its own at the next kick-off, so the only news was the figures;
          under decision 138 nothing else closes it, and a coach who is not told that is being asked to
          end something without knowing it. */}
      <p className="text-xs text-ink-subtle">
        {owing === 1
          ? "La moyenne sera calculée sans la note qui manque, elle ne bougera plus, et plus personne " +
            "ne pourra noter ce match."
          : `Les moyennes seront calculées sans les ${owing} séries qui manquent, elles ne bougeront ` +
            "plus, et plus personne ne pourra noter ce match."}
      </p>
    </form>
  );
}

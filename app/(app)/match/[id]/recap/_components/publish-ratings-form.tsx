"use client";

/**
 * « Sortir les moyennes maintenant » — the coach's escape hatch.
 *
 * It exists because the automatic backstop has a hole the size of a season's last match: the rating
 * window closes at the *next* kick-off, and the last match of a season has none, so a team that most
 * wants its notes is the team whose notes could wait for ever. Somebody has to be able to say « c'est
 * bon, on n'attend plus », and `publishRatings` is idempotent so two taps on a slow connection do not
 * move the moment the notes came out.
 *
 * A client component for one reason: `publishRatings` has the `(prevState, formData)` shape, so the
 * error has somewhere to be shown. On success the server revalidates and this card is replaced by the
 * means themselves, which is why there is no success message to write here.
 *
 * It says what it costs. Publishing with notes owed is not « release them a bit early » — the people
 * who have not rated never will, because a note cannot be added once the window is shut, and the means
 * are final from this tap onwards.
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
      <p className="text-xs text-ink-subtle">
        {owing === 1
          ? "La moyenne sera calculée sans la note qui manque, et elle ne bougera plus."
          : `Les moyennes seront calculées sans les ${owing} séries qui manquent, et elles ne bougeront plus.`}
      </p>
    </form>
  );
}

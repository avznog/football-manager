"use client";

/**
 * The coach's switch: « Sortir les moyennes » and « Masquer les moyennes ».
 *
 * **One component, one column, two directions** (decision 139). It used to be an escape hatch — the
 * squad finishing published a match by itself, and this covered the straggler who never rated. The owner
 * turned that round: nothing publishes anything on its own any more, so this button is the *only* way a
 * match's means reach the team, and the same permission takes them back.
 *
 * Two sentences this card used to carry are now false and are gone. Publishing does **not** freeze the
 * figures — `hideRatings` puts them back, and a note that arrives afterwards still moves the mean — and
 * it does **not** close the notation, because nothing does. Saying either would be the card promising a
 * finality the server stopped enforcing.
 *
 * What is said instead is what the tap actually costs, in each direction: showing hands the team a mean
 * computed without whatever has not come in, and hiding takes back a figure people may already have
 * read. The second is the trade the owner accepted when he asked for a switch rather than a one-way
 * door, and decision 079 says a limit the app enforces is stated out loud — so is a limit it does not.
 *
 * A client component for one reason: both actions have the `(prevState, formData)` shape, so the error
 * has somewhere to be shown. On success the server revalidates and this card is replaced by the other
 * half of the switch, which is why there is no success message to write here.
 */

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { hideRatings, publishRatings } from "@/lib/rating/actions";

export function RatingsVisibilityForm({
  teamId,
  matchId,
  mode,
  silent,
}: {
  teamId: string;
  matchId: string;
  /** Which way the switch currently points — `"show"` when the means are hidden. */
  mode: "show" | "hide";
  /**
   * How many members have sent nothing, for the « sans les séries qui manquent » sentence. Only read in
   * `"show"` mode: once the means are out, who is still silent is in the panel's own description.
   */
  silent: number;
}) {
  const [state, action, pending] = useActionState(
    mode === "show" ? publishRatings : hideRatings,
    undefined,
  );

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
        {mode === "show" ? "Sortir les moyennes" : "Masquer les moyennes"}
      </Button>

      <p className="text-xs text-ink-subtle">
        {mode === "hide"
          ? "Chacun ne verra plus que ses propres notes. Une moyenne déjà lue peut donc " +
            "disparaître, et tu peux la ressortir quand tu veux."
          : showHelperFr(silent)}
      </p>
    </form>
  );
}

/**
 * What the squad will read, and what it will be missing.
 *
 * Deliberately not « plus personne ne pourra noter » — the notation stays open for ever (decision 139),
 * and the people who have not rated can still send their notes afterwards, which will move the figures
 * the team has just read. The coach is told that rather than promised the opposite.
 */
function showHelperFr(silent: number): string {
  if (silent === 0) {
    return "Tout le monde a noté : les moyennes sortiront telles quelles. Tu peux les masquer à nouveau.";
  }
  if (silent === 1) {
    return (
      "La moyenne sera calculée sans la série qui manque, et elle bougera encore si elle arrive. " +
      "Tu peux masquer les moyennes à nouveau."
    );
  }
  return (
    `Les moyennes seront calculées sans les ${silent} séries qui manquent, et elles bougeront encore ` +
    "si elles arrivent. Tu peux les masquer à nouveau."
  );
}

/**
 * What one card of the rating flow offers: which buttons are live, what they say, and what the
 * screen is waiting for.
 *
 * This used to be three ternaries inside `rating-flow.tsx`, and the flow itself used to advance on
 * its own — tap a note, and the next teammate replaced the card before the tapped number had time to
 * look tapped. The owner's report was exactly that: « il n'y a aucun effet visuel car on passe
 * directement au joueur suivant ». Advancing is now a second, deliberate tap (decision 102), which
 * means the labels have to answer three questions the auto-advance never raised — what the app wants
 * next, what the button on the last card becomes, and whether anything has been sent yet.
 *
 * Pure, and in `lib/` rather than beside the component, because Vitest collects `lib/**` and nothing
 * under `app/` (decision 097): a sentence living in a `.tsx` file is a sentence no test can read.
 */

export type RatingStepInput = {
  /** The card on screen. Out-of-range values are clamped rather than trusted. */
  index: number;
  total: number;
  /** That card's note is already sent and therefore final (decision 023): nothing to select. */
  currentLocked: boolean;
  /** A score is selected on that card, chosen but not yet sent. */
  currentSelected: boolean;
  /** Scores selected across the whole sheet and not yet sent. */
  filled: number;
  /** Cards that still owe a note — `filled` counts against this. */
  remaining: number;
};

export type RatingStepButton = {
  label: string;
  /** Primary once a note is selected: the thing to tap next is the thing that looks tappable. */
  variant: "primary" | "secondary";
};

export type RatingStep = {
  /** `index`, clamped into `[0, total - 1]`. */
  index: number;
  /** « Précédent » is live — going back to reread or to finish a card left blank. */
  canGoPrevious: boolean;
  /**
   * The forward button, or `null` on the last card: there is nothing after it, so the only way on is
   * the submit button underneath. A disabled « Suivant » there would be a button that looks
   * pressable and does nothing.
   */
  next: RatingStepButton | null;
  /** The line under the pad saying what the card is waiting for, or `null` when it waits for nothing. */
  hint: string | null;
  submit: RatingStepButton & { enabled: boolean };
  /** Under the submit button: how much is chosen and still unsent, or `null` when nothing is. */
  unsent: string | null;
};

export function clampIndex(index: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(Math.max(0, Math.trunc(index)), total - 1);
}

export function nextIndex(index: number, total: number): number {
  return clampIndex(index + 1, total);
}

export function previousIndex(index: number, total: number): number {
  return clampIndex(index - 1, total);
}

export function ratingStep(input: RatingStepInput): RatingStep {
  const index = clampIndex(input.index, input.total);
  const isLast = index >= input.total - 1;
  const nothingToDoHere = input.currentLocked || input.currentSelected;

  // Everybody who still owed a note has one selected: the sheet is complete on this device, and the
  // submit button is the end of the flow rather than a save point in the middle of it.
  const allFilled = input.remaining > 0 && input.filled >= input.remaining;

  return {
    index,
    canGoPrevious: index > 0,
    next: isLast
      ? null
      : nothingToDoHere
        ? { label: "Suivant", variant: "primary" }
        : // Not a disabled « Suivant »: a partial set is allowed (decision 023) and a card can be
          // left blank on purpose, but the button has to say that is what it does.
          { label: "Passer sans noter", variant: "secondary" },
    hint: nothingToDoHere ? null : "Appuie sur une note, puis sur Suivant.",
    submit: {
      label: allFilled ? "Terminer et voir le résumé" : "Enregistrer mes notes",
      variant: "primary",
      enabled: input.filled > 0,
    },
    unsent: unsentNoteFr(input.filled),
  };
}

/**
 * The line under the pad naming the note just chosen, or `null` when none is.
 *
 * The highlighted token says it too, but in words it also survives a phone held at arm's length in
 * the sun, and it is what a screen reader hears when the live region updates. « choisie », not
 * « enregistrée »: at this point it is on the phone and nowhere else.
 *
 * Not « ta note » here, however much the app tutoies (decision 074): the legend just above already
 * calls the number « Sa note pour ce match » — the note *of* the teammate being rated — and two
 * possessives one line apart, pointing at different people, is how « Sa note (la tienne) » happened
 * in the first place (decision 095).
 */
export function chosenScoreFr(score: number | null): string | null {
  if (score === null) return null;
  return `Note choisie : ${score} / 10`;
}

/**
 * How many notes are chosen and not yet written.
 *
 * Nothing is saved card by card — the whole sheet goes in one POST — so a reader who selects a note
 * and closes the tab loses it. That was true before too, but the flow's auto-advance made selecting
 * feel like committing. Now that the reader has to tap twice, the screen owes him the plain fact.
 */
export function unsentNoteFr(filled: number): string | null {
  if (filled <= 0) return null;
  if (filled === 1) return "1 note choisie, pas encore envoyée.";
  return `${filled} notes choisies, pas encore envoyées.`;
}

import { describe, expect, it } from "vitest";

import {
  chosenScoreFr,
  clampIndex,
  nextIndex,
  previousIndex,
  ratingStep,
  unsentNoteFr,
} from "./flow";
import type { RatingStepInput } from "./flow";

const step = (over: Partial<RatingStepInput> = {}) =>
  ratingStep({
    index: 0,
    total: 11,
    currentLocked: false,
    currentSelected: false,
    filled: 0,
    remaining: 11,
    ...over,
  });

describe("ratingStep", () => {
  it("waits for a note before offering « Suivant »", () => {
    // The whole point of decision 102: selecting and advancing are two taps, and the first card of a
    // fresh sheet is waiting for the first of them.
    const view = step();
    expect(view.hint).toBe("Appuie sur une note, puis sur Suivant.");
    expect(view.next).toEqual({ label: "Passer sans noter", variant: "secondary" });
  });

  it("offers « Suivant », primary, once a note is selected", () => {
    const view = step({ currentSelected: true, filled: 1 });
    expect(view.next).toEqual({ label: "Suivant", variant: "primary" });
    expect(view.hint).toBeNull();
  });

  it("asks nothing on a card whose note is already final", () => {
    // A sent note cannot be changed (decision 023), so there is nothing to select and no hint to give.
    const view = step({ currentLocked: true });
    expect(view.hint).toBeNull();
    expect(view.next).toEqual({ label: "Suivant", variant: "primary" });
  });

  it("drops the forward button on the last card rather than disabling it", () => {
    // A greyed « Suivant » under the last teammate is a button that looks pressable and does nothing;
    // the submit button below it is the only honest way on.
    const view = step({ index: 10, currentSelected: true, filled: 11 });
    expect(view.next).toBeNull();
    expect(view.submit.label).toBe("Terminer et voir le résumé");
    expect(view.submit.enabled).toBe(true);
  });

  it("keeps the last card's submit reachable when the set is only partial", () => {
    const view = step({ index: 10, filled: 4 });
    expect(view.next).toBeNull();
    expect(view.submit).toEqual({
      label: "Enregistrer mes notes",
      variant: "primary",
      enabled: true,
    });
  });

  it("refuses to submit nothing", () => {
    expect(step().submit.enabled).toBe(false);
  });

  it("only says « Terminer » when every owed note is selected", () => {
    expect(step({ filled: 10, remaining: 11 }).submit.label).toBe("Enregistrer mes notes");
    expect(step({ filled: 11, remaining: 11 }).submit.label).toBe("Terminer et voir le résumé");
  });

  it("does not promise a summary when nothing was owed", () => {
    // Nobody to rate means no complete set to reach: `remaining: 0` must not read as « all filled ».
    expect(step({ total: 1, filled: 0, remaining: 0 }).submit.label).toBe("Enregistrer mes notes");
  });

  it("locks « Précédent » on the first card and frees it after", () => {
    expect(step({ index: 0 }).canGoPrevious).toBe(false);
    expect(step({ index: 1 }).canGoPrevious).toBe(true);
  });

  it("clamps an index the sheet no longer has", () => {
    expect(step({ index: 99, total: 3 }).index).toBe(2);
    expect(step({ index: -4 }).index).toBe(0);
  });

  it("treats a single-card sheet as the last card", () => {
    expect(step({ index: 0, total: 1 }).next).toBeNull();
  });
});

describe("chosenScoreFr", () => {
  it("says nothing before a note is chosen", () => {
    expect(chosenScoreFr(null)).toBeNull();
  });

  it("names the chosen note, out of ten", () => {
    expect(chosenScoreFr(8)).toBe("Note choisie : 8 / 10");
  });

  it("names a zero, which is a note and not an absence of one", () => {
    expect(chosenScoreFr(0)).toBe("Note choisie : 0 / 10");
  });

  it("does not claim the note with a possessive", () => {
    // The legend above it says « Sa note pour ce match » about the teammate being rated; « ta note »
    // one line below would point at somebody else (decision 095).
    expect(chosenScoreFr(5)).not.toContain("Ta");
    expect(chosenScoreFr(5)).not.toContain("ta note");
  });
});

describe("unsentNoteFr", () => {
  it("says nothing when nothing is chosen", () => {
    expect(unsentNoteFr(0)).toBeNull();
    expect(unsentNoteFr(-1)).toBeNull();
  });

  it("states what is chosen and still unsent, in the singular", () => {
    expect(unsentNoteFr(1)).toBe("1 note choisie, pas encore envoyée.");
  });

  it("agrees in the plural", () => {
    expect(unsentNoteFr(7)).toBe("7 notes choisies, pas encore envoyées.");
  });
});

describe("clampIndex, nextIndex, previousIndex", () => {
  it("never leaves the sheet", () => {
    expect(nextIndex(10, 11)).toBe(10);
    expect(previousIndex(0, 11)).toBe(0);
    expect(nextIndex(3, 11)).toBe(4);
    expect(previousIndex(3, 11)).toBe(2);
  });

  it("survives an empty sheet", () => {
    expect(clampIndex(0, 0)).toBe(0);
    expect(nextIndex(0, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { noteAuthorFr, ratingCountNoteFr, ratingLegendFr } from "./labels";

const author = (over: Partial<Parameters<typeof noteAuthorFr>[0]> = {}) =>
  noteAuthorFr({ raterName: "Karim", isSelf: false, isViewer: false, ...over });

describe("noteAuthorFr", () => {
  it("says « toi » for the note the reader gave himself", () => {
    // The defect: the recap said « 8 lui-même » to the man who had typed the 8.
    expect(author({ isSelf: true, isViewer: true })).toBe("toi");
  });

  it("keeps « lui-même » for somebody else's self-note", () => {
    expect(author({ isSelf: true })).toBe("lui-même");
  });

  it("names the reader and marks him, for a note he gave a teammate", () => {
    expect(author({ isViewer: true })).toBe("Karim (toi)");
  });

  it("just names anybody else", () => {
    expect(author()).toBe("Karim");
  });

  it("never names the reader in the third person", () => {
    for (const isSelf of [true, false]) {
      expect(author({ isSelf, isViewer: true })).toContain("toi");
    }
  });
});

describe("ratingCountNoteFr", () => {
  it("tutoies the reader about the note he gave himself", () => {
    expect(ratingCountNoteFr({ count: 4, selfScore: 8, isViewer: true })).toBe(
      "4 notes · tu t’es mis 8",
    );
  });

  it("speaks of anybody else in the third person, as before", () => {
    expect(ratingCountNoteFr({ count: 4, selfScore: 8, isViewer: false })).toBe(
      "4 notes · il s’est mis 8",
    );
  });

  it("says nothing about a self-score there is none of", () => {
    expect(ratingCountNoteFr({ count: 4, selfScore: null, isViewer: true })).toBe("4 notes");
  });

  it("counts one note in the singular", () => {
    expect(ratingCountNoteFr({ count: 1, selfScore: null, isViewer: false })).toBe("1 note");
  });

  it("says a player is unrated rather than counting zero notes", () => {
    expect(ratingCountNoteFr({ count: 0, selfScore: null, isViewer: false })).toBe(
      "pas encore noté",
    );
  });

  it("never tells the reader what « il » gave himself", () => {
    expect(ratingCountNoteFr({ count: 4, selfScore: 8, isViewer: true })).not.toContain("il ");
  });
});

describe("ratingLegendFr", () => {
  it("asks the reader for his own note in the second person", () => {
    // Was « Sa note pour ce match (la tienne) » — a parenthesis patching the wrong pronoun.
    expect(ratingLegendFr(true)).toBe("Ta note pour ce match");
  });

  it("keeps the third person for a teammate's card", () => {
    expect(ratingLegendFr(false)).toBe("Sa note pour ce match");
  });

  it("never needs a parenthesis to say whose note it is", () => {
    for (const isSelf of [true, false]) {
      expect(ratingLegendFr(isSelf)).not.toContain("(");
    }
  });
});

import { describe, expect, it } from "vitest";

import { noteAuthorFr, ratingCountNoteFr, ratingScoreFr, ratingScoreValueTextFr } from "./labels";

describe("noteAuthorFr", () => {
  it("names the reader and marks him, for a note he gave a teammate", () => {
    // The coach plays too, so his own notes are in the list he is reading.
    expect(noteAuthorFr({ raterName: "Karim", isViewer: true })).toBe("Karim (toi)");
  });

  it("just names anybody else", () => {
    expect(noteAuthorFr({ raterName: "Karim", isViewer: false })).toBe("Karim");
  });

  it("never names the reader in the third person", () => {
    // What this used to guard against was « lui-même » for a note the reader had typed. There are no
    // self-notes left to get wrong, and « (toi) » is the whole of what remains.
    expect(noteAuthorFr({ raterName: "Karim", isViewer: true })).toContain("toi");
  });
});

describe("ratingCountNoteFr", () => {
  it("counts the notes a figure rests on", () => {
    expect(ratingCountNoteFr(4)).toBe("4 notes");
  });

  it("counts one note in the singular", () => {
    expect(ratingCountNoteFr(1)).toBe("1 note");
  });

  it("says a player is unrated rather than counting zero notes", () => {
    expect(ratingCountNoteFr(0)).toBe("pas encore noté");
  });

  it("says nothing about who gave what", () => {
    // It is coach-facing, and even for him it is a count. The authors are a separate list; a count
    // that named anybody would put one on a player's screen the day the component is reused.
    expect(ratingCountNoteFr(4)).not.toMatch(/[A-Z]/);
  });
});

describe("ratingScoreFr", () => {
  it("always shows the decimal, so 5 and 7,5 look like the same kind of figure", () => {
    expect(ratingScoreFr(5)).toBe("5,0");
    expect(ratingScoreFr(7.5)).toBe("7,5");
    expect(ratingScoreFr(10)).toBe("10,0");
  });

  it("shows a dash rather than a fake zero", () => {
    expect(ratingScoreFr(null)).toBe("—");
  });
});

describe("ratingScoreValueTextFr", () => {
  it("spells the scale out, in French, for the screen reader", () => {
    // `aria-valuetext` replaces the number entirely, so it has to carry « sur 10 » itself —
    // otherwise a French voice reads « 7.5 » in English and the scale is left to be assumed.
    expect(ratingScoreValueTextFr(7.5)).toBe("7,5 sur 10");
    expect(ratingScoreValueTextFr(5)).toBe("5,0 sur 10");
  });
});

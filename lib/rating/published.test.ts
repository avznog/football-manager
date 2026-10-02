import { describe, expect, it } from "vitest";

import { meanOfNotes, meansAreVisible } from "./published";

describe("meansAreVisible", () => {
  it("hides a match nobody has released", () => {
    // The default state of every match, and the one decision 139 made permanent until somebody acts:
    // no amount of notes coming in publishes anything by itself any more.
    expect(meansAreVisible(null)).toBe(false);
  });

  it("shows a match the coach has released", () => {
    expect(meansAreVisible(Date.parse("2026-10-02T18:00:00Z"))).toBe(true);
  });

  it("asks whether there is an instant, never whether it has passed", () => {
    // Hiding writes null back, so presence is the whole question. An instant in the future would be a
    // clock skew between the server and Postgres, not a scheduled publication, and treating it as
    // « not yet » would hide a match the coach had just shown.
    expect(meansAreVisible(Date.parse("2099-01-01T00:00:00Z"))).toBe(true);
    expect(meansAreVisible(0)).toBe(true);
  });
});

describe("meanOfNotes", () => {
  it("is the plain mean of what the others gave him", () => {
    expect(meanOfNotes([7, 8])).toBe(7.5);
    expect(meanOfNotes([5, 5, 5])).toBe(5);
  });

  it("rounds to the tenth the column can hold", () => {
    // Four half-point notes average to 7.375, and `score` is `numeric(3,1)`. The rounding happens
    // once, here, so the recap and the profile cannot disagree by a tenth.
    expect(meanOfNotes([7, 7, 7.5, 8])).toBe(7.4);
    expect(meanOfNotes([6, 7])).toBe(6.5);
    expect(meanOfNotes([1, 2, 2])).toBe(1.7);
  });

  it("does not land off the half-step, because a mean is not a note", () => {
    // 6.3 is not a value any slider can produce, and it is still the right answer: the step
    // constrains what a rater submits, never what the mean of their submissions is.
    expect(meanOfNotes([6, 6, 7])).toBe(6.3);
  });

  it("is a single note's own value when there is only one", () => {
    expect(meanOfNotes([8.5])).toBe(8.5);
  });

  it("is null for no notes at all, rather than zero", () => {
    // Zero is a note somebody could have given. « Pas de note » is not a bad note.
    expect(meanOfNotes([])).toBeNull();
  });
});

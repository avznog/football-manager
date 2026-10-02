import { describe, expect, it } from "vitest";

import { meanOfNotes, ratingsPublication, type RatingsPublicationInput } from "./published";

function publication(overrides: Partial<RatingsPublicationInput> = {}) {
  return ratingsPublication({
    expectedRaterIds: ["hugo", "karim", "yanis"],
    completeRaterIds: [],
    publishedAtMs: null,
    windowState: "open",
    ...overrides,
  });
}

describe("ratingsPublication", () => {
  it("holds everything back while the squad still owes notes", () => {
    expect(publication({ completeRaterIds: ["hugo", "karim"] })).toEqual({
      published: false,
      reason: "pending",
      owingRaterIds: ["yanis"],
    });
  });

  it("publishes the moment the last set comes in", () => {
    expect(publication({ completeRaterIds: ["hugo", "karim", "yanis"] })).toEqual({
      published: true,
      reason: "every-set-in",
      owingRaterIds: [],
    });
  });

  it("publishes when the coach releases them, and still names who never rated", () => {
    // The escape hatch for the straggler who never will. The owing list survives publication
    // because the coach is the one person entitled to know who is missing.
    expect(
      publication({ completeRaterIds: ["hugo"], publishedAtMs: Date.parse("2026-10-02T18:00:00Z") }),
    ).toEqual({
      published: true,
      reason: "coach-published",
      owingRaterIds: ["karim", "yanis"],
    });
  });

  it("publishes once the next match has kicked off", () => {
    expect(publication({ completeRaterIds: ["hugo"], windowState: "closed" })).toEqual({
      published: true,
      reason: "window-closed",
      owingRaterIds: ["karim", "yanis"],
    });
  });

  it("holds back before the window opens, which is not the same as closed", () => {
    // `not-yet` is a match that has not finished. Nothing to publish, and nothing owed yet either.
    expect(publication({ windowState: "not-yet" }).published).toBe(false);
  });

  it("prefers the squad's own doing to a deadline, when both are true", () => {
    // Two clauses hold; the reason reported is the one that explains the most, because « toute
    // l'équipe a noté » is a better thing to tell a reader than « la date est passée ».
    expect(
      publication({
        completeRaterIds: ["hugo", "karim", "yanis"],
        publishedAtMs: 1,
        windowState: "closed",
      }).reason,
    ).toBe("every-set-in");
  });

  it("prefers the coach to the window", () => {
    expect(publication({ publishedAtMs: 1, windowState: "closed" }).reason).toBe("coach-published");
  });

  it("publishes a match nobody played, vacuously", () => {
    // A match nobody recorded (decision 013) has no expected raters, so there is no set to wait
    // for. That is not a claim that there is a mean to show: the three-note floor downstream is
    // what stops a figure printing, and keeping the two apart is why this function has no idea how
    // many notes exist.
    expect(publication({ expectedRaterIds: [] })).toEqual({
      published: true,
      reason: "every-set-in",
      owingRaterIds: [],
    });
  });

  it("ignores a complete set from somebody who was not expected", () => {
    // A man whose minutes a retro amendment took to zero may have rated everybody first. His set
    // does not fill anybody else's hole.
    expect(publication({ completeRaterIds: ["momo"] }).owingRaterIds).toEqual([
      "hugo",
      "karim",
      "yanis",
    ]);
  });

  it("keeps the owing list in the order it was given, so two screens agree on who is first", () => {
    expect(
      ratingsPublication({
        expectedRaterIds: ["yanis", "hugo", "karim"],
        completeRaterIds: ["hugo"],
        publishedAtMs: null,
        windowState: "open",
      }).owingRaterIds,
    ).toEqual(["yanis", "karim"]);
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

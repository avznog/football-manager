import { describe, expect, it } from "vitest";

import { type RatingAuthorRow, type SquadRoleRow, ratingVisibility } from "./ratings";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const MATCHES = ["m1", "m2"];

/**
 * Hugo and Karim played both matches. Gérard was a supporter at both. Chloé is a member who was
 * never on a sheet — she joined after the second match.
 *
 * Two players on a sheet means a complete set is **two** notes: decision 007 has everyone rate
 * everyone including themselves. That is what makes the partial-set case below expressible.
 */
const SQUAD: SquadRoleRow[] = [
  { matchId: "m1", teamMemberId: "hugo", role: "starter" },
  { matchId: "m1", teamMemberId: "karim", role: "substitute" },
  { matchId: "m1", teamMemberId: "gerard", role: "supporter" },
  { matchId: "m2", teamMemberId: "hugo", role: "starter" },
  { matchId: "m2", teamMemberId: "karim", role: "starter" },
  { matchId: "m2", teamMemberId: "gerard", role: "supporter" },
];

/**
 * Karim finished his set for m1 (Hugo and himself). Hugo started his and stopped after one note —
 * exactly the half-done set decision 023 keeps in the table. Nobody has rated m2.
 */
const AUTHORS: RatingAuthorRow[] = [
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "hugo" },
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "karim" },
  { matchId: "m1", raterMemberId: "hugo", ratedMemberId: "karim" },
];

const visibility = (viewerMemberId: string | null, authors = AUTHORS) =>
  ratingVisibility({ matchIds: MATCHES, squad: SQUAD, authors, viewerMemberId });

/* -------------------------------------------------------------------------- */

describe("the decision 007 gate, read season-wide", () => {
  it("opens a match to the player who finished his set", () => {
    // Karim rated both rateable members of m1, so m1 is his to read. He was on the sheet for m2
    // and has rated nobody there: gated. m2 holds no ratings at all, so there is nothing to warn
    // him about — only a match that actually carries ratings is reported as hidden.
    const seen = visibility("karim");
    expect(seen.visibleMatchIds).toEqual(["m1"]);
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("keeps a match hidden from a player who submitted only part of his set", () => {
    // Hugo owes two notes for m1 and has written one. Decision 023 keeps that partial set in the
    // table, so « a rating row exists » is *not* the rule: the set has to be complete. This is the
    // leak the season aggregate would otherwise have — one average instead of thirteen notes.
    const seen = visibility("hugo");
    expect(seen.visibleMatchIds).toEqual([]);
    expect(seen.hiddenMatchIds).toEqual(["m1"]);
  });

  it("opens the match once the missing note lands", () => {
    const seen = visibility("hugo", [
      ...AUTHORS,
      { matchId: "m1", raterMemberId: "hugo", ratedMemberId: "hugo" },
    ]);
    expect(seen.visibleMatchIds).toEqual(["m1"]);
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("reports a hidden match once it actually holds ratings", () => {
    const seen = visibility("hugo", [
      ...AUTHORS,
      { matchId: "m2", raterMemberId: "karim", ratedMemberId: "hugo" },
    ]);
    expect(seen.visibleMatchIds).toEqual([]);
    expect(seen.hiddenMatchIds).toEqual(["m1", "m2"]);
  });

  it("shows everything to a supporter, who has nothing to submit and nothing to anchor on", () => {
    const seen = visibility("gerard");
    expect(seen.visibleMatchIds).toEqual(MATCHES);
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("shows everything to a member who was never on a sheet", () => {
    expect(visibility("chloe").visibleMatchIds).toEqual(MATCHES);
  });

  it("shows everything to a viewer who is not a member at all — a super admin", () => {
    expect(visibility(null).visibleMatchIds).toEqual(MATCHES);
  });

  it("ignores a sheet row for a match outside the filter", () => {
    const seen = ratingVisibility({
      matchIds: ["m2"],
      squad: SQUAD,
      authors: AUTHORS,
      viewerMemberId: "karim",
    });
    // m1 is out of the filter entirely, so Karim's completed set there neither opens it nor is
    // reported as hidden; m2 carries no ratings, so it is silent too.
    expect(seen.visibleMatchIds).toEqual([]);
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("preserves the order it was given, so the caller's ordering survives", () => {
    const seen = ratingVisibility({
      matchIds: ["m2", "m1"],
      squad: SQUAD,
      authors: [],
      viewerMemberId: "gerard",
    });
    expect(seen.visibleMatchIds).toEqual(["m2", "m1"]);
  });

  it("does not let one viewer's completed set open the match for another", () => {
    // The gate is per viewer, and the only rater it may ever look at is the viewer. Karim's two
    // notes are in the fixture; they must do nothing for Hugo.
    expect(visibility("hugo").visibleMatchIds).not.toContain("m1");
    expect(visibility("karim").visibleMatchIds).toContain("m1");
  });
});

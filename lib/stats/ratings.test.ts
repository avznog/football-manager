import { describe, expect, it } from "vitest";

import {
  type RatingRowWithRater,
  type SquadRoleRow,
  couldRate,
  ratingVisibility,
  visibleRatings,
} from "./ratings";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const MATCHES = ["m1", "m2"];

/**
 * Hugo and Karim played both matches. Gérard was a supporter at both. Chloé is a member who was
 * never on a sheet — she joined after the second match.
 */
const SQUAD: SquadRoleRow[] = [
  { matchId: "m1", teamMemberId: "hugo", role: "starter" },
  { matchId: "m1", teamMemberId: "karim", role: "substitute" },
  { matchId: "m1", teamMemberId: "gerard", role: "supporter" },
  { matchId: "m2", teamMemberId: "hugo", role: "starter" },
  { matchId: "m2", teamMemberId: "karim", role: "starter" },
  { matchId: "m2", teamMemberId: "gerard", role: "supporter" },
];

/** Karim has rated m1 and nobody has rated m2 yet. */
const RATINGS: RatingRowWithRater[] = [
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "hugo", score: 7 },
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "karim", score: 6 },
  { matchId: "m1", raterMemberId: "hugo", ratedMemberId: "karim", score: 8 },
];

const visibility = (viewerMemberId: string | null, ratings = RATINGS) =>
  ratingVisibility({ matchIds: MATCHES, squad: SQUAD, ratings, viewerMemberId });

/* -------------------------------------------------------------------------- */

describe("couldRate", () => {
  it("is the sheet invariant: only a starter or a substitute may rate", () => {
    expect(couldRate("starter")).toBe(true);
    expect(couldRate("substitute")).toBe(true);
    expect(couldRate("supporter")).toBe(false);
    expect(couldRate(undefined)).toBe(false);
  });
});

describe("the decision 007 gate, read season-wide", () => {
  it("hides a match from a player who could rate it and has not", () => {
    // Hugo rated m1, so he sees it. He was on the sheet for m2 and has rated nobody: gated.
    const seen = visibility("hugo");
    expect(seen.visibleMatchIds).toEqual(["m1"]);
    // m2 holds no ratings at all, so there is nothing to warn him about — only a match that
    // actually carries ratings is reported as hidden.
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("reports a hidden match once it actually holds ratings", () => {
    const ratings = [
      ...RATINGS,
      { matchId: "m2", raterMemberId: "karim", ratedMemberId: "hugo", score: 9 },
    ];
    const seen = visibility("hugo", ratings);
    expect(seen.visibleMatchIds).toEqual(["m1"]);
    expect(seen.hiddenMatchIds).toEqual(["m2"]);
  });

  it("opens a match as soon as the viewer has submitted one rating for it", () => {
    expect(visibility("karim").visibleMatchIds).toContain("m1");
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
      matchIds: ["m1"],
      squad: SQUAD,
      ratings: RATINGS,
      viewerMemberId: "hugo",
    });
    // m2 is out of the filter entirely, so it is neither visible nor reported as hidden.
    expect(seen.visibleMatchIds).toEqual(["m1"]);
    expect(seen.hiddenMatchIds).toEqual([]);
  });

  it("preserves the order it was given, so the caller's ordering survives", () => {
    const seen = ratingVisibility({
      matchIds: ["m2", "m1"],
      squad: SQUAD,
      ratings: [],
      viewerMemberId: "gerard",
    });
    expect(seen.visibleMatchIds).toEqual(["m2", "m1"]);
  });
});

describe("visibleRatings", () => {
  it("keeps only the visible matches and drops the rater", () => {
    const rows = visibleRatings(RATINGS, ["m1"]);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toEqual({ matchId: "m1", ratedMemberId: "hugo", score: 7 });
    expect(rows.every((row) => !("raterMemberId" in row))).toBe(true);
  });

  it("returns nothing when no match is visible", () => {
    expect(visibleRatings(RATINGS, [])).toEqual([]);
  });

  it("keeps a self-rating, which decision 007 allows", () => {
    const rows = visibleRatings(RATINGS, ["m1"]);
    expect(rows).toContainEqual({ matchId: "m1", ratedMemberId: "karim", score: 6 });
  });
});

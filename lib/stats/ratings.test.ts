import { describe, expect, it } from "vitest";

import { type MatchPublicationRow, seasonRatingPublication } from "./ratings";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const MATCHES = ["m1", "m2"];

const HIDDEN: MatchPublicationRow[] = [
  { matchId: "m1", publishedAtMs: null },
  { matchId: "m2", publishedAtMs: null },
];

const SHOWN_M1: MatchPublicationRow[] = [
  { matchId: "m1", publishedAtMs: 1_700_000_000_000 },
  { matchId: "m2", publishedAtMs: null },
];

const split = (ratedMatchIds: string[], matches: MatchPublicationRow[] = HIDDEN) =>
  seasonRatingPublication({ matchIds: MATCHES, ratedMatchIds, matches });

/* -------------------------------------------------------------------------- */

describe("seasonRatingPublication", () => {
  /**
   * The whole of decision 139 in one assertion: a match every player rated in full is **still hidden**
   * until the coach says otherwise. Under decisions 137 and 138 the squad finishing published it, which
   * meant nobody decided it and the moment it happened was whenever the last man got round to it.
   */
  it("leaves a fully rated match hidden until the coach shows it", () => {
    const season = split(["m1"]);
    expect(season.publishedMatchIds).toEqual([]);
    expect(season.pendingMatchIds).toEqual(["m1"]);
  });

  it("shows the match the coach released, and only that one", () => {
    const season = split(["m1", "m2"], SHOWN_M1);
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual(["m2"]);
  });

  it("hides it again when the column goes back to null", () => {
    // The switch goes both ways (decision 139), so a season table has to be able to lose a mean it was
    // printing last week. This is that, at the level the table reads.
    expect(split(["m1"], SHOWN_M1).publishedMatchIds).toEqual(["m1"]);
    expect(split(["m1"], HIDDEN).publishedMatchIds).toEqual([]);
  });

  it("does not invent notes for a released match nobody rated", () => {
    // Publishing an unrated match publishes nothing: there is no mean to compute, so it belongs in
    // neither list rather than in `publishedMatchIds` where a screen would look for figures.
    const season = split([], SHOWN_M1);
    expect(season.publishedMatchIds).toEqual([]);
    expect(season.pendingMatchIds).toEqual([]);
  });

  it("leaves a match nobody rated out of both lists", () => {
    // « En attente » for a friendly in October nobody intends to rate would be a weekly reproach.
    const season = split(["m1"]);
    expect(season.publishedMatchIds).not.toContain("m2");
    expect(season.pendingMatchIds).not.toContain("m2");
  });

  it("treats a match with no publication row at all as hidden", () => {
    // Defensive: the row comes from the same query as `matchIds`, so a gap should be impossible. If one
    // appears, the safe reading is « not released », never « show the notes ».
    const season = seasonRatingPublication({ matchIds: ["m1"], ratedMatchIds: ["m1"], matches: [] });
    expect(season.pendingMatchIds).toEqual(["m1"]);
  });
});

describe("seasonRatingPublication — the edges", () => {
  it("returns two empty lists for no matches", () => {
    expect(seasonRatingPublication({ matchIds: [], ratedMatchIds: [], matches: [] })).toEqual({
      publishedMatchIds: [],
      pendingMatchIds: [],
    });
  });

  it("ignores rows belonging to a match outside the filter", () => {
    // The competition filter narrows `matchIds`; the rows come back unfiltered, and a note from a cup
    // match must not place that match in either list.
    const season = seasonRatingPublication({
      matchIds: ["m1"],
      ratedMatchIds: ["m1", "cup"],
      matches: [...SHOWN_M1, { matchId: "cup", publishedAtMs: 1_700_000_000_000 }],
    });
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual([]);
  });

  it("preserves the order the matches were asked for", () => {
    // The screens count these lists and some of them name the first entry, so the order has to be the
    // caller's — most recent first, as `getSeasonStats` loads them — not insertion order here.
    const matches: MatchPublicationRow[] = [
      { matchId: "m1", publishedAtMs: 1_700_000_000_000 },
      { matchId: "m2", publishedAtMs: 1_700_000_000_000 },
    ];
    expect(
      seasonRatingPublication({ matchIds: ["m2", "m1"], ratedMatchIds: ["m1", "m2"], matches }),
    ).toEqual({ publishedMatchIds: ["m2", "m1"], pendingMatchIds: [] });
  });

  it("does not care whether any minutes were ever logged", () => {
    // It used to: a match whose log was never reduced had no expected raters, so « every set in » was
    // vacuously true and the match published itself. Decision 139 took the minutes out of this module
    // entirely, so a missing log cannot publish anything and cannot hold anything back either.
    expect(split(["m1"], SHOWN_M1).publishedMatchIds).toEqual(["m1"]);
  });
});

import { describe, expect, it } from "vitest";

import {
  type MatchPublicationRow,
  type PlayedRow,
  type RatingAuthorRow,
  seasonRatingPublication,
} from "./ratings";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const MATCHES = ["m1", "m2"];

/**
 * Hugo and Karim played both matches; Yanis came on in m1 only. Gérard was on the sheet as a
 * supporter at both and so appears nowhere here: decision 137 rates **minutes**, not selection, and
 * a man with no minutes neither rates nor is rated.
 *
 * Three players in m1 means a complete set is **two** notes each — everyone who played, minus
 * himself. Two in m2 means one note each. That is what makes the partial-set cases expressible.
 */
const PLAYED: PlayedRow[] = [
  { matchId: "m1", teamMemberId: "hugo", minutes: 58 },
  { matchId: "m1", teamMemberId: "karim", minutes: 60 },
  { matchId: "m1", teamMemberId: "yanis", minutes: 22 },
  { matchId: "m1", teamMemberId: "gerard", minutes: 0 },
  { matchId: "m2", teamMemberId: "hugo", minutes: 60 },
  { matchId: "m2", teamMemberId: "karim", minutes: 60 },
];

/** Everybody who played m1 has finished his set. Nobody has rated m2 at all. */
const COMPLETE_M1: RatingAuthorRow[] = [
  { matchId: "m1", raterMemberId: "hugo", ratedMemberId: "karim" },
  { matchId: "m1", raterMemberId: "hugo", ratedMemberId: "yanis" },
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "hugo" },
  { matchId: "m1", raterMemberId: "karim", ratedMemberId: "yanis" },
  { matchId: "m1", raterMemberId: "yanis", ratedMemberId: "hugo" },
  { matchId: "m1", raterMemberId: "yanis", ratedMemberId: "karim" },
];

const OPEN: MatchPublicationRow[] = [
  { matchId: "m1", publishedAtMs: null, windowClosed: false },
  { matchId: "m2", publishedAtMs: null, windowClosed: false },
];

const split = (
  authors: RatingAuthorRow[],
  matches: MatchPublicationRow[] = OPEN,
  played: PlayedRow[] = PLAYED,
) => seasonRatingPublication({ matchIds: MATCHES, played, authors, matches });

/* -------------------------------------------------------------------------- */

describe("seasonRatingPublication — every rater in", () => {
  it("publishes a match whose every player has rated every other", () => {
    // m2 holds no note at all, so it is in neither list: there is nothing to show and nothing a
    // reader could sensibly be told to wait for.
    const season = split(COMPLETE_M1);
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual([]);
  });

  it("keeps a match pending while one player owes one note", () => {
    // Yanis has rated Hugo and stopped. His set is one short, so the whole match waits — the mean
    // is « the notes the others gave him » and one of the others has not spoken.
    const season = split(COMPLETE_M1.filter((row) => row.ratedMemberId !== "karim"));
    expect(season.publishedMatchIds).toEqual([]);
    expect(season.pendingMatchIds).toEqual(["m1"]);
  });

  it("does not count a self-note towards a complete set", () => {
    // `ratings_no_self` makes this unwritable, but the predicate must not be the thing relying on
    // that: a self-note is not one of the two notes Yanis owes.
    const authors = COMPLETE_M1.filter(
      (row) => !(row.raterMemberId === "yanis" && row.ratedMemberId === "karim"),
    );
    authors.push({ matchId: "m1", raterMemberId: "yanis", ratedMemberId: "yanis" });
    const season = split(authors);
    expect(season.pendingMatchIds).toEqual(["m1"]);
  });

  it("ignores a note from somebody who did not play", () => {
    // Gérard watched. A note from him is not part of anybody's set, and above all it does not make
    // him an expected rater whose silence would hold the match back.
    const authors = [
      ...COMPLETE_M1,
      { matchId: "m1", raterMemberId: "gerard", ratedMemberId: "hugo" },
    ];
    expect(split(authors).publishedMatchIds).toEqual(["m1"]);
  });
});

describe("seasonRatingPublication — the coach's escape hatch", () => {
  it("publishes a match the coach released, however much is owed", () => {
    const matches: MatchPublicationRow[] = [
      { matchId: "m1", publishedAtMs: 1_700_000_000_000, windowClosed: false },
      { matchId: "m2", publishedAtMs: null, windowClosed: false },
    ];
    const season = split([COMPLETE_M1[0]], matches);
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual([]);
  });

  it("does not invent notes for a match the coach released that nobody rated", () => {
    // Publishing an unrated match publishes nothing: there is no mean to compute, so it belongs in
    // neither list rather than in `publishedMatchIds` where a screen would look for figures.
    const matches: MatchPublicationRow[] = [
      { matchId: "m1", publishedAtMs: 1_700_000_000_000, windowClosed: false },
      { matchId: "m2", publishedAtMs: null, windowClosed: false },
    ];
    const season = split([], matches);
    expect(season.publishedMatchIds).toEqual([]);
    expect(season.pendingMatchIds).toEqual([]);
  });
});

describe("seasonRatingPublication — the window closing", () => {
  it("publishes what there is once the next match has kicked off", () => {
    // This is the clause that reverses decision 024: a straggler no longer freezes a match for ever.
    // Whether one note is enough to *print* is a different question, settled by `MIN_NOTES_FOR_MEAN`
    // in the aggregate — this module only says the notes are out.
    const matches: MatchPublicationRow[] = [
      { matchId: "m1", publishedAtMs: null, windowClosed: true },
      { matchId: "m2", publishedAtMs: null, windowClosed: false },
    ];
    const season = split([COMPLETE_M1[0]], matches);
    expect(season.publishedMatchIds).toEqual(["m1"]);
  });

  it("leaves the last match of a season waiting on its players or its coach", () => {
    // No next kick-off, so `windowClosed` is false for ever. The coach is the backstop, which is the
    // whole reason `rating:publish` exists.
    const season = split([COMPLETE_M1[0]]);
    expect(season.pendingMatchIds).toEqual(["m1"]);
  });
});

describe("seasonRatingPublication — the edges", () => {
  it("returns two empty lists for no matches", () => {
    expect(seasonRatingPublication({ matchIds: [], played: [], authors: [], matches: [] })).toEqual({
      publishedMatchIds: [],
      pendingMatchIds: [],
    });
  });

  it("ignores rows belonging to a match outside the filter", () => {
    // The competition filter narrows `matchIds`; the rows come back unfiltered, and a note from a
    // cup match must not place that match in either list.
    const season = seasonRatingPublication({
      matchIds: ["m1"],
      played: PLAYED,
      authors: [...COMPLETE_M1, { matchId: "cup", raterMemberId: "hugo", ratedMemberId: "karim" }],
      matches: OPEN,
    });
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual([]);
  });

  it("preserves the order the matches were asked for", () => {
    // The screens count these lists and some of them name the first entry, so the order has to be
    // the caller's — most recent first, as `getSeasonStats` loads them — not insertion order here.
    const matches: MatchPublicationRow[] = [
      { matchId: "m1", publishedAtMs: null, windowClosed: true },
      { matchId: "m2", publishedAtMs: null, windowClosed: true },
    ];
    const authors: RatingAuthorRow[] = [
      { matchId: "m2", raterMemberId: "hugo", ratedMemberId: "karim" },
      ...COMPLETE_M1,
    ];
    expect(
      seasonRatingPublication({ matchIds: ["m2", "m1"], played: PLAYED, authors, matches }),
    ).toEqual({ publishedMatchIds: ["m2", "m1"], pendingMatchIds: [] });
  });

  it("does not hold a match back when no minutes were ever logged", () => {
    // A match whose log was never reduced has no expected raters, so nothing is owed and whatever
    // notes it holds are out. It cannot be « en attente » for ever on account of a missing log —
    // which is the failure mode worth pinning, since the notes themselves are real.
    const season = split(COMPLETE_M1, OPEN, []);
    expect(season.publishedMatchIds).toEqual(["m1"]);
    expect(season.pendingMatchIds).toEqual([]);
  });
});

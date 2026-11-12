/**
 * Decision 226: a removed player's notes are kept, stop counting while he is off the match, and come
 * back when he is added again. Pinned on the rule itself and on what the screens compute from it.
 */

import { describe, expect, it } from "vitest";

import { aggregateRatings, manOfTheMatch, type RatingRecord } from "./aggregate";
import { eligibleRatings, eligibleRatingsByMatch, type RatingEligibilityContext } from "./eligibility";
import type { PlayedEntry, SquadEntry } from "./progress";

const LUCIEN = "lucien";
const sheetWith = (lucien: boolean): SquadEntry[] => [
  { teamMemberId: "lucas", role: "starter" },
  { teamMemberId: "maxime", role: "starter" },
  { teamMemberId: "leo", role: "supporter" },
  ...(lucien ? [{ teamMemberId: LUCIEN, role: "starter" as const }] : []),
];
const playedWith = (lucien: boolean): PlayedEntry[] => [
  { teamMemberId: "lucas", minutes: 60 },
  { teamMemberId: "maxime", minutes: 60 },
  { teamMemberId: LUCIEN, minutes: lucien ? 40 : 0 },
];

// Lucien rated twice and was rated three times — enough for a man of the match (MIN_NOTES_FOR_MEAN).
const NOTES: RatingRecord[] = [
  { raterMemberId: "lucas", ratedMemberId: LUCIEN, score: 9 },
  { raterMemberId: "maxime", ratedMemberId: LUCIEN, score: 9 },
  { raterMemberId: "leo", ratedMemberId: LUCIEN, score: 9 },
  { raterMemberId: LUCIEN, ratedMemberId: "lucas", score: 2 },
  { raterMemberId: LUCIEN, ratedMemberId: "maxime", score: 2 },
  { raterMemberId: "maxime", ratedMemberId: "lucas", score: 7 },
  { raterMemberId: "lucas", ratedMemberId: "maxime", score: 6 },
  { raterMemberId: "leo", ratedMemberId: "maxime", score: 8 },
];

const on = { sheet: sheetWith(true), played: playedWith(true) };
const off = { sheet: sheetWith(false), played: playedWith(false) };

describe("which notes count", () => {
  it("keeps every note while everybody is on the match", () => {
    expect(eligibleRatings(NOTES, on)).toHaveLength(NOTES.length);
  });

  it("drops the notes he gave and the notes he received once he is off it", () => {
    const kept = eligibleRatings(NOTES, off);
    expect(kept.some((n) => n.raterMemberId === LUCIEN || n.ratedMemberId === LUCIEN)).toBe(false);
    // Nobody else's are touched — the supporter's vote included (decision 159).
    expect(kept).toHaveLength(3);
  });

  it("brings them back, unchanged, when he is added again", () => {
    // The rows were never deleted; putting him back on the match is all it takes.
    expect(eligibleRatings(NOTES, on)).toEqual(NOTES);
  });

  it("is what the means and the man of the match are computed from", () => {
    const before = aggregateRatings(eligibleRatings(NOTES, on), { members: ["lucas", "maxime", LUCIEN] });
    const after = aggregateRatings(eligibleRatings(NOTES, off), { members: ["lucas", "maxime"] });
    // With him: he is the man of the match on his two 9s, and his two 2s drag the others down.
    expect(manOfTheMatch(before)?.members.map((m) => m.memberId)).toEqual([LUCIEN]);
    // Without him: he is in no mean, and neither are the 2s he gave.
    expect(after.players.map((p) => p.memberId)).not.toContain(LUCIEN);
    expect(after.players.find((p) => p.memberId === "lucas")?.average).toBe(7);
    expect(after.players.find((p) => p.memberId === "maxime")?.average).toBe(7);
    expect(after.ratingCount).toBe(3);
  });
});

describe("across a season, each match against its own sheet", () => {
  it("drops his notes in the match he was removed from and keeps them in the others", () => {
    const rows = [
      ...NOTES.map((n) => ({ ...n, matchId: "m1" })),
      ...NOTES.map((n) => ({ ...n, matchId: "m2" })),
    ];
    const contexts = new Map<string, RatingEligibilityContext>([
      ["m1", off],
      ["m2", on],
    ]);
    const kept = eligibleRatingsByMatch(rows, contexts);
    expect(kept.filter((n) => n.matchId === "m1")).toHaveLength(3);
    expect(kept.filter((n) => n.matchId === "m2")).toHaveLength(NOTES.length);
  });

  it("drops the notes of a match it was given no sheet and no minutes for, rather than guess", () => {
    const rows = NOTES.map((n) => ({ ...n, matchId: "unknown" }));
    expect(eligibleRatingsByMatch(rows, new Map())).toEqual([]);
  });
});

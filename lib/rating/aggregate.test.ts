import { describe, expect, it } from "vitest";

import {
  aggregateRatings,
  compareAverages,
  formatAverage,
  formatAverageOutOfTen,
  isValidScore,
  manOfTheMatch,
  MIN_NOTES_FOR_MEAN,
  rankByAverage,
  type RatingRecord,
} from "./aggregate";

/** A rating row, in the order it reads out loud: "karim rated hugo 8". */
function rate(rater: string, rated: string, score: number): RatingRecord {
  return { raterMemberId: rater, ratedMemberId: rated, score };
}

describe("aggregateRatings", () => {
  it("averages the notes a player received", () => {
    const aggregate = aggregateRatings([
      rate("karim", "hugo", 8),
      rate("samir", "hugo", 7),
      rate("julien", "hugo", 6),
    ]);

    const hugo = aggregate.byMember.get("hugo");
    expect(hugo).toMatchObject({ count: 3, sum: 21, average: 7, best: 8, worst: 6 });
    expect(hugo?.averageLabel).toBe("7,0");
    expect(aggregate.ratingCount).toBe(3);
    expect(aggregate.raterIds).toEqual(["julien", "karim", "samir"]);
  });

  it("drops a self-note instead of averaging it in", () => {
    // Decision 007 required one and this module used to expose it as `selfScore`; decision 137 and
    // `ratings_no_self` make it a row that cannot exist. A legacy or hand-written one is ignored, so
    // the mean stays « what the others gave him » whatever is in the table.
    const aggregate = aggregateRatings([rate("hugo", "hugo", 9), rate("karim", "hugo", 5)]);

    const hugo = aggregate.byMember.get("hugo");
    expect(hugo?.count).toBe(1);
    expect(hugo?.average).toBe(5);
    expect(aggregate.ratingCount).toBe(1);
    // Rating only himself does not make him a participant either.
    expect(aggregate.raterIds).toEqual(["karim"]);
  });

  it("averages the half-points the slider can produce", () => {
    const aggregate = aggregateRatings([
      rate("karim", "hugo", 7.5),
      rate("samir", "hugo", 8),
      rate("julien", "hugo", 6.5),
    ]);

    expect(aggregate.byMember.get("hugo")).toMatchObject({ count: 3, sum: 22, average: 22 / 3 });
    expect(aggregate.byMember.get("hugo")?.averageLabel).toBe("7,3");
  });

  it("keeps a player rated by a single teammate, with a count of one", () => {
    const aggregate = aggregateRatings([rate("karim", "momo", 10)]);

    expect(aggregate.byMember.get("momo")).toMatchObject({
      count: 1,
      average: 10,
      averageLabel: "10,0",
    });
  });

  it("lists members nobody rated as unrated rather than as zero", () => {
    const aggregate = aggregateRatings([rate("karim", "hugo", 4)], {
      members: ["hugo", "yanis"],
    });

    expect(aggregate.byMember.get("yanis")).toMatchObject({
      count: 0,
      sum: 0,
      average: null,
      averageLabel: "—",
      best: null,
      worst: null,
    });
    // A 4/10 still ranks ahead of "no note at all".
    expect(aggregate.players.map((player) => player.memberId)).toEqual(["hugo", "yanis"]);
  });

  it("ignores a score the column could never have held", () => {
    const aggregate = aggregateRatings([
      rate("karim", "hugo", 11),
      rate("samir", "hugo", -1),
      // Off the half-step: no slider produces it and `ratings_score_half_step` refuses it.
      rate("julien", "hugo", 7.25),
      rate("leo", "hugo", 7),
    ]);

    expect(aggregate.byMember.get("hugo")).toMatchObject({ count: 1, average: 7 });
    expect(aggregate.ratingCount).toBe(1);
    // A dropped row must not leave its author counted as a participant either.
    expect(aggregate.raterIds).toEqual(["leo"]);
  });

  it("orders by average, then by how many people agreed, then by id", () => {
    const aggregate = aggregateRatings([
      // thomas: 8 from two raters.
      rate("karim", "thomas", 8),
      rate("samir", "thomas", 8),
      // nico: 8 from three raters — same average, more agreement, so first.
      rate("karim", "nico", 9),
      rate("samir", "nico", 8),
      rate("julien", "nico", 7),
      // leo: lower.
      rate("karim", "leo", 4),
    ]);

    expect(aggregate.players.map((player) => player.memberId)).toEqual(["nico", "thomas", "leo"]);
  });

  it("is empty, not broken, with no rows at all", () => {
    const aggregate = aggregateRatings([]);
    expect(aggregate.players).toEqual([]);
    expect(aggregate.ratingCount).toBe(0);
    expect(aggregate.average).toBeNull();
  });

  it("aggregates rows spanning several matches, which is what a season table needs", () => {
    const aggregate = aggregateRatings([
      { raterMemberId: "karim", ratedMemberId: "hugo", score: 8, matchId: "m1" },
      { raterMemberId: "karim", ratedMemberId: "hugo", score: 6, matchId: "m2" },
    ]);

    expect(aggregate.byMember.get("hugo")).toMatchObject({ count: 2, average: 7 });
  });
});

describe("compareAverages", () => {
  it("finds two different fractions with the same value equal", () => {
    // 24/3 and 16/2 are both 8: a tie, not a floating-point coin toss.
    expect(compareAverages({ sum: 24, count: 3 }, { sum: 16, count: 2 })).toBe(0);
  });

  it("does not confuse a repeating average with its rounded label", () => {
    // 22/3 = 7,33… prints as « 7,3 » but is not 7.3.
    expect(compareAverages({ sum: 22, count: 3 }, { sum: 73, count: 10 })).toBeGreaterThan(0);
  });

  it("puts an unrated player below anybody with a note, even a zero", () => {
    expect(compareAverages({ sum: 0, count: 0 }, { sum: 0, count: 1 })).toBeLessThan(0);
    expect(compareAverages({ sum: 0, count: 0 }, { sum: 0, count: 0 })).toBe(0);
  });
});

describe("rankByAverage", () => {
  const aggregate = aggregateRatings([
    rate("karim", "momo", 10), // one note only
    rate("karim", "hugo", 8),
    rate("samir", "hugo", 8),
    rate("karim", "leo", 6),
    rate("samir", "leo", 6),
  ]);

  it("includes a single-note player by default", () => {
    expect(rankByAverage(aggregate).map((player) => player.memberId)).toEqual([
      "momo",
      "hugo",
      "leo",
    ]);
  });

  it("drops players below the minimum number of notes", () => {
    expect(rankByAverage(aggregate, { minRatings: 2 }).map((player) => player.memberId)).toEqual([
      "hugo",
      "leo",
    ]);
  });

  it("truncates to the requested length", () => {
    expect(rankByAverage(aggregate, { limit: 1 }).map((player) => player.memberId)).toEqual([
      "momo",
    ]);
  });
});

describe("manOfTheMatch", () => {
  it("crowns the best average", () => {
    const aggregate = aggregateRatings([
      rate("karim", "hugo", 9),
      rate("samir", "hugo", 8),
      rate("julien", "hugo", 8.5),
      rate("karim", "leo", 6),
      rate("samir", "leo", 7),
      rate("julien", "leo", 6.5),
    ]);

    const motm = manOfTheMatch(aggregate);
    expect(motm?.members.map((player) => player.memberId)).toEqual(["hugo"]);
    expect(motm?.averageLabel).toBe("8,5");
    expect(motm?.tied).toBe(false);
  });

  it("returns every player on a tied average", () => {
    const aggregate = aggregateRatings([
      // thomas: 24/3 = 8.
      rate("karim", "thomas", 8),
      rate("samir", "thomas", 8),
      rate("julien", "thomas", 8),
      // nico: 32/4 = 8. Same average from a different fraction.
      rate("karim", "nico", 9),
      rate("samir", "nico", 8),
      rate("julien", "nico", 7),
      rate("leo", "nico", 8),
      rate("karim", "pierre", 5),
      rate("samir", "pierre", 5),
      rate("julien", "pierre", 5),
    ]);

    const motm = manOfTheMatch(aggregate);
    expect(motm?.tied).toBe(true);
    // Both names, the more widely agreed one first.
    expect(motm?.members.map((player) => player.memberId)).toEqual(["nico", "thomas"]);
    expect(motm?.average).toBe(8);
  });

  it("refuses to crown a player two teammates rated, with three notes on the board", () => {
    const aggregate = aggregateRatings([
      rate("karim", "momo", 10),
      rate("samir", "momo", 10),
      rate("karim", "hugo", 8),
      rate("samir", "hugo", 8),
      rate("julien", "hugo", 8),
    ]);

    // momo has the best average on two notes — which is what decision 025 allowed and decision 137
    // does not. The title goes to the 8 three people agreed on.
    const motm = manOfTheMatch(aggregate);
    expect(motm?.members.map((player) => player.memberId)).toEqual(["hugo"]);
  });

  it("returns null when nobody has enough notes", () => {
    const aggregate = aggregateRatings([
      rate("karim", "momo", 10),
      rate("samir", "momo", 10),
      rate("karim", "hugo", 9),
    ]);
    expect(manOfTheMatch(aggregate)).toBeNull();
  });

  it("returns null with no ratings at all, even when the sheet is known", () => {
    const aggregate = aggregateRatings([], { members: ["hugo", "leo"] });
    expect(manOfTheMatch(aggregate)).toBeNull();
  });

  it("honours a caller that wants a lower bar", () => {
    const aggregate = aggregateRatings([rate("karim", "momo", 10)]);
    expect(manOfTheMatch(aggregate, { minRatings: 1 })?.members[0]?.memberId).toBe("momo");
  });
});

describe("formatAverage", () => {
  it("uses a French decimal comma and one decimal", () => {
    expect(formatAverage(7)).toBe("7,0");
    expect(formatAverage(22 / 3)).toBe("7,3");
    expect(formatAverage(8.55)).toBe("8,6");
    expect(formatAverage(10)).toBe("10,0");
    expect(formatAverage(0)).toBe("0,0");
  });

  it("shows a dash rather than a fake zero when there is nothing to average", () => {
    expect(formatAverage(null)).toBe("—");
    expect(formatAverage(Number.NaN)).toBe("—");
    expect(formatAverageOutOfTen(null)).toBe("—");
  });

  it("spells the scale out for a headline figure", () => {
    expect(formatAverageOutOfTen(8.5)).toBe("8,5 / 10");
  });
});

describe("isValidScore", () => {
  it("accepts 0 to 10 in half-points", () => {
    expect(isValidScore(0)).toBe(true);
    expect(isValidScore(0.5)).toBe(true);
    expect(isValidScore(7.5)).toBe(true);
    expect(isValidScore(10)).toBe(true);
  });

  it("refuses what no slider can produce and the column would not hold", () => {
    expect(isValidScore(-1)).toBe(false);
    expect(isValidScore(-0.5)).toBe(false);
    expect(isValidScore(11)).toBe(false);
    expect(isValidScore(10.5)).toBe(false);
    expect(isValidScore(7.25)).toBe(false);
    expect(isValidScore(7.0001)).toBe(false);
    expect(isValidScore(Number.NaN)).toBe(false);
    expect(isValidScore(Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("MIN_NOTES_FOR_MEAN", () => {
  it("is the same floor the man of the match uses, because they cannot disagree", () => {
    // A figure too thin to show a player is too thin to crown him. `manOfTheMatch` takes its default
    // from this constant; this test is what stops the two drifting apart again.
    expect(MIN_NOTES_FOR_MEAN).toBe(3);
    const aggregate = aggregateRatings([
      rate("karim", "hugo", 8),
      rate("samir", "hugo", 8),
      rate("julien", "hugo", 8),
    ]);
    expect(manOfTheMatch(aggregate)?.members[0]?.memberId).toBe("hugo");
    expect(manOfTheMatch(aggregate, { minRatings: MIN_NOTES_FOR_MEAN + 1 })).toBeNull();
  });
});

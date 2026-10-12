import { describe, expect, it } from "vitest";

import {
  concededRateBoard,
  fitCountModel,
  impactByPosition,
  minutesPerCount,
  rawImpactPer60,
  shrunkPer60,
} from "./impact";
import { positionGroupLabelFr, positionGroupOf } from "./positions";

function member(id: string) {
  return { teamMemberId: id, displayName: id, jerseyNumber: null, hasLeft: false };
}

describe("positionGroupOf", () => {
  it("reads every wing code as « Ailier » and every back as « Défenseur central »", () => {
    for (const code of ["MG", "MD", "AIL", "AG", "AD"]) expect(positionGroupOf(code)).toBe("AIL");
    for (const code of ["DG", "DD", "DC"]) expect(positionGroupOf(code)).toBe("DC");
    expect(positionGroupOf("GB")).toBe("GB");
    expect(positionGroupOf("MOC")).toBe("MC");
    expect(positionGroupOf("AT")).toBe("AT");
    expect(positionGroupLabelFr("AIL")).toBe("Ailier");
  });

  it("files a code it has never shipped nowhere, rather than guessing", () => {
    expect(positionGroupOf("LIBERO")).toBeNull();
  });
});

describe("shrunkPer60", () => {
  it("lands a man with no minutes on the squad's rate exactly", () => {
    const model = fitCountModel([
      { ...member("a"), minutes: 120, count: 4 },
      { ...member("b"), minutes: 120, count: 2 },
    ]);
    // Pooled: 6 in 4 blocks of 60.
    expect(model.squadMean).toBeCloseTo(1.5);
    expect(shrunkPer60(0, 0, model)).toBeCloseTo(1.5);
  });
});

describe("concededRateBoard (decision 177: raw)", () => {
  const board = concededRateBoard([
    { ...member("cameo"), minutes: 5, count: 0 },
    { ...member("rock"), minutes: 300, count: 2 },
    { ...member("sieve"), minutes: 300, count: 15 },
    { ...member("clean"), minutes: 60, count: 0 },
    // The same rate as rock, one goal every 150′, over half the minutes.
    { ...member("half"), minutes: 150, count: 1 },
    { ...member("bench"), minutes: 0, count: 0 },
  ]);
  const order = board.entries.map((entry) => entry.teamMemberId);

  it("ranks on the real figure: nothing conceded first, then the fewest goals per minute", () => {
    expect(order).toEqual(["clean", "cameo", "rock", "half", "sieve"]);
  });

  it("puts the longer record first among equal rates, clean ones included", () => {
    expect(order.indexOf("clean")).toBeLessThan(order.indexOf("cameo"));
    expect(order.indexOf("rock")).toBeLessThan(order.indexOf("half"));
  });

  it("carries the raw minutes per goal, and null rather than infinity for a clean record", () => {
    const rock = board.entries.find((entry) => entry.teamMemberId === "rock")!;
    expect(rock).toMatchObject({ minutes: 300, conceded: 2, minutesPerGoal: 150 });
    expect(board.entries.find((entry) => entry.teamMemberId === "cameo")!.minutesPerGoal).toBeNull();
  });

  it("leaves out a man with no minutes, and cuts nobody else", () => {
    expect(order).not.toContain("bench");
    expect(order).toHaveLength(5);
  });

  it("lists a squad that conceded nothing, rather than an empty card", () => {
    const clean = concededRateBoard([{ ...member("a"), minutes: 60, count: 0 }]);
    expect(clean.entries).toMatchObject([{ teamMemberId: "a", conceded: 0, minutesPerGoal: null }]);
  });
});

describe("minutesPerCount", () => {
  it("reads a rate per 60 back as the wait between two", () => {
    expect(minutesPerCount(0.45)).toBe(133);
    expect(minutesPerCount(2.5)).toBe(24);
    expect(minutesPerCount(6)).toBe(10);
  });

  it("never prints « toutes les 0′ »", () => {
    expect(minutesPerCount(120)).toBe(1);
  });
});

describe("rawImpactPer60 (decision 198: no smoothing at all)", () => {
  it("is the plain division, reproducible by hand", () => {
    // The owner's own example: +1 and nothing conceded in ten minutes at MC.
    expect(rawImpactPer60({ group: "MC", minutes: 10, goalsFor: 1, goalsAgainst: 0 })).toBe(6);
  });

  it("is exactly zero for a man who neither scored nor conceded there", () => {
    // His other example: Édouard, +0 / −0 in six minutes at DC, which read « −2,4 » before.
    expect(rawImpactPer60({ group: "DC", minutes: 6, goalsFor: 0, goalsAgainst: 0 })).toBe(0);
    // And for a post where both happened once: zero is a figure, not a missing one.
    expect(rawImpactPer60({ group: "DC", minutes: 10, goalsFor: 1, goalsAgainst: 1 })).toBe(0);
  });

  it("goes negative when the team conceded more while he held the post", () => {
    expect(rawImpactPer60({ group: "DC", minutes: 30, goalsFor: 1, goalsAgainst: 7 })).toBe(-12);
    expect(rawImpactPer60({ group: "AIL", minutes: 34, goalsFor: 2, goalsAgainst: 5 })).toBeCloseTo(
      -5.294,
      3,
    );
  });

  it("has no figure at all for a post he never held, rather than a mean standing in", () => {
    expect(rawImpactPer60(undefined)).toBeNull();
    expect(rawImpactPer60({ group: "AT", minutes: 0, goalsFor: 0, goalsAgainst: 0 })).toBeNull();
  });
});

describe("impactByPosition", () => {
  const players = [
    // Ten hours of DC at +1 per 60 between them…
    {
      ...member("long"),
      positions: [{ group: "DC" as const, minutes: 600, goalsFor: 20, goalsAgainst: 10 }],
    },
    {
      ...member("solid"),
      positions: [{ group: "DC" as const, minutes: 600, goalsFor: 15, goalsAgainst: 18 }],
    },
    // …and ten minutes with one goal for: +6 per 60, which now *does* top the list (decision 198).
    {
      ...member("cameo"),
      positions: [
        { group: "DC" as const, minutes: 10, goalsFor: 1, goalsAgainst: 0 },
        { group: "GB" as const, minutes: 60, goalsFor: 2, goalsAgainst: 1 },
      ],
    },
    // Nothing either way, in two different lengths of spell: both are exactly 0,0.
    {
      ...member("quiet"),
      positions: [{ group: "DC" as const, minutes: 20, goalsFor: 0, goalsAgainst: 0 }],
    },
    {
      ...member("quieter"),
      positions: [{ group: "DC" as const, minutes: 6, goalsFor: 0, goalsAgainst: 0 }],
    },
  ];
  const impact = impactByPosition(players);
  const dc = impact.find((position) => position.group === "DC")!;

  it("lists every position, in team-sheet order, empty where nobody played", () => {
    expect(impact.map((position) => position.group)).toEqual(["GB", "DC", "MC", "AIL", "AT"]);
    expect(impact.find((position) => position.group === "AT")!.entries).toEqual([]);
  });

  it("ranks on the raw figure, so a short spell can lead — with its minutes beside it", () => {
    expect(dc.entries.map((entry) => entry.teamMemberId)).toEqual([
      "cameo",
      "long",
      "quiet",
      "quieter",
      "solid",
    ]);
    expect(dc.entries[0]).toMatchObject({ minutes: 10, goalsFor: 1, goalsAgainst: 0 });
    expect(dc.entries[0].impactPer60).toBeCloseTo(6);
  });

  it("prints 0,0 for a man nothing happened to, and the longer spell first", () => {
    const quiet = dc.entries.find((entry) => entry.teamMemberId === "quiet")!;
    const quieter = dc.entries.find((entry) => entry.teamMemberId === "quieter")!;
    expect(quiet.impactPer60).toBe(0);
    expect(quieter.impactPer60).toBe(0);
    expect(dc.entries.indexOf(quiet)).toBeLessThan(dc.entries.indexOf(quieter));
  });

  it("goes below zero only for a man the team actually conceded under", () => {
    const solid = dc.entries.find((entry) => entry.teamMemberId === "solid")!;
    expect(solid.impactPer60).toBeCloseTo(-0.3);
    expect(dc.entries.filter((entry) => entry.impactPer60 < 0)).toHaveLength(1);
  });

  it("gives a man alone at a position his own figure, untouched", () => {
    const gb = impact.find((position) => position.group === "GB")!;
    expect(gb.entries[0].impactPer60).toBeCloseTo(1);
  });
});

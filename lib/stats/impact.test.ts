import { describe, expect, it } from "vitest";

import { concededRateBoard, fitCountModel, impactByPosition, shrunkPer60 } from "./impact";
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

describe("concededRateBoard", () => {
  const board = concededRateBoard([
    // Five clean minutes: the raw figure is « aucun but », and it must not head the table.
    { ...member("cameo"), minutes: 5, count: 0 },
    { ...member("rock"), minutes: 300, count: 2 },
    { ...member("sieve"), minutes: 300, count: 15 },
    { ...member("bench"), minutes: 0, count: 0 },
  ]);

  it("ranks the long, good record above five clean minutes", () => {
    expect(board.entries.map((entry) => entry.teamMemberId)).toEqual(["rock", "cameo", "sieve"]);
  });

  it("never prints infinity: the raw figure is null, the ranked one a number", () => {
    const cameo = board.entries.find((entry) => entry.teamMemberId === "cameo")!;
    expect(cameo.rawMinutesPerGoal).toBeNull();
    expect(Number.isFinite(cameo.minutesPerGoal)).toBe(true);
  });

  it("keeps the raw figure beside the ranked one", () => {
    const rock = board.entries.find((entry) => entry.teamMemberId === "rock")!;
    expect(rock.rawMinutesPerGoal).toBe(150);
    // Shrunk towards the squad, so fewer minutes per goal than his own 150.
    expect(rock.minutesPerGoal).toBeLessThan(150);
  });

  it("leaves out a man with no minutes, and counts who was considered", () => {
    expect(board.considered).toBe(3);
  });

  it("is empty when nobody conceded at all: there is no rate to rank", () => {
    const clean = concededRateBoard([{ ...member("a"), minutes: 60, count: 0 }]);
    expect(clean.entries).toEqual([]);
  });
});

describe("impactByPosition", () => {
  const players = [
    // Forty hours of DC at +1 per 60 between them…
    {
      ...member("long"),
      positions: [{ group: "DC" as const, minutes: 600, goalsFor: 20, goalsAgainst: 10 }],
    },
    {
      ...member("solid"),
      positions: [{ group: "DC" as const, minutes: 600, goalsFor: 15, goalsAgainst: 12 }],
    },
    // …and ten minutes with one goal for: +6 per 60 raw, which must not top the list.
    {
      ...member("cameo"),
      positions: [
        { group: "DC" as const, minutes: 10, goalsFor: 1, goalsAgainst: 0 },
        { group: "GB" as const, minutes: 60, goalsFor: 2, goalsAgainst: 1 },
      ],
    },
  ];
  const impact = impactByPosition(players);
  const dc = impact.find((position) => position.group === "DC")!;

  it("lists every position, in team-sheet order, empty where nobody played", () => {
    expect(impact.map((position) => position.group)).toEqual(["GB", "DC", "MC", "AIL", "AT"]);
    expect(impact.find((position) => position.group === "AT")!.entries).toEqual([]);
  });

  it("smooths ten minutes so they cannot win", () => {
    expect(dc.entries[0].teamMemberId).toBe("long");
    const cameo = dc.entries.find((entry) => entry.teamMemberId === "cameo")!;
    expect(cameo.rawPer60).toBeCloseTo(6);
    expect(cameo.impactPer60).toBeLessThan(dc.entries[0].impactPer60);
  });

  it("keeps the raw difference and the minutes beside the ranked figure", () => {
    expect(dc.entries[0]).toMatchObject({ minutes: 600, goalsFor: 20, goalsAgainst: 10, rawPer60: 1 });
    expect(dc.considered).toBe(3);
  });

  it("puts a man alone at a position on the position's own figures", () => {
    const gb = impact.find((position) => position.group === "GB")!;
    // One keeper: the squad mean is his own, so shrinking changes nothing.
    expect(gb.entries[0].impactPer60).toBeCloseTo(1);
  });
});

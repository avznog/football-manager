/**
 * The adapter's tests.
 *
 * This is the file that matters most in the slice, and not because the code is clever: it is a join
 * between two row shapes whose fields are almost the same words. `cleanMinutes` and `gkCleanMinutes`
 * are decision 011's two readings and differ by two letters; `gkMinutes` is a denominator and
 * `minutes` is another. Every one of those mistakes produces a seven that looks entirely plausible
 * and ranks the wrong people — which is exactly the class of defect decision 097 was written about, so
 * the assertions here are field-by-field rather than « it returns seven candidates ».
 */

import { describe, expect, it } from "vitest";

import type { PlayerSeasonStats } from "./aggregate";
import { toBestSevenSlots, toBestSevenSquad, type DeclaredPositions } from "./best-seven-input";

/** A season row with every figure distinct, so a swapped field cannot pass by coincidence. */
function seasonRow(overrides: Partial<PlayerSeasonStats> = {}): PlayerSeasonStats {
  return {
    teamMemberId: "m1",
    displayName: "Karim",
    jerseyNumber: 9,
    isPlayer: true,
    hasLeft: false,
    matchesPlayed: 6,
    minutes: 401,
    appearances: {
      selected: 7,
      starter: 5,
      substitute: 2,
      supporter: 0,
      goalkeeper: 1,
    },
    goals: 11,
    assists: 7,
    ownGoals: 1,
    penaltiesScored: 2,
    penaltiesMissed: 1,
    fouls: 3,
    gkMinutes: 61,
    gkCleanSheets: 1,
    gkCleanMinutes: 41,
    concededWhileGk: 2,
    cleanMinutes: 211,
    concededWhileOn: 5,
    goalsForWhileOn: 4,
    outfieldMinutes: 340,
    concededOutfield: 3,
    positions: [{ group: "AT", minutes: 340, goalsFor: 4, goalsAgainst: 3 }],
    rating: { average: 7.25, count: 4, variance: 0.5 },
    hasData: true,
    ...overrides,
  } as PlayerSeasonStats;
}

function member(overrides: Partial<DeclaredPositions> = {}): DeclaredPositions {
  return {
    membershipId: "m1",
    displayName: "Karim",
    jerseyNumber: 9,
    isPlayer: true,
    positions: [{ code: "AT", preference: "primary" }],
    ...overrides,
  };
}

describe("toBestSevenSquad", () => {
  it("joins a season row onto its squad member, field by field", () => {
    const { candidates } = toBestSevenSquad([seasonRow()], [member()]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toEqual({
      id: "m1",
      displayName: "Karim",
      jerseyNumber: 9,
      minutes: 401,
      goals: 11,
      assists: 7,
      // The trap: three near-identical minute fields, each with its own distinct value above.
      cleanMinutes: 211,
      gkMinutes: 61,
      gkCleanMinutes: 41,
      ratingAverage: 7.25,
      ratingCount: 4,
      ratingVariance: 0.5,
      declarations: { AT: "primary" },
      // Decisions 171–172: what the cahier's sevens read on top.
      outfieldMinutes: 340,
      concededOutfield: 3,
      concededWhileGk: 2,
      positions: [{ group: "AT", minutes: 340, goalsFor: 4, goalsAgainst: 3 }],
    });
  });

  it("keeps the three clean-sheet and goalkeeping minutes apart", () => {
    const { candidates } = toBestSevenSquad(
      [seasonRow({ minutes: 100, cleanMinutes: 20, gkMinutes: 30, gkCleanMinutes: 10 })],
      [member()],
    );

    expect(candidates[0]).toMatchObject({
      minutes: 100,
      cleanMinutes: 20,
      gkMinutes: 30,
      gkCleanMinutes: 10,
    });
  });

  it("passes the rating variance through, and keeps a null null", () => {
    const withVariance = toBestSevenSquad(
      [seasonRow({ rating: { average: 6, count: 3, variance: 1.25 } })],
      [member()],
    );
    expect(withVariance.candidates[0]?.ratingVariance).toBe(1.25);

    const withoutVariance = toBestSevenSquad(
      [seasonRow({ rating: { average: 6, count: 1, variance: null } })],
      [member()],
    );
    expect(withoutVariance.candidates[0]?.ratingVariance).toBeNull();
  });

  it("reports no rating average when nobody has rated him, rather than a zero", () => {
    const { candidates } = toBestSevenSquad(
      [seasonRow({ rating: { average: null, count: 0, variance: null } })],
      [member()],
    );

    expect(candidates[0]?.ratingAverage).toBeNull();
    expect(candidates[0]?.ratingCount).toBe(0);
  });

  it("keeps a squad member with no season row, as a zero-exposure candidate", () => {
    // Rule 2 of `best-seven.ts` lands him exactly on the squad mean, so he heads neither seven.
    // Dropping him here would instead make a seven of five men on a squad that has just started.
    const { candidates } = toBestSevenSquad([], [member({ membershipId: "m9" })]);

    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      id: "m9",
      minutes: 0,
      goals: 0,
      assists: 0,
      cleanMinutes: 0,
      gkMinutes: 0,
      gkCleanMinutes: 0,
      ratingAverage: null,
      ratingCount: 0,
      ratingVariance: null,
    });
  });

  it("excludes a member who is not a player, and counts him", () => {
    const { candidates, nonPlayers } = toBestSevenSquad(
      [seasonRow({ teamMemberId: "coach", isPlayer: false })],
      [member({ membershipId: "coach", isPlayer: false }), member()],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["m1"]);
    expect(nonPlayers).toBe(1);
  });

  it("counts a departed player who has data, and never fields him", () => {
    // `getSquad` has already dropped him, so he cannot be a candidate; the count is what lets the
    // screen say so instead of the reader inferring it from an absence.
    const { candidates, departedWithData } = toBestSevenSquad(
      [seasonRow({ teamMemberId: "gone", hasLeft: true, hasData: true }), seasonRow()],
      [member()],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["m1"]);
    expect(departedWithData).toBe(1);
  });

  it("does not count a departed player who never played", () => {
    const { departedWithData } = toBestSevenSquad(
      [seasonRow({ teamMemberId: "gone", hasLeft: true, hasData: false })],
      [member()],
    );

    expect(departedWithData).toBe(0);
  });

  it("flattens primary and secondary declarations", () => {
    const { candidates } = toBestSevenSquad(
      [seasonRow()],
      [
        member({
          positions: [
            { code: "MC", preference: "primary" },
            { code: "DC", preference: "secondary" },
          ],
        }),
      ],
    );

    expect(candidates[0]?.declarations).toEqual({ MC: "primary", DC: "secondary" });
  });

  it("lets a primary win a duplicated code whatever order the rows arrive in", () => {
    const secondaryFirst = toBestSevenSquad(
      [seasonRow()],
      [
        member({
          positions: [
            { code: "MC", preference: "secondary" },
            { code: "MC", preference: "primary" },
          ],
        }),
      ],
    );
    const primaryFirst = toBestSevenSquad(
      [seasonRow()],
      [
        member({
          positions: [
            { code: "MC", preference: "primary" },
            { code: "MC", preference: "secondary" },
          ],
        }),
      ],
    );

    expect(secondaryFirst.candidates[0]?.declarations).toEqual({ MC: "primary" });
    expect(primaryFirst.candidates[0]?.declarations).toEqual({ MC: "primary" });
  });

  it("gives a member who declared nothing an empty record, which is `fit: none` everywhere", () => {
    const { candidates } = toBestSevenSquad([seasonRow()], [member({ positions: [] })]);

    expect(candidates[0]?.declarations).toEqual({});
  });

  it("keeps the squad's order, and takes identity from the squad rather than the season", () => {
    const { candidates } = toBestSevenSquad(
      [seasonRow({ teamMemberId: "b", displayName: "Momo", jerseyNumber: 4 })],
      [
        member({ membershipId: "a", displayName: "Alex", jerseyNumber: 7 }),
        member({ membershipId: "b", displayName: "Momo", jerseyNumber: 4 }),
      ],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["a", "b"]);
    // No season row for « a », and that must not cost him his name: the join is what is missing, not
    // his identity. `displayName: ""` drew a nameless disc on the pitch and a nameless picker row.
    expect(candidates[0]).toMatchObject({ displayName: "Alex", jerseyNumber: 7 });
    expect(candidates[1]).toMatchObject({ displayName: "Momo", jerseyNumber: 4 });
  });

  it("never prefers the season row's identity over the squad's", () => {
    // Both come from `users`, so they agree in production — but only the squad row is certain to
    // exist, so it is the one this adapter reads. Pinned because « they agree anyway » is exactly the
    // reasoning that made the empty string look harmless.
    const { candidates } = toBestSevenSquad(
      [seasonRow({ teamMemberId: "m1", displayName: "périmé", jerseyNumber: 99 })],
      [member({ displayName: "Karim", jerseyNumber: 8 })],
    );

    expect(candidates[0]).toMatchObject({ displayName: "Karim", jerseyNumber: 8 });
  });
});

describe("toBestSevenSlots", () => {
  it("marks the GB slot as the goal and nothing else", () => {
    const slots = toBestSevenSlots([
      { id: "s1", positionCode: "GB" },
      { id: "s2", positionCode: "DC" },
    ]);

    expect(slots).toEqual([
      { id: "s1", positionCode: "GB", isGoalkeeper: true },
      { id: "s2", positionCode: "DC", isGoalkeeper: false },
    ]);
  });

  it("keeps two slots of the same post distinct", () => {
    // 1-3-2-1 has two MC. Keying on the post code would collapse them and lose a man.
    const slots = toBestSevenSlots([
      { id: "left", positionCode: "MC" },
      { id: "right", positionCode: "MC" },
    ]);

    expect(slots.map((slot) => slot.id)).toEqual(["left", "right"]);
  });
});

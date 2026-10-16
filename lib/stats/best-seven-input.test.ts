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
import { SEVEN_KINDS, solveSeven } from "./sevens";

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
      // The team's goals while he was on — 4 — beside his own 11. The pair the offensive seven
      // depends on, and the one it would be easiest to swap.
      goalsForWhileOn: 4,
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

  it("excludes a squad member with no season row at all, and counts him (decision 187)", () => {
    // He used to be kept, on the grounds that rule 2 of `best-seven.ts` lands him on the squad mean
    // and so he heads no seven — but he is routinely *in* one, on a figure that is not his. « A-t-il
    // joué » is not the minimum-exposure threshold the owner refused, which is « a-t-il assez joué ».
    const { candidates, withoutMinutes, eligible } = toBestSevenSquad(
      [],
      [member({ membershipId: "m9" })],
    );

    expect(candidates).toEqual([]);
    expect(withoutMinutes).toBe(1);
    expect(eligible).toBe(0);
  });

  it("excludes a member who has a season row but not one minute of it", () => {
    // The realistic shape of it: convoqué, on the sheet, never on the pitch. A rating or a conceded
    // count can exist without a minute, and `minutes` is what « temps de jeu » means.
    const { candidates, withoutMinutes } = toBestSevenSquad(
      [
        seasonRow({ teamMemberId: "bench", minutes: 0, outfieldMinutes: 0, gkMinutes: 0 }),
        seasonRow(),
      ],
      [member({ membershipId: "bench", displayName: "Raphaël" }), member()],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["m1"]);
    expect(withoutMinutes).toBe(1);
  });

  it("keeps a man with a single minute, shrunk rather than gated", () => {
    // The line between this change and the threshold the owner refused, pinned: one minute ranks.
    const { candidates, withoutMinutes, eligible } = toBestSevenSquad(
      [seasonRow({ minutes: 1 })],
      [member()],
    );

    expect(candidates.map((candidate) => candidate.minutes)).toEqual([1]);
    expect(withoutMinutes).toBe(0);
    expect(eligible).toBe(1);
  });

  it("does not count the encadrement as men without game time", () => {
    // He is already out for not being a player, and counting him twice would print two sentences
    // about one absent name.
    const { withoutMinutes, nonPlayers } = toBestSevenSquad(
      [],
      [member({ membershipId: "coach", isPlayer: false }), member({ membershipId: "m1" })],
    );

    expect(nonPlayers).toBe(1);
    expect(withoutMinutes).toBe(1);
  });

  it("excludes a member who is not a player, and counts him", () => {
    const { candidates, nonPlayers } = toBestSevenSquad(
      // Both have minutes, so the only thing that can keep him out is `is_player` (decision 187 would
      // otherwise do it for him, and the test would pass without testing anything).
      [seasonRow({ teamMemberId: "coach", isPlayer: false }), seasonRow()],
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
      [
        // « a »'s row says nothing about who he is — both names used to come from this side, and an
        // absent one produced `displayName: ""`, a nameless disc on the pitch and a nameless picker
        // row. The join is what may be thin; who he is never is.
        seasonRow({ teamMemberId: "a", displayName: "", jerseyNumber: null }),
        seasonRow({ teamMemberId: "b", displayName: "Momo", jerseyNumber: 4 }),
      ],
      [
        member({ membershipId: "a", displayName: "Alex", jerseyNumber: 7 }),
        member({ membershipId: "b", displayName: "Momo", jerseyNumber: 4 }),
      ],
    );

    expect(candidates.map((candidate) => candidate.id)).toEqual(["a", "b"]);
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

/* -------------------------------------------------------------------------- */
/* Decision 187, end to end: the adapter feeding the four sevens              */
/* -------------------------------------------------------------------------- */

/**
 * The exclusion matters where the two files meet, so these go through `solveSeven` rather than stop at
 * the candidate list: a filter that let one zero-minute man through would still produce a plausible
 * seven, which is the defect class decision 097 is about.
 */
describe("a man with no game time, through the four sevens", () => {
  const SLOT_CODES = ["GB", "DC", "DC", "MC", "AIL", "AIL", "AT"] as const;
  const slots = toBestSevenSlots(
    SLOT_CODES.map((code, index) => ({ id: `s${index}`, positionCode: code })),
  );

  /** Everything a post can be declared as, so the positional objective *wants* this man. */
  const everyPost: DeclaredPositions["positions"] = [
    { code: "GB", preference: "primary" },
    { code: "DC", preference: "primary" },
    { code: "MC", preference: "primary" },
    { code: "AIL", preference: "primary" },
    { code: "AT", preference: "primary" },
  ];

  /**
   * Eight men who have never played, each declaring every post — and the figures that used to put them
   * on the pitch: no exposure lands them exactly on the squad mean (rule 2), which beats a real figure
   * at any slot with a second candidate, and their declarations beat a played man's « pas son poste ».
   */
  const idle = Array.from({ length: 8 }, (_, index) =>
    member({
      membershipId: `idle${index}`,
      displayName: `Fantôme ${index}`,
      jerseyNumber: null,
      positions: everyPost,
    }),
  );

  /** Four who have played, declaring nothing: every slot is « pas son poste » for them. */
  const played = Array.from({ length: 4 }, (_, index) =>
    member({ membershipId: `played${index}`, displayName: `Joueur ${index}`, positions: [] }),
  );
  const playedSeasons = played.map((man, index) =>
    seasonRow({
      teamMemberId: man.membershipId,
      minutes: 60 + index,
      // One of them has kept goal, so the GB slot has somebody the keeper rule allows.
      gkMinutes: index === 0 ? 30 : 0,
      gkCleanMinutes: index === 0 ? 10 : 0,
      concededWhileGk: index === 0 ? 2 : 0,
      outfieldMinutes: index === 0 ? 30 : 60 + index,
      positions: [{ group: "DC", minutes: 60, goalsFor: 2, goalsAgainst: 1 }],
    }),
  );

  const squad = toBestSevenSquad(playedSeasons, [...idle, ...played]);

  it("leaves them out of the candidate list, however many posts they declared", () => {
    expect(squad.candidates.map((candidate) => candidate.id)).toEqual(
      played.map((man) => man.membershipId),
    );
    expect(squad.withoutMinutes).toBe(8);
    expect(squad.eligible).toBe(4);
  });

  it("empties the posts it cannot fill rather than drawing a ghost in them", () => {
    for (const kind of SEVEN_KINDS) {
      const result = solveSeven(kind, { candidates: squad.candidates, slots });

      const filled = result.picks.filter((pick) => pick.player !== null);
      // Four men, seven posts: four discs and three « Poste vide » — never a seventh name, and never a
      // man in two slots.
      expect(filled, kind).toHaveLength(4);
      expect(new Set(filled.map((pick) => pick.player?.id)).size, kind).toBe(4);
      expect(result.picks.filter((pick) => pick.player === null), kind).toHaveLength(3);

      // And the men on it are the ones who played, not the ones who declared the posts.
      for (const pick of filled) {
        expect(pick.player?.id, kind).toMatch(/^played/);
        expect(pick.cell, kind).not.toBeNull();
      }
    }
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

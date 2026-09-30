import { describe, expect, it } from "vitest";

import { type RankableFormation, byUsage } from "./formation-usage.rank";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A formation nothing distinguishes, so each test states only the field it is about.
 *
 * Every default is chosen to tie: same match count, same last use, same builtin-ness, same label.
 * That is what makes a level testable in isolation — a pair that differs at two levels at once
 * proves nothing about which of the two decided the order.
 */
function shape(formationId: string, extra: Partial<RankableFormation> = {}): RankableFormation {
  return {
    formationId,
    label: "1-3-2-1",
    isBuiltin: true,
    matches: 4,
    appliedMatches: 4,
    lastUsedAt: "2026-09-20T08:30:00.000Z",
    ...extra,
  };
}

/** The winner of a two-horse race, asserted in both argument orders. */
function firstOf(a: RankableFormation, b: RankableFormation): string {
  const forwards = [a, b].sort(byUsage)[0]!.formationId;
  const backwards = [b, a].sort(byUsage)[0]!.formationId;
  // A comparator that answers differently depending on which side a row arrived on is not an order.
  expect(backwards).toBe(forwards);
  return forwards;
}

/* -------------------------------------------------------------------------- */
/* The four levels, each isolated at every preceding one                      */
/* -------------------------------------------------------------------------- */

describe("byUsage — level 1: more matches wins", () => {
  it("puts the shape played more often first", () => {
    const often = shape("often", { matches: 7 });
    const rarely = shape("rarely", { matches: 2 });
    expect(firstOf(often, rarely)).toBe("often");
  });

  it("outranks every later level: a custom shape played more beats a built-in played less", () => {
    const custom = shape("custom", {
      matches: 7,
      isBuiltin: false,
      label: "2-3-1",
    });
    const builtin = shape("builtin", {
      matches: 6,
      isBuiltin: true,
      lastUsedAt: "2026-09-27T08:30:00.000Z",
    });
    expect(firstOf(custom, builtin)).toBe("custom");
  });

  it("sorts a formation that exists but was never played below one that was", () => {
    const unused = shape("unused", {
      matches: 0,
      appliedMatches: 0,
      lastUsedAt: null,
    });
    const used = shape("used", { matches: 1, appliedMatches: 0 });
    expect(firstOf(unused, used)).toBe("used");
  });

  it("does not rank on appliedMatches — a season played without game mode still counts", () => {
    // The rule `formation-usage.ts` argues for (decision 006 versus decision 013): confirmation is
    // reported, never ranked on. Fewer matches loses even when every one of them was confirmed.
    const confirmed = shape("confirmed", { matches: 3, appliedMatches: 3 });
    const unconfirmed = shape("unconfirmed", { matches: 5, appliedMatches: 0 });
    expect(firstOf(confirmed, unconfirmed)).toBe("unconfirmed");
  });
});

describe("byUsage — level 2: then the most recently used", () => {
  it("separates two shapes played four times each by their last Sunday", () => {
    // The case that motivates the level at all: equal denominators, and one of them is current.
    const lastWeek = shape("lastWeek", {
      matches: 4,
      lastUsedAt: "2026-09-27T08:30:00.000Z",
    });
    const inMarch = shape("inMarch", {
      matches: 4,
      lastUsedAt: "2026-03-01T08:30:00.000Z",
    });
    expect(firstOf(lastWeek, inMarch)).toBe("lastWeek");
  });

  it("outranks the levels below it: a custom shape used later beats a built-in used earlier", () => {
    const recentCustom = shape("recentCustom", {
      isBuiltin: false,
      label: "2-3-1",
      lastUsedAt: "2026-09-27T08:30:00.000Z",
    });
    const staleBuiltin = shape("staleBuiltin", {
      isBuiltin: true,
      label: "1-2-3-1",
      lastUsedAt: "2026-03-01T08:30:00.000Z",
    });
    expect(firstOf(recentCustom, staleBuiltin)).toBe("recentCustom");
  });

  it("treats a null last use as never, not as any particular instant", () => {
    // Reachable only through inconsistent input — never played means zero matches, which level 1
    // already separates. Pinned anyway: `null` must not compare as the epoch, as now, or as equal.
    const never = shape("never", { lastUsedAt: null });
    const once = shape("once", { lastUsedAt: "2020-01-01T00:00:00.000Z" });
    expect(firstOf(never, once)).toBe("once");
  });
});

describe("byUsage — level 3: then a built-in before a custom shape", () => {
  it("prefers the template when matches and last use tie", () => {
    const builtin = shape("builtin", { isBuiltin: true, label: "1-3-2-1" });
    const custom = shape("custom", { isBuiltin: false, label: "1-3-2-1" });
    expect(firstOf(builtin, custom)).toBe("builtin");
  });

  it("outranks the label: a built-in sorts first even with the later label", () => {
    const builtin = shape("builtin", { isBuiltin: true, label: "2-3-1" });
    const custom = shape("custom", { isBuiltin: false, label: "1-2-3-1" });
    expect(firstOf(builtin, custom)).toBe("builtin");
  });
});

describe("byUsage — level 4: then the label, then the id", () => {
  it("falls back to the label when everything above it ties", () => {
    const early = shape("early", { label: "1-2-3-1" });
    const late = shape("late", { label: "2-3-1" });
    expect(firstOf(early, late)).toBe("early");
  });

  it("falls back to the id when even the label ties", () => {
    // Two shapes a coach named twice. Arbitrary, and the point is only that it never flips.
    expect(firstOf(shape("aaa"), shape("bbb"))).toBe("aaa");
  });
});

/* -------------------------------------------------------------------------- */
/* The claim the whole comparator exists to make                              */
/* -------------------------------------------------------------------------- */

describe("byUsage is a total order", () => {
  /**
   * Includes a pair identical at every level but the id, which is where a merely-stable comparator
   * would leak the arrival order — and `formationId` is a primary key, so it can never tie.
   */
  const catalogue: RankableFormation[] = [
    shape("diamond", { matches: 4, lastUsedAt: "2026-09-27T08:30:00.000Z" }),
    shape("flat", { matches: 4, lastUsedAt: "2026-03-01T08:30:00.000Z" }),
    shape("twinStrikers", { matches: 7, isBuiltin: false, label: "1-3-1-2" }),
    shape("unused", { matches: 0, appliedMatches: 0, lastUsedAt: null }),
    shape("twinA", { matches: 2 }),
    shape("twinB", { matches: 2 }),
  ];

  const ids = (rows: readonly RankableFormation[]) =>
    [...rows].sort(byUsage).map((row) => row.formationId);

  it("yields the same sequence from two different starting permutations", () => {
    // « the same season always yields the same seven posts »: if this can fail, the pitch can repaint
    // because a row was inserted somewhere unrelated.
    expect(ids(catalogue)).toEqual(ids([...catalogue].reverse()));
    // Every rotation, so no single lucky starting point is doing the work.
    for (let offset = 1; offset < catalogue.length; offset += 1) {
      expect(ids([...catalogue.slice(offset), ...catalogue.slice(0, offset)])).toEqual(
        ids(catalogue),
      );
    }
  });

  it("ranks this catalogue the way the four levels say it should", () => {
    expect(ids(catalogue)).toEqual([
      "twinStrikers", // 7 matches — level 1, and nothing else is consulted
      "diamond", // 4, used in September — level 2
      "flat", // 4, used in March
      "twinA", // 2, identical to twinB but for the id — level 4
      "twinB",
      "unused", // 0 matches, never played
    ]);
  });

  it("calls nothing equal, so a stable sort has nothing left to decide", () => {
    for (const a of catalogue) {
      for (const b of catalogue) {
        if (a === b) expect(byUsage(a, b)).toBe(0);
        else expect(byUsage(a, b)).not.toBe(0);
      }
    }
  });

  it("is antisymmetric across every pair", () => {
    for (const a of catalogue) {
      for (const b of catalogue) {
        // Summed rather than negated: `-Math.sign(0)` is `-0`, which `toBe` distinguishes from `0`.
        expect(Math.sign(byUsage(a, b)) + Math.sign(byUsage(b, a))).toBe(0);
      }
    }
  });
});

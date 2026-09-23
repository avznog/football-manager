import { describe, expect, it } from "vitest";

import { entryModeBadgeFr, periodsLabel, resultLabel, resultLetter } from "./labels";

describe("entryModeBadgeFr", () => {
  it("says so for a match typed up afterwards", () => {
    expect(entryModeBadgeFr("retro", { recorded: true })).toBe("saisi après le match");
  });

  /**
   * A badge on every match of the season would be noise, and the caller renders nothing at all on
   * `null` — so if this ever starts returning a string, every card in the calendar grows a label
   * nobody needs.
   */
  it("says nothing about a match that was followed live", () => {
    expect(entryModeBadgeFr("live", { recorded: true })).toBeNull();
  });

  /**
   * The state the demo season is in for FC des Deux-Ponts: `entry_mode = retro`, nine men on the
   * sheet, an empty log. The label describes a log, so with no log there is nothing to describe —
   * « saisi après le match » there would be a claim about an afternoon nobody has typed up yet.
   */
  it("says nothing when there is no log to have been entered", () => {
    expect(entryModeBadgeFr("retro", { recorded: false })).toBeNull();
    expect(entryModeBadgeFr("live", { recorded: false })).toBeNull();
  });
});

describe("the labels the match header shares with the calendar", () => {
  it("names the result from the two goal counts", () => {
    expect(resultLabel(3, 1)).toBe("Victoire");
    expect(resultLabel(1, 1)).toBe("Match nul");
    expect(resultLabel(0, 2)).toBe("Défaite");
    expect(resultLetter(3, 1)).toBe("V");
  });

  it("spells the periods the way the owner writes them", () => {
    expect(periodsLabel(2, 30)).toBe("2×30 minutes");
  });
});

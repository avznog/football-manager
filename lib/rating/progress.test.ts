import { describe, expect, it } from "vitest";

import type { SquadRole } from "@/db/schema";
import {
  isOnRateableSheet,
  isRateableRole,
  rateableMemberIds,
  ratingProgress,
  ratingVisibility,
  type SheetEntry,
} from "./progress";

function sheet(...entries: [string, SquadRole][]): SheetEntry[] {
  return entries.map(([teamMemberId, role]) => ({ teamMemberId, role }));
}

const SHEET = sheet(
  ["hugo", "starter"],
  ["karim", "starter"],
  ["momo", "substitute"],
  ["pierre", "supporter"],
);

describe("isRateableRole", () => {
  it("is true for the players who were on the pitch or the bench", () => {
    expect(isRateableRole("starter")).toBe(true);
    expect(isRateableRole("substitute")).toBe(true);
  });

  it("is false for a supporter, and for nothing at all", () => {
    expect(isRateableRole("supporter")).toBe(false);
    expect(isRateableRole(null)).toBe(false);
    expect(isRateableRole(undefined)).toBe(false);
  });
});

describe("rateableMemberIds", () => {
  it("keeps starters and substitutes, drops supporters, and is sorted", () => {
    expect(rateableMemberIds(SHEET)).toEqual(["hugo", "karim", "momo"]);
  });

  it("is empty for a sheet with nobody who played", () => {
    expect(rateableMemberIds(sheet(["pierre", "supporter"]))).toEqual([]);
  });
});

describe("isOnRateableSheet", () => {
  it("lets a starter and a substitute rate", () => {
    expect(isOnRateableSheet(SHEET, "hugo")).toBe(true);
    expect(isOnRateableSheet(SHEET, "momo")).toBe(true);
  });

  it("refuses a supporter, a stranger, and a viewer with no membership", () => {
    // A coach who did not play is not on the sheet as a player: decision 007.
    expect(isOnRateableSheet(SHEET, "pierre")).toBe(false);
    expect(isOnRateableSheet(SHEET, "someone-else")).toBe(false);
    expect(isOnRateableSheet(SHEET, null)).toBe(false);
  });
});

describe("ratingProgress", () => {
  const requiredIds = ["hugo", "karim", "momo"];

  it("reports an untouched set", () => {
    const progress = ratingProgress({ requiredIds, submittedIds: [] });
    expect(progress).toMatchObject({
      submittedCount: 0,
      requiredCount: 3,
      complete: false,
      partial: false,
    });
    expect(progress.missingIds).toEqual(["hugo", "karim", "momo"]);
  });

  it("reports a partial set, and what is left", () => {
    const progress = ratingProgress({ requiredIds, submittedIds: ["karim"] });
    expect(progress).toMatchObject({ submittedCount: 1, complete: false, partial: true });
    expect(progress.missingIds).toEqual(["hugo", "momo"]);
  });

  it("is complete only when every required note is in, self-rating included", () => {
    // "momo" is the rater's own id here: the set is not complete until he has rated himself.
    expect(ratingProgress({ requiredIds, submittedIds: ["hugo", "karim"] }).complete).toBe(false);
    expect(
      ratingProgress({ requiredIds, submittedIds: ["hugo", "karim", "momo"] }).complete,
    ).toBe(true);
  });

  it("ignores a submitted note for somebody no longer on the sheet", () => {
    const progress = ratingProgress({
      requiredIds: ["hugo", "karim"],
      submittedIds: ["hugo", "karim", "ghost"],
    });
    expect(progress.complete).toBe(true);
    expect(progress.submittedIds).toEqual(["hugo", "karim"]);
    expect(progress.submittedCount).toBe(2);
  });

  it("treats an empty set as complete rather than as a lock nobody can open", () => {
    expect(ratingProgress({ requiredIds: [], submittedIds: [] })).toMatchObject({
      complete: true,
      partial: false,
      requiredCount: 0,
    });
  });
});

describe("ratingVisibility", () => {
  it("hides everything from a rater who has not finished", () => {
    expect(ratingVisibility({ mayRate: true, progress: { complete: false } })).toEqual({
      visible: false,
      reason: "incomplete",
    });
  });

  it("opens the results once the rater has submitted his full set", () => {
    expect(ratingVisibility({ mayRate: true, progress: { complete: true } })).toEqual({
      visible: true,
      reason: "complete",
    });
  });

  it("shows the results to somebody who was never a rater", () => {
    // The coach who did not play, a supporter, an admin: no set to submit, nothing to anchor on.
    expect(ratingVisibility({ mayRate: false, progress: { complete: false } })).toEqual({
      visible: true,
      reason: "not-a-rater",
    });
  });
});

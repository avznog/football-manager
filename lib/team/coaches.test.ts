import { describe, expect, it } from "vitest";

import { wouldLeaveNoCoach } from "./coaches";

describe("wouldLeaveNoCoach", () => {
  it("protects the only coach", () => {
    expect(wouldLeaveNoCoach(["karim"], "karim")).toBe(true);
  });

  it("lets a coach go once there are two", () => {
    expect(wouldLeaveNoCoach(["karim", "nico"], "karim")).toBe(false);
    expect(wouldLeaveNoCoach(["karim", "nico"], "nico")).toBe(false);
  });

  it("says nothing about a member who is not a coach", () => {
    expect(wouldLeaveNoCoach(["karim"], "fabien")).toBe(false);
  });

  /**
   * A team with no coach has nothing left to protect, and `db:bootstrap` leaves an instance looking
   * exactly like that for as long as it takes to create the first team. The old copies of this
   * predicate answered the same way, through `coaches[0]?.id === memberId` on an empty array — the
   * behaviour is deliberate, so it is pinned here rather than rediscovered.
   */
  it("allows anything when the team has no coach at all", () => {
    expect(wouldLeaveNoCoach([], "karim")).toBe(false);
  });
});

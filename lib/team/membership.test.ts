import { describe, expect, it } from "vitest";

import { memberBadgesFr, myPlayerCardTitleFr, noPlayerProfileReasonFr } from "./membership";

const labels = (role: "coach" | "player" | null, isPlayer: boolean) =>
  memberBadgesFr(role, isPlayer).map((badge) => badge.labelFr);

describe("memberBadgesFr", () => {
  it("names both things a coach who plays is", () => {
    expect(labels("coach", true)).toEqual(["coach", "joueur"]);
  });

  it("calls a coach who does not play the encadrement, not a joueur", () => {
    // What `createTeam` inserts for the founder of every team.
    expect(labels("coach", false)).toEqual(["coach", "encadrement"]);
  });

  it("never says « joueur » about a member whose `is_player` is false", () => {
    // The demotion case: `setMemberRole` writes `role` and leaves `is_player` alone, so this row is
    // two taps away from the state a new deployment starts in.
    expect(labels("player", false)).toEqual(["encadrement"]);
  });

  it("says « joueur » and nothing else about a player", () => {
    expect(labels("player", true)).toEqual(["joueur"]);
  });

  it("puts the coach badge first and gives it the only accent", () => {
    const badges = memberBadgesFr("coach", true);

    expect(badges[0]).toEqual({ labelFr: "coach", variant: "accent" });
    expect(badges.filter((badge) => badge.variant === "accent")).toHaveLength(1);
  });

  it("does not call a super admin who is not in the team one of its players", () => {
    // `getActiveTeam` returns `role: null` for a super admin pinned to a team by the cookie.
    expect(labels(null, false)).toEqual(["non membre"]);
  });

  it("always says at least one thing, whatever the columns hold", () => {
    for (const role of ["coach", "player", null] as const) {
      for (const isPlayer of [true, false]) {
        expect(memberBadgesFr(role, isPlayer).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("noPlayerProfileReasonFr", () => {
  it("gives the encadrement the reason that is theirs", () => {
    expect(noPlayerProfileReasonFr(true)).toContain("encadrement");
  });

  it("does not tell a non-member he is part of the encadrement", () => {
    expect(noPlayerProfileReasonFr(false)).not.toContain("encadrement");
    expect(noPlayerProfileReasonFr(false)).toContain("pas membre");
  });

  it("does not repeat the heading above it", () => {
    for (const isMember of [true, false]) {
      expect(noPlayerProfileReasonFr(isMember)).not.toContain("fiche joueur");
    }
  });
});

describe("myPlayerCardTitleFr", () => {
  it("does not head « Mon profil de joueur » a card saying you have none", () => {
    expect(myPlayerCardTitleFr(false)).toBe("Tu n’as pas de fiche joueur");
  });

  it("keeps the ordinary heading for a player", () => {
    expect(myPlayerCardTitleFr(true)).toBe("Mon profil de joueur");
  });

  it("tutoies the reader, like the rest of the app (decision 074)", () => {
    expect(myPlayerCardTitleFr(false)).not.toContain("Vous");
    expect(myPlayerCardTitleFr(false)).toContain("Tu");
  });
});

import { describe, expect, it } from "vitest";

import { type Actor, can, isCoachOf } from "./can";

const TEAM = "team-1";
const OTHER_TEAM = "team-2";

function actor(overrides: Partial<Actor> = {}): Actor {
  return {
    userId: "user-1",
    isSuperAdmin: false,
    memberships: [],
    ...overrides,
  };
}

const player = actor({
  userId: "player-user",
  memberships: [{ membershipId: "m-player", teamId: TEAM, role: "player", isPlayer: true }],
});

const coach = actor({
  userId: "coach-user",
  memberships: [{ membershipId: "m-coach", teamId: TEAM, role: "coach", isPlayer: false }],
});

const playerCoach = actor({
  userId: "pc-user",
  memberships: [{ membershipId: "m-pc", teamId: TEAM, role: "coach", isPlayer: true }],
});

const superAdmin = actor({ userId: "admin-user", isSuperAdmin: true });

describe("can — super admin", () => {
  it("may do anything, on any team, without a membership", () => {
    expect(can(superAdmin, "team:create", { teamId: OTHER_TEAM })).toBe(true);
    expect(can(superAdmin, "match:selectSquad", { teamId: OTHER_TEAM })).toBe(true);
    expect(can(superAdmin, "team:appointCoach", { teamId: OTHER_TEAM })).toBe(true);
  });
});

describe("can — players", () => {
  it("cannot select a squad or manage compositions", () => {
    expect(can(player, "match:selectSquad", { teamId: TEAM })).toBe(false);
    expect(can(player, "match:manageLineups", { teamId: TEAM })).toBe(false);
  });

  it("cannot administer the team", () => {
    expect(can(player, "team:invite", { teamId: TEAM })).toBe(false);
    expect(can(player, "competition:manage", { teamId: TEAM })).toBe(false);
    expect(can(player, "team:appointCoach", { teamId: TEAM })).toBe(false);
    expect(can(player, "member:resetPassword", { teamId: TEAM })).toBe(false);
    expect(can(player, "match:create", { teamId: TEAM })).toBe(false);
    expect(can(player, "training:markAttendance", { teamId: TEAM })).toBe(false);
  });

  it("may read their team", () => {
    expect(can(player, "team:read", { teamId: TEAM })).toBe(true);
  });

  it("never reads an individual note, not even one of his own match's", () => {
    // Decision 137's whole point: he reads the mean and cannot work out who gave what. `team:read`
    // does not reach this, which is why it is its own action and not « a read, so anybody ».
    expect(can(player, "rating:readNotes", { teamId: TEAM })).toBe(false);
    expect(can(player, "rating:publish", { teamId: TEAM })).toBe(false);
    // Nor by claiming to be acting on himself, the way the self-scoped actions work.
    expect(can(player, "rating:readNotes", { teamId: TEAM, targetMemberId: "m-player" })).toBe(
      false,
    );
  });

  it("may act on themselves", () => {
    expect(can(player, "availability:declare", { teamId: TEAM })).toBe(true);
    expect(can(player, "profile:editPositions", { teamId: TEAM })).toBe(true);
    expect(can(player, "profile:editShirtName", { teamId: TEAM })).toBe(true);
    expect(can(player, "injury:declare", { teamId: TEAM })).toBe(true);
    expect(can(player, "rating:submit", { teamId: TEAM })).toBe(true);
  });

  it("owns the name on their shirt but not the number on it", () => {
    // The flocage is the player's; the number has to agree with twelve other numbers, so it stays
    // the coach's `member:update`.
    expect(can(player, "profile:editShirtName", { teamId: TEAM })).toBe(true);
    expect(can(player, "member:update", { teamId: TEAM, targetMemberId: "m-player" })).toBe(false);
  });

  it("may not act on somebody else", () => {
    const other = { teamId: TEAM, targetMemberId: "m-someone-else" };
    expect(can(player, "availability:declare", other)).toBe(false);
    expect(can(player, "profile:editPositions", other)).toBe(false);
    expect(can(player, "profile:editShirtName", other)).toBe(false);
    expect(can(player, "injury:declare", other)).toBe(false);
    expect(can(player, "rating:submit", other)).toBe(false);
  });

  it("explicitly targeting their own membership is allowed", () => {
    expect(
      can(player, "availability:declare", { teamId: TEAM, targetMemberId: "m-player" }),
    ).toBe(true);
  });
});

describe("can — coaches", () => {
  it("may run their team", () => {
    expect(can(coach, "match:create", { teamId: TEAM })).toBe(true);
    expect(can(coach, "match:selectSquad", { teamId: TEAM })).toBe(true);
    expect(can(coach, "match:manageLineups", { teamId: TEAM })).toBe(true);
    expect(can(coach, "match:operate", { teamId: TEAM })).toBe(true);
    expect(can(coach, "match:amend", { teamId: TEAM })).toBe(true);
    expect(can(coach, "team:invite", { teamId: TEAM })).toBe(true);
    // The competitions the team plays in are the coach's to define (decision 107).
    expect(can(coach, "competition:manage", { teamId: TEAM })).toBe(true);
    expect(can(coach, "team:appointCoach", { teamId: TEAM })).toBe(true);
    expect(can(coach, "training:markAttendance", { teamId: TEAM })).toBe(true);
  });

  it("may declare an injury for another player", () => {
    expect(
      can(coach, "injury:declare", { teamId: TEAM, targetMemberId: "m-someone-else" }),
    ).toBe(true);
  });

  it("cannot touch another team", () => {
    expect(can(coach, "match:create", { teamId: OTHER_TEAM })).toBe(false);
    expect(can(coach, "team:update", { teamId: OTHER_TEAM })).toBe(false);
    expect(can(coach, "team:read", { teamId: OTHER_TEAM })).toBe(false);
  });

  it("cannot create a team", () => {
    expect(can(coach, "team:create", { teamId: TEAM })).toBe(false);
  });

  it("reads the individual notes, and may release a match's means", () => {
    // Decision 137: the raw notes are the coach's alone, and he is the escape hatch for a straggler
    // who never rates. Both have to work for a coach who did not play himself — which is why they
    // are coach actions and not self-scoped ones like `rating:submit` two tests down.
    expect(can(coach, "rating:readNotes", { teamId: TEAM })).toBe(true);
    expect(can(coach, "rating:publish", { teamId: TEAM })).toBe(true);
  });

  it("who does not play has nothing to declare for themselves", () => {
    // A non-playing coach has no availability or position preferences of their own.
    expect(can(coach, "availability:declare", { teamId: TEAM })).toBe(false);
    expect(can(coach, "rating:submit", { teamId: TEAM })).toBe(false);
    expect(can(coach, "profile:editPositions", { teamId: TEAM })).toBe(false);
    // Not a maillot, so not a flocage. He still reaches a player's through `member:update`.
    expect(can(coach, "profile:editShirtName", { teamId: TEAM })).toBe(false);
    expect(can(coach, "member:update", { teamId: TEAM, targetMemberId: "m-player" })).toBe(true);
  });
});

describe("can — player-coach", () => {
  it("gets both permission sets", () => {
    expect(can(playerCoach, "match:selectSquad", { teamId: TEAM })).toBe(true);
    expect(can(playerCoach, "availability:declare", { teamId: TEAM })).toBe(true);
    expect(can(playerCoach, "rating:submit", { teamId: TEAM })).toBe(true);
  });
});

describe("can — delegated match operator", () => {
  const match = { status: "live" as const, operatorUserId: "player-user" };

  it("lets a designated non-coach run game mode for that match", () => {
    expect(can(player, "match:operate", { teamId: TEAM, match })).toBe(true);
  });

  it("does not extend to anything else", () => {
    expect(can(player, "match:manageLineups", { teamId: TEAM, match })).toBe(false);
    expect(can(player, "match:amend", { teamId: TEAM, match })).toBe(false);
  });

  it("does not apply to a different player", () => {
    const someoneElse = actor({
      userId: "other-user",
      memberships: [{ membershipId: "m-other", teamId: TEAM, role: "player", isPlayer: true }],
    });
    expect(can(someoneElse, "match:operate", { teamId: TEAM, match })).toBe(false);
  });

  it("does not apply outside the team", () => {
    expect(can(player, "match:operate", { teamId: OTHER_TEAM, match })).toBe(false);
  });
});

describe("can — no membership", () => {
  const stranger = actor({ userId: "stranger" });

  it("reaches nothing at all", () => {
    expect(can(stranger, "team:read", { teamId: TEAM })).toBe(false);
    expect(can(stranger, "availability:declare", { teamId: TEAM })).toBe(false);
    expect(can(stranger, "match:create", { teamId: TEAM })).toBe(false);
    expect(can(stranger, "team:create", { teamId: TEAM })).toBe(false);
  });
});

describe("isCoachOf", () => {
  it("is true for a coach of that team, and for a super admin anywhere", () => {
    expect(isCoachOf(coach, TEAM)).toBe(true);
    expect(isCoachOf(coach, OTHER_TEAM)).toBe(false);
    expect(isCoachOf(player, TEAM)).toBe(false);
    expect(isCoachOf(superAdmin, OTHER_TEAM)).toBe(true);
  });
});

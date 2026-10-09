/**
 * `submitRatings` refuses a member the match sheet does not name (decision 159).
 *
 * The one Server Action test in the suite, and it is a unit test on purpose: everything that touches
 * Postgres or Next is mocked, so what is under test is the order of the rules in `actions.ts` — the
 * permission from `can()`, then the sheet from `match_squad` — and the fact that a crafted form from an
 * unselected member never reaches the insert. The browser half (the notation screen explaining instead
 * of offering a form) is `e2e/happy-path.spec.ts`.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/auth/can";

const TEAM = "00000000-0000-4000-8000-000000000001";
const MATCH = "00000000-0000-4000-8000-000000000002";
const HUGO = "00000000-0000-4000-8000-0000000000a1";
const KARIM = "00000000-0000-4000-8000-0000000000a2";
const PIERRE = "00000000-0000-4000-8000-0000000000a3";
const RAYAN = "00000000-0000-4000-8000-0000000000a4";

const state = vi.hoisted(() => ({
  actor: null as unknown as Actor,
  inserted: [] as unknown[],
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
}));
vi.mock("@/lib/auth/dal", () => ({ requireActor: async () => state.actor }));
vi.mock("@/lib/match/queries", () => ({
  getMatch: async () => ({ id: MATCH, teamId: TEAM, status: "finished" }),
}));
vi.mock("./queries", () => ({
  // Hugo and Karim played; Pierre watched as a supporter; Rayan was not selected.
  playedEntriesOf: async () => [
    { teamMemberId: HUGO, minutes: 60 },
    { teamMemberId: KARIM, minutes: 60 },
  ],
  getMatchSheet: async () => [
    { teamMemberId: HUGO, role: "starter" },
    { teamMemberId: KARIM, role: "starter" },
    { teamMemberId: PIERRE, role: "supporter" },
  ],
}));
vi.mock("@/db/client", () => {
  const chain = {
    values(rows: unknown[]) {
      state.inserted.push(...rows);
      return chain;
    },
    onConflictDoNothing: () => chain,
    returning: async () => state.inserted.map(() => ({ ratedMemberId: "x" })),
  };
  return {
    db: {
      insert: () => chain,
      // The « has he finished » read after the insert: one partial set, so no redirect.
      select: () => ({ from: () => ({ where: async () => [] }) }),
    },
  };
});

const { submitRatings } = await import("./actions");

function actorFor(membershipId: string): Actor {
  return {
    userId: `user-${membershipId}`,
    isSuperAdmin: false,
    memberships: [{ membershipId, teamId: TEAM, role: "player", isPlayer: true }],
  };
}

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  data.set("teamId", TEAM);
  data.set("matchId", MATCH);
  for (const [id, score] of Object.entries(entries)) data.set(`score:${id}`, score);
  return data;
}

beforeEach(() => {
  state.inserted = [];
});

describe("submitRatings and the match sheet", () => {
  it("refuses a crafted form from a member who was not selected, and writes nothing", async () => {
    state.actor = actorFor(RAYAN);
    const result = await submitRatings(undefined, form({ [HUGO]: "8", [KARIM]: "7" }));

    expect(result?.error).toBe(
      "Tu n’étais pas sur la feuille de ce match : seuls les titulaires, les remplaçants et les supporters le notent.",
    );
    expect(state.inserted).toEqual([]);
  });

  it("refuses a coach who is not on the sheet", async () => {
    state.actor = {
      userId: "user-coach",
      isSuperAdmin: false,
      memberships: [{ membershipId: RAYAN, teamId: TEAM, role: "coach", isPlayer: false }],
    };
    const result = await submitRatings(undefined, form({ [HUGO]: "8" }));

    expect(result?.error).toMatch(/^Tu n’étais pas sur la feuille de ce match/);
    expect(state.inserted).toEqual([]);
  });

  it("accepts a supporter's notes", async () => {
    state.actor = actorFor(PIERRE);
    const result = await submitRatings(undefined, form({ [HUGO]: "8" }));

    expect(result?.error).toBeUndefined();
    expect(state.inserted).toEqual([
      { matchId: MATCH, raterMemberId: PIERRE, ratedMemberId: HUGO, score: 8 },
    ]);
  });

  it("accepts a starter's notes, minus himself", async () => {
    state.actor = actorFor(HUGO);
    const result = await submitRatings(undefined, form({ [HUGO]: "10", [KARIM]: "6" }));

    expect(result?.error).toBeUndefined();
    expect(state.inserted).toEqual([
      { matchId: MATCH, raterMemberId: HUGO, ratedMemberId: KARIM, score: 6 },
    ]);
  });
});

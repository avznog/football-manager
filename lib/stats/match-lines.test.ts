import { describe, expect, it } from "vitest";

import type { MatchPlayerStats } from "@/db/schema";
import type { SlotInfo } from "@/lib/match/lineup";
import type { MatchEventRecord } from "@/lib/match/reducer";

import {
  type CachedStatRow,
  type MatchLogInput,
  type MatchStatLine,
  linesFromCache,
  linesFromLog,
  matchesNeedingReduction,
  resolveMatchStatLines,
} from "./match-lines";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const MIN = 60_000;
const T0 = Date.UTC(2026, 8, 6, 8, 30, 0);

const SLOT = {
  gb: "s-gb",
  dg: "s-dg",
  dc: "s-dc",
  dd: "s-dd",
  mc1: "s-mc1",
  mc2: "s-mc2",
  at: "s-at",
} as const;

const SLOTS: SlotInfo[] = [
  { id: SLOT.gb, positionCode: "GB", sort: 1 },
  { id: SLOT.dg, positionCode: "DG", sort: 2 },
  { id: SLOT.dc, positionCode: "DC", sort: 3 },
  { id: SLOT.dd, positionCode: "DD", sort: 4 },
  { id: SLOT.mc1, positionCode: "MC", sort: 5 },
  { id: SLOT.mc2, positionCode: "MC", sort: 6 },
  { id: SLOT.at, positionCode: "AT", sort: 7 },
];

const SQUAD = [
  { teamMemberId: "hugo", role: "starter" as const },
  { teamMemberId: "samir", role: "starter" as const },
  { teamMemberId: "thomas", role: "starter" as const },
  { teamMemberId: "nico", role: "starter" as const },
  { teamMemberId: "leo", role: "starter" as const },
  { teamMemberId: "karim", role: "starter" as const },
  { teamMemberId: "julien", role: "starter" as const },
  { teamMemberId: "momo", role: "substitute" as const },
  { teamMemberId: "yanis", role: "substitute" as const },
  { teamMemberId: "gerard", role: "supporter" as const },
];

type Fixture = { type: MatchEventRecord["type"]; min: number; payload?: unknown; voids?: number };

/** A log shaped the way Postgres holds one, built by hand: nothing here is generated. */
function log(fixtures: Fixture[]): MatchEventRecord[] {
  return fixtures.map((fixture, index) => ({
    id: `e${index + 1}`,
    clientEventId: `c${index + 1}`,
    type: fixture.type,
    period: fixture.min < 30 ? 1 : 2,
    minute: fixture.min,
    clockMs: fixture.min * MIN,
    occurredAt: new Date(T0 + fixture.min * MIN),
    payload: fixture.payload ?? {},
    voidsEventId: fixture.voids === undefined ? null : `e${fixture.voids}`,
    seq: index + 1,
  }));
}

const STARTING_SEVEN = {
  [SLOT.gb]: "hugo",
  [SLOT.dg]: "samir",
  [SLOT.dc]: "thomas",
  [SLOT.dd]: "nico",
  [SLOT.mc1]: "leo",
  [SLOT.mc2]: "karim",
  [SLOT.at]: "julien",
};

const lineupPayload = (pairs: Record<string, string>) => ({
  lineupId: "l-initial",
  slots: Object.entries(pairs).map(([slotId, memberId]) => ({ slotId, memberId })),
});

/**
 * A 2×30 with a bit of everything the aggregates care about: a goal with a scorer, a goal with
 * **no** scorer (decision 017), a penalty, an own goal, a foul, a substitution and a voided goal.
 */
const MATCH_LOG: MatchLogInput = {
  events: log([
    { type: "KICKOFF", min: 0 },
    { type: "LINEUP_APPLIED", min: 0, payload: lineupPayload(STARTING_SEVEN) },
    { type: "GOAL_FOR", min: 11, payload: { scorerId: "julien", assistId: "karim" } },
    { type: "FOUL", min: 19, payload: { memberId: "thomas" } },
    { type: "GOAL_AGAINST", min: 24 },
    { type: "GOAL_FOR", min: 27, payload: { scorerId: "leo" } },
    { type: "VOID", min: 27, voids: 6 },
    // An opponent put it in his own net: our goal, nobody credited (decision 017).
    { type: "GOAL_FOR", min: 28 },
    { type: "PERIOD_END", min: 30 },
    { type: "KICKOFF", min: 30 },
    { type: "SUBSTITUTION", min: 38, payload: { outId: "leo", inId: "yanis", slotId: SLOT.mc1 } },
    { type: "PENALTY_SCORED", min: 44, payload: { scorerId: "julien" } },
    { type: "OWN_GOAL", min: 51, payload: { scorerId: "nico" } },
    { type: "PENALTY_MISSED", min: 58, payload: { scorerId: "yanis" } },
    { type: "PERIOD_END", min: 60 },
    { type: "FINAL_WHISTLE", min: 60 },
  ]),
  squad: SQUAD,
  slots: SLOTS,
  periodsCount: 2,
  periodMinutes: 30,
};

/** A keeper replaced at half time in a match we then concede in — decision 018's own example. */
const KEEPER_SWAP_LOG: MatchLogInput = {
  events: log([
    { type: "KICKOFF", min: 0 },
    { type: "LINEUP_APPLIED", min: 0, payload: lineupPayload(STARTING_SEVEN) },
    { type: "PERIOD_END", min: 30 },
    { type: "KICKOFF", min: 30 },
    // Hugo comes off for Momo, who takes the gloves.
    { type: "SUBSTITUTION", min: 30, payload: { outId: "hugo", inId: "momo", slotId: SLOT.gb } },
    { type: "GOAL_AGAINST", min: 40 },
    { type: "PERIOD_END", min: 60 },
    { type: "FINAL_WHISTLE", min: 60 },
  ]),
  squad: SQUAD,
  slots: SLOTS,
  periodsCount: 2,
  periodMinutes: 30,
};

/** What M4 writes at the final whistle: `toMatchPlayerStats`, column for column. */
function freeze(lines: readonly MatchStatLine[]): CachedStatRow[] {
  return lines.map((line) => ({ ...line }));
}

/* -------------------------------------------------------------------------- */

describe("the two paths agree", () => {
  it("reads back from the cache exactly what the reduction produced", () => {
    const reduced = linesFromLog("m1", MATCH_LOG);
    // This is the whole contract between M5 and M4: freeze the reduction, read it back, get the
    // same lines. If it ever fails, the freezing writes something the reducer did not compute.
    expect(linesFromCache(freeze(reduced))).toEqual(reduced);
  });

  it("produces a line whose fields are the columns of match_player_stats", () => {
    const [line] = linesFromLog("m1", MATCH_LOG);
    const columns: Array<keyof MatchPlayerStats> = [
      "matchId",
      "teamMemberId",
      "minutes",
      "goals",
      "assists",
      "ownGoals",
      "penaltiesScored",
      "penaltiesMissed",
      "fouls",
      "gkMinutes",
      "cleanMinutes",
      "concededWhileOn",
      "gkCleanMinutes",
      "concededWhileGk",
      "squadRole",
    ];
    // `computedAt` is the only column of the table that is not a statistic, so a line has every
    // other one and nothing else. A drift here means the cache cannot hold a line any more.
    expect(Object.keys(line).sort()).toEqual([...columns].sort());
  });
});

describe("linesFromLog", () => {
  it("credits the scorer, the assist and the penalty, and nobody for a goal with no scorer", () => {
    const lines = linesFromLog("m1", MATCH_LOG);
    const of = (id: string) => lines.find((line) => line.teamMemberId === id)!;

    // Julien: one goal from open play plus one penalty, which counts in both (reducer rule 5).
    expect(of("julien").goals).toBe(2);
    expect(of("julien").penaltiesScored).toBe(1);
    expect(of("karim").assists).toBe(1);
    // The voided goal at 27′ never happened, and the 28′ goal belongs to nobody.
    expect(of("leo").goals).toBe(0);
    expect(lines.reduce((total, line) => total + line.goals, 0)).toBe(2);
    expect(of("nico").ownGoals).toBe(1);
    expect(of("thomas").fouls).toBe(1);
    expect(of("yanis").penaltiesMissed).toBe(1);
  });

  it("gives the supporter a line with a role and no minutes", () => {
    const gerard = linesFromLog("m1", MATCH_LOG).find((line) => line.teamMemberId === "gerard")!;
    expect(gerard.squadRole).toBe("supporter");
    expect(gerard.minutes).toBe(0);
    expect(gerard.goals).toBe(0);
  });

  it("splits a keeper replaced at half time into one clean half each", () => {
    const lines = linesFromLog("m2", KEEPER_SWAP_LOG);
    const hugo = lines.find((line) => line.teamMemberId === "hugo")!;
    const momo = lines.find((line) => line.teamMemberId === "momo")!;

    // Hugo kept the first half clean and left before the goal: a clean sheet for him.
    expect(hugo.gkMinutes).toBe(30);
    expect(hugo.gkCleanMinutes).toBe(30);
    expect(hugo.concededWhileGk).toBe(0);

    // Momo conceded on his watch: the same match, no clean sheet, and only ten clean minutes.
    expect(momo.gkMinutes).toBe(30);
    expect(momo.gkCleanMinutes).toBe(10);
    expect(momo.concededWhileGk).toBe(1);
  });

  it("returns nothing but the squad's empty lines for an empty log", () => {
    const lines = linesFromLog("m3", { events: [], squad: SQUAD, slots: SLOTS });
    expect(lines).toHaveLength(SQUAD.length);
    expect(lines.every((line) => line.minutes === 0)).toBe(true);
  });
});

describe("matchesNeedingReduction", () => {
  it("asks for a log only when the cache holds no row for the match", () => {
    const cached = freeze(linesFromLog("m1", MATCH_LOG));
    expect(matchesNeedingReduction(["m1", "m2"], cached)).toEqual(["m2"]);
    expect(matchesNeedingReduction(["m1"], cached)).toEqual([]);
  });

  it("treats a single row as proof the whole match is cached", () => {
    const cached = freeze(linesFromLog("m1", MATCH_LOG)).slice(0, 1);
    expect(matchesNeedingReduction(["m1"], cached)).toEqual([]);
  });
});

describe("resolveMatchStatLines", () => {
  it("never replays a log for a cached match", () => {
    const cached = freeze(linesFromLog("m1", MATCH_LOG));
    const logs = new Map<string, MatchLogInput>([["m1", MATCH_LOG]]);

    const resolved = resolveMatchStatLines({ matchIds: ["m1"], cached, logs });

    expect(resolved.reducedMatchIds).toEqual([]);
    expect(resolved.lines).toEqual(linesFromCache(cached));
  });

  it("mixes a cached match and a replayed one without counting either twice", () => {
    const cached = freeze(linesFromLog("m1", MATCH_LOG));
    const logs = new Map<string, MatchLogInput>([["m2", KEEPER_SWAP_LOG]]);

    const resolved = resolveMatchStatLines({ matchIds: ["m1", "m2"], cached, logs });

    expect(resolved.reducedMatchIds).toEqual(["m2"]);
    expect(resolved.lines.filter((line) => line.matchId === "m1")).toHaveLength(cached.length);
    const hugo = resolved.lines.filter((line) => line.teamMemberId === "hugo");
    expect(hugo).toHaveLength(2);
    expect(hugo.map((line) => line.matchId)).toEqual(["m1", "m2"]);
  });

  it("ignores a cached row for a match outside the filter", () => {
    const cached = [
      ...freeze(linesFromLog("m1", MATCH_LOG)),
      ...freeze(linesFromLog("other", MATCH_LOG)),
    ];

    const resolved = resolveMatchStatLines({ matchIds: ["m1"], cached });

    expect(new Set(resolved.lines.map((line) => line.matchId))).toEqual(new Set(["m1"]));
  });

  it("reports a match with neither a cache nor a log instead of inventing zeros", () => {
    const resolved = resolveMatchStatLines({ matchIds: ["m9"], cached: [], logs: new Map() });

    expect(resolved.lines).toEqual([]);
    expect(resolved.emptyMatchIds).toEqual(["m9"]);
  });
});

import { describe, expect, it } from "vitest";

import { matchEventBatchSchema } from "@/lib/match/events";
import type { SlotInfo } from "@/lib/match/lineup";
import { playerState, reduceMatch } from "@/lib/match/reducer";

import { type RetroEntry, buildRetroLog, retroEventRecords } from "./log";
import { buildAmendment, isAmendableEventType } from "./amend";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const uuid = (prefix: string, n: number) =>
  `00000000-0000-4000-8000-${prefix}${String(n).padStart(9, "0")}`;

const P = Object.fromEntries(
  ["gk", "dg", "dc", "dd", "mcl", "mcr", "at", "sub1"].map((key, index) => [
    key,
    uuid("aaa", index + 1),
  ]),
) as Record<"gk" | "dg" | "dc" | "dd" | "mcl" | "mcr" | "at" | "sub1", string>;

const SLOTS: readonly SlotInfo[] = [
  { id: uuid("bbb", 1), positionCode: "GB", sort: 1 },
  { id: uuid("bbb", 2), positionCode: "DG", sort: 2 },
  { id: uuid("bbb", 3), positionCode: "DC", sort: 3 },
  { id: uuid("bbb", 4), positionCode: "DD", sort: 4 },
  { id: uuid("bbb", 5), positionCode: "MC", sort: 5 },
  { id: uuid("bbb", 6), positionCode: "MC", sort: 6 },
  { id: uuid("bbb", 7), positionCode: "AT", sort: 7 },
];

const PERIODS = { periodsCount: 2, periodMinutes: 30 } as const;
const KICKOFF_AT_MS = Date.UTC(2026, 8, 12, 17, 0, 0);
const MINUTE = 60_000;
const FINAL_WHISTLE_MS = 60 * MINUTE;
const SUBMISSION = "77777777-8888-4999-8aaa-bbbbbbbbbbbb";

const BASE: RetroEntry = {
  submissionId: "11111111-2222-4333-8444-555555555555",
  periods: PERIODS,
  kickoffAtMs: KICKOFF_AT_MS,
  lineupId: null,
  starters: SLOTS.map((slot, index) => ({
    slotId: slot.id,
    memberId: [P.gk, P.dg, P.dc, P.dd, P.mcl, P.mcr, P.at][index],
  })),
  // The match as it was first entered: Karim (the striker) credited with the 27th-minute goal.
  actions: [{ key: "f1", type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 27 }],
};

/**
 * The finished match, as it sits in the database — with an id per event, the way
 * `match_events` rows come back.
 */
function storedMatch(entry: RetroEntry = BASE) {
  const events = buildRetroLog(entry).events.map((event, index) => ({
    ...event,
    id: uuid("ddd", index + 1),
    seq: index + 1,
  }));
  return events;
}

function reduce(events: readonly ReturnType<typeof storedMatch>[number][]) {
  return reduceMatch(
    events.map((event) => ({ ...retroEventRecords([event])[0], id: event.id, seq: event.seq })),
    [],
    { ...PERIODS, slots: SLOTS },
  );
}

/* -------------------------------------------------------------------------- */
/* « Ce but, ce n'était pas Karim, c'était Momo »                             */
/* -------------------------------------------------------------------------- */

describe("buildAmendment", () => {
  it("corrects a scorer by annulling and re-appending, never by rewriting", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: { type: "GOAL_FOR", memberId: P.mcl, assistId: null, minute: null },
    });

    // Annulment first, replacement second: the timeline reads as a correction, not a duplicate.
    expect(amendment.events.map((event) => event.type)).toEqual(["VOID", "GOAL_FOR"]);
    expect(amendment.events[0].voidsEventId).toBe(goal.id);
    expect(amendment.events[1].voidsEventId).toBeNull();
    expect(amendment.events[1].payload).toMatchObject({ scorerId: P.mcl });

    // Invariant 1: nothing in the amendment touches the event it replaces.
    expect(amendment.events.some((event) => "id" in event)).toBe(false);

    const state = reduce([
      ...stored,
      ...amendment.events.map((event, index) => ({
        ...event,
        id: uuid("eee", index + 1),
        seq: stored.length + index + 1,
      })),
    ]);

    // The score is unchanged — one goal, still one goal — but the credit has moved.
    expect(state.scoreLabel).toBe("1 – 0");
    expect(playerState(state, P.at)?.goals).toBe(0);
    expect(playerState(state, P.mcl)?.goals).toBe(1);
    expect(state.anomalies).toEqual([]);
  });

  it("keeps the annulled event's minute when the coach only changes the name", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: { type: "GOAL_FOR", memberId: P.mcl, assistId: null, minute: null },
    });

    // 27′, not "now" — stamping the correction at the instant it was typed would put it after the
    // final whistle, which is an anomaly and would wreck the clean-sheet minutes.
    for (const event of amendment.events) {
      expect(event.minute).toBe(27);
      expect(event.clockMs).toBe(27 * MINUTE);
      expect(event.period).toBe(1);
      expect(event.occurredAt.getTime()).toBe(KICKOFF_AT_MS + 27 * MINUTE);
    }
  });

  it("moves the event when the minute is what was wrong", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: { type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 52 },
    });

    expect(amendment.events[0].minute).toBe(27); // the VOID stays beside its target
    expect(amendment.events[1].minute).toBe(52);
    expect(amendment.events[1].period).toBe(2); // continuous minutes, decision 009
  });

  it("clamps a minute past the final whistle instead of producing an anomaly", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      // This match ran three minutes over: the whistle in the log is what counts, not regulation.
      finalWhistleMs: 63 * MINUTE,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: { type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 90 },
    });

    expect(amendment.events[1].minute).toBe(63);
  });

  it("annuls without replacing when the goal simply never happened", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: null,
    });

    expect(amendment.events.map((event) => event.type)).toEqual(["VOID"]);

    const state = reduce([
      ...stored,
      { ...amendment.events[0], id: uuid("eee", 1), seq: stored.length + 1 },
    ]);

    expect(state.scoreLabel).toBe("0 – 0");
    expect(state.result).toBe("draw");
    expect(playerState(state, P.at)?.goals).toBe(0);
    expect(state.anomalies).toEqual([]);
  });

  it("appends a forgotten event with no annulment at all", () => {
    const stored = storedMatch();

    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: null,
      fact: { type: "GOAL_AGAINST", memberId: null, assistId: null, minute: 41 },
    });

    expect(amendment.events.map((event) => event.type)).toEqual(["GOAL_AGAINST"]);
    expect(amendment.events[0].voidsEventId).toBeNull();

    const state = reduce([
      ...stored,
      { ...amendment.events[0], id: uuid("eee", 1), seq: stored.length + 1 },
    ]);

    expect(state.scoreLabel).toBe("1 – 1");
    // The keeper's clean sheet is recomputed, not patched: that is invariant 2 doing its job.
    expect(playerState(state, P.gk)?.gkCleanMinutes).toBe(41);
    expect(state.anomalies).toEqual([]);
  });

  it("puts a forgotten, undatable event at the middle of the match", () => {
    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: null,
      fact: { type: "GOAL_AGAINST", memberId: null, assistId: null, minute: null },
    });

    expect(amendment.events[0].minute).toBe(30);
  });

  it("produces a batch the ingestion boundary accepts, and the same ids on a double tap", () => {
    const stored = storedMatch();
    const goal = stored.find((event) => event.type === "GOAL_FOR")!;
    const input = {
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: FINAL_WHISTLE_MS,
      target: { eventId: goal.id, type: goal.type, period: goal.period, clockMs: goal.clockMs },
      fact: { type: "GOAL_FOR" as const, memberId: P.mcl, assistId: null, minute: null },
    };

    const first = buildAmendment(input);
    const second = buildAmendment(input);

    expect(
      matchEventBatchSchema.safeParse({ matchId: uuid("ccc", 1), events: first.events }).success,
    ).toBe(true);
    // Invariant 6: the second tap on « Enregistrer » corrects the goal once, not twice.
    expect(second.events.map((event) => event.clientEventId)).toEqual(
      first.events.map((event) => event.clientEventId),
    );
  });

  it("falls back to regulation when the log has no whistle yet", () => {
    const amendment = buildAmendment({
      submissionId: SUBMISSION,
      periods: PERIODS,
      kickoffAtMs: KICKOFF_AT_MS,
      finalWhistleMs: 0,
      target: null,
      fact: { type: "GOAL_FOR", memberId: P.at, assistId: null, minute: 200 },
    });

    expect(amendment.events[0].minute).toBe(60);
  });

  it("does nothing when asked for nothing", () => {
    expect(
      buildAmendment({
        submissionId: SUBMISSION,
        periods: PERIODS,
        kickoffAtMs: KICKOFF_AT_MS,
        finalWhistleMs: FINAL_WHISTLE_MS,
        target: null,
        fact: null,
      }).events,
    ).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* What may be corrected at all                                               */
/* -------------------------------------------------------------------------- */

describe("isAmendableEventType", () => {
  it("accepts the football facts and the substitutions", () => {
    for (const type of [
      "GOAL_FOR",
      "GOAL_AGAINST",
      "PENALTY_SCORED",
      "PENALTY_MISSED",
      "OWN_GOAL",
      "FOUL",
      "INJURY",
      "SUBSTITUTION",
    ] as const) {
      expect(isAmendableEventType(type), type).toBe(true);
    }
  });

  it("refuses the frame of the match, which is what gives every minute its meaning", () => {
    // Annulling one of these does not correct a mistake; it changes what the whole log says.
    for (const type of [
      "KICKOFF",
      "PERIOD_END",
      "FINAL_WHISTLE",
      "LINEUP_APPLIED",
      "POSITION_CHANGE",
      "PAUSE",
      "RESUME",
      "VOID",
    ] as const) {
      expect(isAmendableEventType(type), type).toBe(false);
    }
  });
});

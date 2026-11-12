import { describe, expect, it } from "vitest";

import { MS_PER_MINUTE as MIN, periodsConfig } from "@/lib/match/clock";
import type { MatchEventType } from "@/lib/match/events";
import { reduceMatch, type MatchEventRecord } from "@/lib/match/reducer";

import { frameMoveFor, withFrameMove, type FrameEvent } from "./frame";

const TWO_THIRTY = periodsConfig({ periodsCount: 2, periodMinutes: 30 });
const T0 = Date.UTC(2026, 10, 10, 20, 5);

type Spec = { type: MatchEventType; period: number; at: number; payload?: unknown; voids?: string };

/** A log from `[type, period, clock in ms]`, ids `e0`, `e1`… in the order given (that order is `seq`). */
function log(specs: Spec[]): FrameEvent[] {
  return specs.map((spec, index) => ({
    id: `e${index}`,
    type: spec.type,
    period: spec.period,
    clockMs: spec.at,
    occurredAt: new Date(T0 + spec.at),
    payload: spec.payload ?? {},
    voidsEventId: spec.voids ?? null,
    seq: index,
  }));
}

/** The log once the action and the frame move are appended, as the reducer will read it. */
function applied(events: FrameEvent[], action: Spec, drafts: ReturnType<typeof frameMoveFor>["drafts"]) {
  const base = events.length;
  const extra: FrameEvent[] = [
    {
      id: "action",
      type: action.type,
      period: action.period,
      clockMs: action.at,
      occurredAt: new Date(T0 + action.at),
      payload: action.payload ?? {},
      voidsEventId: null,
      seq: base,
    },
    ...drafts.map((draft, index) => ({
      id: `m${index}`,
      type: draft.type,
      period: draft.period,
      clockMs: draft.clockMs,
      occurredAt: draft.occurredAt,
      payload: draft.payload,
      voidsEventId: draft.voidsEventId,
      seq: base + 1 + index,
    })),
  ];
  return [...events, ...extra];
}

const records = (events: FrameEvent[]): MatchEventRecord[] =>
  events.map((event) => ({
    id: event.id,
    clientEventId: event.id,
    type: event.type,
    period: event.period,
    minute: Math.floor(event.clockMs / MIN),
    clockMs: event.clockMs,
    occurredAt: event.occurredAt,
    payload: event.payload,
    voidsEventId: event.voidsEventId,
    seq: event.seq,
  }));

const reduce = (events: FrameEvent[]) => reduceMatch(records(events), [], TWO_THIRTY);

/** The active clock of each frame event, by type and period, as the reducer will replay it. */
function frameOf(events: FrameEvent[]) {
  const state = reduce(events);
  return state.timeline
    .filter((line) => !line.voided && ["KICKOFF", "PERIOD_END", "FINAL_WHISTLE"].includes(line.type))
    .map((line) => `${line.type}:${line.period}@${line.clockMs / 1000}`);
}

const FRAME_ANOMALIES = ["kickoff-while-in-play", "period-end-while-stopped", "event-after-final-whistle"];

describe("moving a whistle so that a late correction lands inside the football (decision 224)", () => {
  /** The owner's real match of 2026-11-10: tapped through game mode, whistles at 0′02″ and 30′02″. */
  const TAPPED_THROUGH = log([
    { type: "KICKOFF", period: 1, at: 0 },
    { type: "PERIOD_END", period: 1, at: 2_319 },
    { type: "KICKOFF", period: 2, at: 30 * MIN },
    { type: "PERIOD_END", period: 2, at: 30 * MIN + 2_473 },
    { type: "FINAL_WHISTLE", period: 2, at: 30 * MIN + 2_473 },
  ]);

  it("ends the first half at its normal end when a goal is added at 6′ after a 0′02″ whistle", () => {
    const goal: Spec = { type: "GOAL_FOR", period: 1, at: 6 * MIN };
    const move = frameMoveFor({ events: TAPPED_THROUGH, periods: TWO_THIRTY, placed: { clockMs: goal.at, period: 1 } });

    expect(move.extended).toEqual({ period: 1, fromMs: 2_319, toMs: 30 * MIN });
    expect(move.shiftMs).toBe(0);

    const after = applied(TAPPED_THROUGH, goal, move.drafts);
    expect(frameOf(after)).toEqual([
      "KICKOFF:1@0",
      "PERIOD_END:1@1800",
      "KICKOFF:2@1800",
      "PERIOD_END:2@1802.473",
      "FINAL_WHISTLE:2@1802.473",
    ]);
    // The new whistle at 30′00″ replays before the kick-off that shares its clock, so no anomaly.
    expect(reduce(after).anomalies.filter((a) => FRAME_ANOMALIES.includes(a.code))).toEqual([]);
  });

  it("ends the first half at 30+2 and moves the whole second half by two minutes, labels intact", () => {
    const onTime = log([
      { type: "KICKOFF", period: 1, at: 0 },
      { type: "PERIOD_END", period: 1, at: 30 * MIN },
      { type: "KICKOFF", period: 2, at: 30 * MIN },
      { type: "GOAL_FOR", period: 2, at: 50 * MIN },
      { type: "PERIOD_END", period: 2, at: 60 * MIN },
      { type: "FINAL_WHISTLE", period: 2, at: 60 * MIN },
    ]);
    const labelsBefore = reduce(onTime).timeline.map((line) => line.minuteLabel);

    const goal: Spec = { type: "GOAL_FOR", period: 1, at: 32 * MIN };
    const move = frameMoveFor({ events: onTime, periods: TWO_THIRTY, placed: { clockMs: goal.at, period: 1 } });
    expect(move.extended).toEqual({ period: 1, fromMs: 30 * MIN, toMs: 32 * MIN });
    expect(move.shiftMs).toBe(2 * MIN);

    const after = applied(onTime, goal, move.drafts);
    expect(frameOf(after)).toEqual([
      "KICKOFF:1@0",
      "PERIOD_END:1@1920",
      "KICKOFF:2@1920",
      "PERIOD_END:2@3720",
      "FINAL_WHISTLE:2@3720",
    ]);

    const state = reduce(after);
    // The second-half goal moved to 52′ of football and still reads 50′ on the television.
    const secondHalfGoal = state.timeline.find((line) => line.type === "GOAL_FOR" && line.period === 2 && !line.voided)!;
    expect(secondHalfGoal.clockMs).toBe(52 * MIN);
    expect(secondHalfGoal.minuteLabel).toBe("50’");
    // The new goal reads « 30’+2 », and so does the whistle it moved — the one label that is meant
    // to change. Every other surviving line keeps the label it had.
    expect(state.timeline.find((line) => line.eventId === "action")!.minuteLabel).toBe("30’+2");
    const surviving = state.timeline.filter(
      (line) => !line.voided && line.type !== "VOID" && line.eventId !== "action",
    );
    expect(surviving.map((line) => line.minuteLabel)).toEqual(
      labelsBefore.map((label, index) => (index === 1 ? "30’+2" : label)),
    );
    expect(surviving[1].type).toBe("PERIOD_END");
    expect(state.anomalies.filter((a) => FRAME_ANOMALIES.includes(a.code))).toEqual([]);
  });

  it("moves the final whistle with the last period, for a change typed after it", () => {
    const change: Spec = { type: "LINEUP_APPLIED", period: 2, at: 50 * MIN, payload: { slots: [] } };
    const move = frameMoveFor({ events: TAPPED_THROUGH, periods: TWO_THIRTY, placed: { clockMs: change.at, period: 2 } });

    // The second half kicked off at 30′00″, so its normal end is 60′00″, later than the 50′.
    expect(move.extended).toEqual({ period: 2, fromMs: 30 * MIN + 2_473, toMs: 60 * MIN });
    const after = applied(TAPPED_THROUGH, change, move.drafts);
    expect(frameOf(after)).toEqual([
      "KICKOFF:1@0",
      "PERIOD_END:1@2.319",
      "KICKOFF:2@1800",
      "PERIOD_END:2@3600",
      "FINAL_WHISTLE:2@3600",
    ]);
    expect(reduce(after).anomalies.filter((a) => a.code === "event-after-final-whistle")).toEqual([]);
  });

  it("moves nothing for an action inside its period", () => {
    const normal = log([
      { type: "KICKOFF", period: 1, at: 0 },
      { type: "PERIOD_END", period: 1, at: 30 * MIN },
      { type: "KICKOFF", period: 2, at: 30 * MIN },
      { type: "PERIOD_END", period: 2, at: 60 * MIN },
      { type: "FINAL_WHISTLE", period: 2, at: 60 * MIN },
    ]);
    for (const [clockMs, period] of [[12 * MIN, 1], [30 * MIN, 1], [45 * MIN, 2], [60 * MIN, 2]]) {
      expect(frameMoveFor({ events: normal, periods: TWO_THIRTY, placed: { clockMs, period } })).toEqual({
        extended: null,
        shiftMs: 0,
        drafts: [],
      });
    }
  });

  it("closes the gap between a first half whistled at 20′ and a kick-off at 30′", () => {
    const earlyWhistle = log([
      { type: "KICKOFF", period: 1, at: 0 },
      { type: "PERIOD_END", period: 1, at: 20 * MIN },
      { type: "KICKOFF", period: 2, at: 30 * MIN },
      { type: "PERIOD_END", period: 2, at: 60 * MIN },
      { type: "FINAL_WHISTLE", period: 2, at: 60 * MIN },
    ]);
    const goal: Spec = { type: "GOAL_FOR", period: 1, at: 25 * MIN };
    const move = frameMoveFor({ events: earlyWhistle, periods: TWO_THIRTY, placed: { clockMs: goal.at, period: 1 } });
    // The normal end, not the goal's 25′: the owner's « to the normal end, or later ».
    expect(move.extended?.toMs).toBe(30 * MIN);
    expect(move.shiftMs).toBe(0);
    // Only the kick-off sharing the new whistle's clock is re-appended, to replay after it.
    expect(move.drafts.filter((draft) => draft.copyOf).map((draft) => draft.type)).toEqual([
      "PERIOD_END",
      "KICKOFF",
    ]);
    const state = reduce(applied(earlyWhistle, goal, move.drafts));
    expect(state.anomalies.filter((a) => FRAME_ANOMALIES.includes(a.code))).toEqual([]);
  });

  it("takes along a half-time composition stamped on the old whistle, and a stranded action", () => {
    const halfTime = log([
      { type: "KICKOFF", period: 1, at: 0 },
      { type: "GOAL_FOR", period: 1, at: 31 * MIN }, // stranded: typed before this fix, after the whistle
      { type: "PERIOD_END", period: 1, at: 30 * MIN },
      { type: "LINEUP_APPLIED", period: 1, at: 30 * MIN, payload: { slots: [] } },
      { type: "KICKOFF", period: 2, at: 30 * MIN },
      { type: "PERIOD_END", period: 2, at: 60 * MIN },
      { type: "FINAL_WHISTLE", period: 2, at: 60 * MIN },
    ]).sort((a, b) => a.seq - b.seq);
    // Make the stranded goal sort after the whistle, as it would have been appended later.
    halfTime[1] = { ...halfTime[1], seq: 10 };

    const move = frameMoveFor({ events: halfTime, periods: TWO_THIRTY, placed: { clockMs: 30 * MIN + 30_000, period: 1 } });
    // The stranded goal at 31′ is later than the new action, so it sets the whistle.
    expect(move.extended?.toMs).toBe(31 * MIN);
    const movedComposition = move.drafts.find((draft) => draft.copyOf === "e3")!;
    expect(movedComposition.clockMs).toBe(31 * MIN);
    expect(movedComposition.type).toBe("LINEUP_APPLIED");
    expect(move.shiftMs).toBe(MIN);
  });

  it("is idempotent: the same input gives the same batch, and the moved log needs no second move", () => {
    const goal: Spec = { type: "GOAL_FOR", period: 1, at: 6 * MIN };
    const amendment = {
      events: [
        {
          clientEventId: "c0",
          type: "GOAL_FOR" as const,
          period: 1,
          minute: 6,
          clockMs: goal.at,
          occurredAt: new Date(T0 + goal.at),
          payload: {},
          voidsEventId: null,
        },
      ],
    };
    const input = { submissionId: "11111111-2222-4333-8444-555555555555", events: TAPPED_THROUGH, periods: TWO_THIRTY };
    const first = withFrameMove(amendment, input);
    const second = withFrameMove(amendment, input);
    expect(second.events).toEqual(first.events);
    expect(new Set(first.events.map((event) => event.clientEventId)).size).toBe(first.events.length);

    const after = applied(TAPPED_THROUGH, goal, frameMoveFor({ events: TAPPED_THROUGH, periods: TWO_THIRTY, placed: { clockMs: goal.at, period: 1 } }).drafts);
    expect(frameMoveFor({ events: after, periods: TWO_THIRTY, placed: { clockMs: goal.at, period: 1 } }).drafts).toEqual([]);
  });

  it("leaves an annulment alone, and never moves the line being corrected", () => {
    const voidOnly = { events: [{ clientEventId: "c0", type: "VOID" as const, period: 1, minute: 0, clockMs: 0, occurredAt: new Date(T0), payload: {}, voidsEventId: "e1" }] };
    expect(withFrameMove(voidOnly, { submissionId: "11111111-2222-4333-8444-555555555555", events: TAPPED_THROUGH, periods: TWO_THIRTY }).events).toHaveLength(1);

    const withGoal = log([
      { type: "KICKOFF", period: 1, at: 0 },
      { type: "PERIOD_END", period: 1, at: 30 * MIN },
      { type: "KICKOFF", period: 2, at: 30 * MIN },
      { type: "GOAL_FOR", period: 2, at: 40 * MIN },
      { type: "PERIOD_END", period: 2, at: 60 * MIN },
      { type: "FINAL_WHISTLE", period: 2, at: 60 * MIN },
    ]);
    const move = frameMoveFor({
      events: withGoal,
      periods: TWO_THIRTY,
      placed: { clockMs: 32 * MIN, period: 1 },
      excludeIds: new Set(["e3"]),
    });
    expect(move.drafts.some((draft) => draft.voidsEventId === "e3" || draft.copyOf === "e3")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { matchEventBatchSchema, matchEventInputSchema, type MatchEventInput } from "./events";
import {
  batchEffects,
  prepareEventBatch,
  resolveStoredEvents,
  voidsStartingLineup,
  type PreparedEvent,
} from "./ingest";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const uuid = () => crypto.randomUUID();

/** Payloads the strict schema demands, so the fixtures read as short as the events they stand for. */
const foul = () => ({ memberId: uuid() });
const sub = () => ({ outId: uuid(), inId: uuid() });

/**
 * Events are built through `matchEventInputSchema` on purpose: what the pure preparation sees is
 * exactly what the API route hands it, coercions included, so the test cannot drift from the wire.
 */
function input(
  type: MatchEventInput["type"],
  minute: number,
  extra: Partial<MatchEventInput> = {},
): MatchEventInput {
  return matchEventInputSchema.parse({
    clientEventId: uuid(),
    type,
    period: minute <= 30 ? 1 : 2,
    minute,
    clockMs: minute * 60_000,
    occurredAt: new Date(Date.UTC(2026, 2, 14, 9, minute)).toISOString(),
    ...extra,
  });
}

/** What the database gives back after inserting a prepared batch. */
function store(prepared: readonly PreparedEvent[]): Map<string, { id: string; seq: number }> {
  return new Map(prepared.map((event) => [event.clientEventId, { id: uuid(), seq: event.seq }]));
}

/* -------------------------------------------------------------------------- */
/* Sequencing                                                                 */
/* -------------------------------------------------------------------------- */

describe("prepareEventBatch", () => {
  it("assigns consecutive seq values from where the log stopped", () => {
    const events = [
      input("KICKOFF", 0),
      input("GOAL_FOR", 12),
      input("FOUL", 20, { payload: foul() }),
    ];

    const { toInsert, duplicates } = prepareEventBatch(events, {
      storedClientEventIds: [],
      nextSeq: 7,
    });

    expect(duplicates).toEqual([]);
    expect(toInsert.map((event) => event.seq)).toEqual([7, 8, 9]);
    expect(toInsert.map((event) => event.type)).toEqual(["KICKOFF", "GOAL_FOR", "FOUL"]);
  });

  it("keeps the device's order even when clock_ms would sort differently", () => {
    // The coach logs the 55′ substitution, then remembers the foul that happened at 54′.
    // `seq` follows the taps; `compareMatchEvents` is what re-sorts the log for replay.
    const events = [
      input("SUBSTITUTION", 55, { payload: sub() }),
      input("FOUL", 54, { payload: foul() }),
    ];

    const { toInsert } = prepareEventBatch(events, { storedClientEventIds: [], nextSeq: 0 });

    expect(toInsert.map((event) => [event.type, event.seq])).toEqual([
      ["SUBSTITUTION", 0],
      ["FOUL", 1],
    ]);
  });

  it("carries the device timestamps through untouched", () => {
    const event = input("GOAL_FOR", 23);

    const { toInsert } = prepareEventBatch([event], { storedClientEventIds: [], nextSeq: 0 });

    expect(toInsert[0].occurredAt.getTime()).toBe(event.occurredAt.getTime());
    expect(toInsert[0].clockMs).toBe(23 * 60_000);
    expect(toInsert[0].minute).toBe(23);
  });
});

/* -------------------------------------------------------------------------- */
/* Invariant 6 — idempotency on client_event_id                               */
/* -------------------------------------------------------------------------- */

describe("idempotency (invariant 6)", () => {
  it("inserts nothing the second time the same batch arrives", () => {
    const events = [input("KICKOFF", 0), input("GOAL_FOR", 12)];

    const first = prepareEventBatch(events, { storedClientEventIds: [], nextSeq: 0 });
    expect(first.toInsert).toHaveLength(2);

    // The outbox never got the response — it retries the identical batch.
    const second = prepareEventBatch(events, {
      storedClientEventIds: first.toInsert.map((event) => event.clientEventId),
      nextSeq: 2,
    });

    expect(second.toInsert).toEqual([]);
    expect(second.duplicates).toEqual(events.map((event) => event.clientEventId));
  });

  it("returns the same rows to the retry as to the first call", () => {
    const events = [input("KICKOFF", 0), input("GOAL_FOR", 12)];

    const first = prepareEventBatch(events, { storedClientEventIds: [], nextSeq: 0 });
    const stored = store(first.toInsert);

    const firstResponse = resolveStoredEvents(events, stored);
    const retryResponse = resolveStoredEvents(events, stored);

    expect(retryResponse).toEqual(firstResponse);
    expect(firstResponse.missing).toEqual([]);
    expect(firstResponse.events.map((event) => event.seq)).toEqual([0, 1]);
  });

  it("inserts only the tail when half the batch already landed", () => {
    const kickoff = input("KICKOFF", 0);
    const goal = input("GOAL_FOR", 12);
    const late = input("FOUL", 20, { payload: foul() });

    // The first POST timed out after the server had written the kick-off and the goal.
    const { toInsert, duplicates } = prepareEventBatch([kickoff, goal, late], {
      storedClientEventIds: [kickoff.clientEventId, goal.clientEventId],
      nextSeq: 2,
    });

    expect(duplicates).toEqual([kickoff.clientEventId, goal.clientEventId]);
    expect(toInsert).toHaveLength(1);
    expect(toInsert[0].clientEventId).toBe(late.clientEventId);
    expect(toInsert[0].seq).toBe(2);
  });

  it("collapses a client_event_id repeated inside one batch", () => {
    const goal = input("GOAL_FOR", 12);
    const { toInsert, duplicates } = prepareEventBatch([goal, goal], {
      storedClientEventIds: [],
      nextSeq: 0,
    });

    expect(toInsert).toHaveLength(1);
    expect(duplicates).toEqual([goal.clientEventId]);
  });

  it("reports an event the log did not hand back rather than assuming it landed", () => {
    const kickoff = input("KICKOFF", 0);
    const goal = input("GOAL_FOR", 12);

    const { events, missing } = resolveStoredEvents(
      [kickoff, goal],
      new Map([[kickoff.clientEventId, { id: uuid(), seq: 0 }]]),
    );

    expect(events).toHaveLength(1);
    expect(missing).toEqual([goal.clientEventId]);
  });
});

/* -------------------------------------------------------------------------- */
/* Side effects                                                               */
/* -------------------------------------------------------------------------- */

describe("batchEffects", () => {
  it("spots the kick-off that turns a scheduled match live", () => {
    expect(batchEffects([input("KICKOFF", 0)]).startsMatch).toBe(true);
    expect(batchEffects([input("GOAL_FOR", 12)]).startsMatch).toBe(false);
  });

  it("spots the final whistle that freezes the stats", () => {
    expect(batchEffects([input("FINAL_WHISTLE", 60)]).endsMatch).toBe(true);
    expect(batchEffects([input("PERIOD_END", 30)]).endsMatch).toBe(false);
  });

  it("collects the lineups a batch confirms", () => {
    const lineupId = uuid();
    const memberId = uuid();
    const slotId = uuid();

    const effects = batchEffects([
      input("LINEUP_APPLIED", 0, {
        payload: { lineupId, slots: [{ slotId, memberId }] },
      }),
      input("LINEUP_APPLIED", 45, { payload: { slots: [{ slotId: uuid(), memberId: uuid() }] } }),
    ]);

    // The second one is an ad-hoc reshuffle with no planned row behind it: nothing to flag.
    expect(effects.appliedLineupIds).toEqual([lineupId]);
  });
});

/* -------------------------------------------------------------------------- */
/* The envelope the route trusts                                              */
/* -------------------------------------------------------------------------- */

describe("the ingestion envelope", () => {
  it("refuses a VOID with no target", () => {
    const parsed = matchEventBatchSchema.safeParse({
      matchId: uuid(),
      events: [
        {
          clientEventId: uuid(),
          type: "VOID",
          period: 1,
          minute: 12,
          clockMs: 720_000,
          occurredAt: new Date().toISOString(),
        },
      ],
    });

    expect(parsed.success).toBe(false);
  });

  it("refuses an empty batch", () => {
    expect(matchEventBatchSchema.safeParse({ matchId: uuid(), events: [] }).success).toBe(false);
  });

  it("accepts a goal with an assist", () => {
    const parsed = matchEventBatchSchema.safeParse({
      matchId: uuid(),
      events: [
        {
          clientEventId: uuid(),
          type: "GOAL_FOR",
          period: 1,
          minute: 12,
          clockMs: 720_000,
          occurredAt: new Date().toISOString(),
          payload: { scorerId: uuid(), assistId: uuid() },
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* The starting composition (decision 150)                                    */
/* -------------------------------------------------------------------------- */

describe("voidsStartingLineup", () => {
  const seven = () => Array.from({ length: 7 }, () => ({ slotId: uuid(), memberId: uuid() }));
  const starting = seven();
  const later = starting.map((slot, i) => (i === 6 ? { ...slot, memberId: uuid() } : slot));

  /** The log as `getMatchEvents` returns it: what the device sent, plus the server's id and seq. */
  const stored = [
    input("LINEUP_APPLIED", 0, { payload: { lineupId: uuid(), slots: starting } }),
    input("KICKOFF", 0),
    input("LINEUP_APPLIED", 20, { payload: { lineupId: null, slots: later } }),
  ].map((event, i) => ({ ...event, id: uuid(), seq: i }));
  const [startingEvent, , laterEvent] = stored;

  it("refuses a VOID aimed at the composition that filled the empty pitch", () => {
    const crafted = input("VOID", 25, { voidsEventId: startingEvent.id });
    expect(voidsStartingLineup(stored, [crafted])).toBe(true);
  });

  it("lets a later composition be annulled, and anything else", () => {
    expect(voidsStartingLineup(stored, [input("VOID", 25, { voidsEventId: laterEvent.id })])).toBe(
      false,
    );
    expect(voidsStartingLineup(stored, [input("GOAL_FOR", 25)])).toBe(false);
  });
});

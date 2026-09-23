import { describe, expect, it } from "vitest";

import {
  backoffMs,
  createMemoryStorage,
  createOutbox,
  dueRecords,
  isPermanentStatus,
  toWireEvent,
  type OutboxBatch,
  type OutboxRecord,
  type TransportResult,
} from "./outbox";
import { pendingCountLabelFr } from "./presenter";

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

const MATCH_ID = "11111111-1111-4111-8111-111111111111";

/** A clock the test moves by hand: the queue must never read `Date.now()` itself. */
function clock(start = 1_700_000_000_000) {
  let value = start;
  return {
    now: () => value,
    advance: (ms: number) => {
      value += ms;
    },
  };
}

/** A transport whose answers the test dictates, recording every batch it was given. */
function recorder(answers: TransportResult[] = []) {
  const sent: OutboxBatch[] = [];
  const queue = [...answers];
  return {
    sent,
    transport: async (batch: OutboxBatch): Promise<TransportResult> => {
      sent.push({ matchId: batch.matchId, events: batch.events.map((event) => ({ ...event })) });
      return queue.shift() ?? { ok: true };
    },
  };
}

let counter = 0;
const ids = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, "0")}`;

function harness(answers: TransportResult[] = []) {
  const time = clock();
  const post = recorder(answers);
  const storage = createMemoryStorage();
  const outbox = createOutbox({
    matchId: MATCH_ID,
    storage,
    transport: post.transport,
    now: time.now,
    newId: ids,
  });
  return { time, post, storage, outbox };
}

const stamp = (minute: number) => ({
  period: minute <= 30 ? 1 : 2,
  minute,
  clockMs: minute * 60_000,
});

const ok: TransportResult = { ok: true };
const offline: TransportResult = { ok: false, permanent: false, message: "Pas de réseau." };
const refused: TransportResult = { ok: false, permanent: true, message: "Action invalide." };

/* -------------------------------------------------------------------------- */
/* The happy path                                                             */
/* -------------------------------------------------------------------------- */

describe("the outbox", () => {
  it("stamps the action on the device and sends it straight away", async () => {
    const { outbox, post, time } = harness();

    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(23) });
    await outbox.flush();

    expect(post.sent).toHaveLength(1);
    const [event] = post.sent[0].events;
    expect(event.type).toBe("GOAL_FOR");
    expect(event.minute).toBe(23);
    expect(event.clockMs).toBe(23 * 60_000);
    expect(event.occurredAt).toBe(new Date(time.now()).toISOString());
    expect(outbox.state().pending).toHaveLength(0);
  });

  it("keeps the action until the server confirms it", async () => {
    const { outbox, storage } = harness([offline]);

    await outbox.enqueue({ type: "KICKOFF", stamp: stamp(0) });
    await outbox.flush();

    expect(outbox.state().pending).toHaveLength(1);
    expect(outbox.state().online).toBe(false);
    // Written to the store before the POST, so a crash here costs nothing.
    expect(await storage.all(MATCH_ID)).toHaveLength(1);
  });

  it("sends the whole queue in one POST once the connection is back", async () => {
    const { outbox, post, time } = harness([offline, ok]);

    await outbox.enqueue({ type: "KICKOFF", stamp: stamp(0) });
    await outbox.flush();
    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) });
    await outbox.flush();

    // The queue is strictly FIFO: the goal waits behind the kick-off's backoff rather than
    // overtaking it, so the server never has to make sense of a log that arrived out of order.
    expect(post.sent).toHaveLength(1);

    time.advance(backoffMs(1));
    await outbox.flush();

    expect(post.sent).toHaveLength(2);
    expect(post.sent[1].events.map((event) => event.type)).toEqual(["KICKOFF", "GOAL_FOR"]);
    expect(outbox.state().pending).toHaveLength(0);
  });

  it("notifies subscribers so the badge can count", async () => {
    const { outbox } = harness([offline]);
    const counts: number[] = [];
    outbox.subscribe((state) => counts.push(state.pending.length));

    await outbox.enqueue({ type: "FOUL", stamp: stamp(20), payload: { memberId: "x" } });
    await outbox.flush();

    expect(counts.at(-1)).toBe(1);
    expect(pendingCountLabelFr(1)).toBe("1 action en attente");
    expect(pendingCountLabelFr(3)).toBe("3 actions en attente");
  });
});

/* -------------------------------------------------------------------------- */
/* Retrying                                                                   */
/* -------------------------------------------------------------------------- */

describe("retrying", () => {
  it("backs off, then gives up waiting and retries for ever at a minute", () => {
    expect(backoffMs(0)).toBe(0);
    expect(backoffMs(1)).toBe(1_000);
    expect(backoffMs(2)).toBe(2_000);
    expect(backoffMs(3)).toBe(5_000);
    expect(backoffMs(9)).toBe(30_000);
    // Monotonic, and capped: a coach walking back into coverage must not wait minutes.
    for (let attempts = 1; attempts < 20; attempts += 1) {
      expect(backoffMs(attempts)).toBeLessThanOrEqual(30_000);
      expect(backoffMs(attempts)).toBeGreaterThanOrEqual(backoffMs(attempts - 1));
    }
  });

  it("does not resend before the backoff has expired", async () => {
    const { outbox, post, time } = harness([offline]);

    await outbox.enqueue({ type: "KICKOFF", stamp: stamp(0) });
    await outbox.flush();
    expect(post.sent).toHaveLength(1);

    time.advance(500);
    await outbox.flush();
    expect(post.sent).toHaveLength(1);

    time.advance(600);
    await outbox.flush();
    expect(post.sent).toHaveLength(2);
  });

  it("counts attempts and keeps the French reason for the coach", async () => {
    const { outbox, time } = harness([offline, offline]);

    await outbox.enqueue({ type: "KICKOFF", stamp: stamp(0) });
    await outbox.flush();
    time.advance(backoffMs(1));
    await outbox.flush();

    const [record] = outbox.state().pending;
    expect(record.attempts).toBe(2);
    expect(record.lastError).toBe("Pas de réseau.");
    expect(outbox.state().lastError).toBe("Pas de réseau.");
  });

  it("re-sends the same client_event_id, which is what makes the server's idempotency matter", async () => {
    const { outbox, post, time } = harness([offline, ok]);

    const record = await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) });
    await outbox.flush();
    time.advance(backoffMs(1));
    await outbox.flush();

    expect(post.sent[0].events[0].clientEventId).toBe(record.clientEventId);
    expect(post.sent[1].events[0].clientEventId).toBe(record.clientEventId);
  });

  it("collapses concurrent flushes so one action is never in flight twice", async () => {
    const { outbox, post, time } = harness([offline]);
    await outbox.enqueue({ type: "KICKOFF", stamp: stamp(0) });
    await outbox.flush();
    time.advance(backoffMs(1));

    await Promise.all([outbox.flush(), outbox.flush(), outbox.flush()]);

    expect(post.sent).toHaveLength(2); // the first attempt, then exactly one retry
  });
});

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

describe("a refused action", () => {
  it("leaves the queue but stays visible", async () => {
    const { outbox } = harness([refused]);

    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) });
    await outbox.flush();

    expect(outbox.state().pending).toHaveLength(0);
    expect(outbox.state().rejected).toHaveLength(1);
    expect(outbox.state().rejected[0].rejectedReason).toBe("Action invalide.");
  });

  it("is never retried on its own, but can be on the coach's say-so", async () => {
    const { outbox, post, time } = harness([refused, ok]);
    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) });
    await outbox.flush();

    time.advance(60_000);
    await outbox.flush();
    expect(post.sent).toHaveLength(1);

    await outbox.retry(outbox.state().rejected[0].clientEventId);
    expect(post.sent).toHaveLength(2);
    expect(outbox.state().rejected).toHaveLength(0);
    expect(outbox.state().pending).toHaveLength(0);
  });

  it("can be dismissed, which forgets it for good", async () => {
    const { outbox, storage } = harness([refused]);
    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) });
    await outbox.flush();

    await outbox.dismiss(outbox.state().rejected[0].clientEventId);

    expect(outbox.state().rejected).toHaveLength(0);
    expect(await storage.all(MATCH_ID)).toHaveLength(0);
  });

  it("does not block the good actions queued behind it", async () => {
    // The batch is refused as a whole, so the queue splits and sends one at a time until the
    // offender is isolated. Everything else still reaches the server.
    const { outbox, post } = harness([refused, refused, ok, ok]);

    await outbox.enqueue({ type: "GOAL_FOR", stamp: stamp(12) }); // the bad one
    await outbox.enqueue({ type: "FOUL", stamp: stamp(14), payload: { memberId: "x" } });
    await outbox.enqueue({ type: "GOAL_AGAINST", stamp: stamp(16) });
    await outbox.flush();

    expect(outbox.state().pending).toHaveLength(0);
    expect(outbox.state().rejected).toHaveLength(1);
    expect(outbox.state().rejected[0].type).toBe("GOAL_FOR");
    // The last two batches carried one event each: the split isolated the culprit.
    expect(post.sent.at(-1)?.events).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Surviving a reload                                                         */
/* -------------------------------------------------------------------------- */

describe("hydration", () => {
  it("picks the queue back up after the browser reloads the page", async () => {
    const storage = createMemoryStorage([
      {
        clientEventId: "22222222-2222-4222-8222-222222222222",
        matchId: MATCH_ID,
        type: "GOAL_FOR",
        period: 1,
        minute: 12,
        clockMs: 720_000,
        occurredAt: "2026-03-14T09:12:00.000Z",
        payload: {},
        voidsEventId: null,
        enqueuedAt: 1_700_000_000_000,
        attempts: 1,
        nextAttemptAt: 0,
        lastError: "Pas de réseau.",
        rejectedReason: null,
      } satisfies OutboxRecord,
    ]);
    const post = recorder([ok]);
    const outbox = createOutbox({
      matchId: MATCH_ID,
      storage,
      transport: post.transport,
      now: clock().now,
      newId: ids,
    });

    await outbox.hydrate();

    expect(post.sent).toHaveLength(1);
    expect(post.sent[0].events[0].minute).toBe(12);
    expect(await storage.all(MATCH_ID)).toHaveLength(0);
  });

  it("ignores another match's queue", async () => {
    const storage = createMemoryStorage([
      {
        clientEventId: "33333333-3333-4333-8333-333333333333",
        matchId: "99999999-9999-4999-8999-999999999999",
        type: "KICKOFF",
        period: 1,
        minute: 0,
        clockMs: 0,
        occurredAt: "2026-03-14T09:00:00.000Z",
        payload: {},
        voidsEventId: null,
        enqueuedAt: 1_700_000_000_000,
        attempts: 0,
        nextAttemptAt: 0,
        lastError: null,
        rejectedReason: null,
      } satisfies OutboxRecord,
    ]);
    const post = recorder();
    const outbox = createOutbox({ matchId: MATCH_ID, storage, transport: post.transport });

    await outbox.hydrate();

    expect(post.sent).toHaveLength(0);
    expect(outbox.state().pending).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

describe("the policy helpers", () => {
  it("treats 4xx as hopeless and everything else as worth retrying", () => {
    expect(isPermanentStatus(400)).toBe(true);
    expect(isPermanentStatus(403)).toBe(true);
    expect(isPermanentStatus(409)).toBe(true);
    expect(isPermanentStatus(500)).toBe(false);
    expect(isPermanentStatus(503)).toBe(false);
  });

  it("orders the queue by when the coach tapped", () => {
    const base: Omit<OutboxRecord, "clientEventId" | "enqueuedAt"> = {
      matchId: MATCH_ID,
      type: "FOUL",
      period: 1,
      minute: 5,
      clockMs: 300_000,
      occurredAt: "2026-03-14T09:05:00.000Z",
      payload: {},
      voidsEventId: null,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      rejectedReason: null,
    };
    const records: OutboxRecord[] = [
      { ...base, clientEventId: "b", enqueuedAt: 200 },
      { ...base, clientEventId: "a", enqueuedAt: 100 },
    ];

    expect(dueRecords(records, 1_000).map((record) => record.clientEventId)).toEqual(["a", "b"]);
    expect(dueRecords([{ ...base, clientEventId: "c", enqueuedAt: 0, nextAttemptAt: 5_000 }], 1_000))
      .toEqual([]);
  });

  it("puts only the event on the wire, not the queue's bookkeeping", () => {
    const record: OutboxRecord = {
      clientEventId: "44444444-4444-4444-8444-444444444444",
      matchId: MATCH_ID,
      type: "SUBSTITUTION",
      period: 2,
      minute: 45,
      clockMs: 2_700_000,
      occurredAt: "2026-03-14T09:45:00.000Z",
      payload: { outId: "a", inId: "b" },
      voidsEventId: null,
      enqueuedAt: 1,
      attempts: 3,
      nextAttemptAt: 99,
      lastError: "boom",
      rejectedReason: null,
    };

    expect(toWireEvent(record)).toEqual({
      clientEventId: record.clientEventId,
      type: "SUBSTITUTION",
      period: 2,
      minute: 45,
      clockMs: 2_700_000,
      occurredAt: "2026-03-14T09:45:00.000Z",
      payload: { outId: "a", inId: "b" },
      voidsEventId: null,
    });
  });
});

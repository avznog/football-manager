/**
 * The outbox: every action the coach taps, queued on the device until the server confirms it.
 *
 * Seven-a-side pitches are municipal, and municipal pitches have no signal. Game mode is therefore
 * built the other way round from the rest of the app: a tap writes to **IndexedDB first** and the
 * network is an afterthought that catches up (decision 004). Nothing is ever lost by a dead 4G, a
 * locked screen or a browser that decides to reload the page at 78′.
 *
 * Three properties make that safe, and all three are testable:
 *
 * 1. **The device stamps the action.** `occurred_at` and `clock_ms` are captured when the coach
 *    taps, never when the POST lands, so a batch that syncs at half time still reads 23′.
 * 2. **Retries are free.** Each action carries a `client_event_id`; the server is idempotent on it
 *    (invariant 6), so the queue can re-send blindly and never has to ask "did that one land?".
 * 3. **A refused action is not a lost action.** A 4xx means "this will never work": the action
 *    leaves the queue but is kept, visible, so the coach knows one tap did not count. Only a 5xx or
 *    a network failure is retried, with a backoff.
 *
 * Storage and transport are injected, which is what lets `outbox.test.ts` exercise the whole retry
 * policy in Node with no browser and no server — the queue is the one piece of this screen whose
 * bugs would be invisible until the one match it matters.
 */

import type { MatchEventType } from "./events";
import type { EventStamp, PendingEvent } from "./presenter";

/* -------------------------------------------------------------------------- */
/* Records                                                                    */
/* -------------------------------------------------------------------------- */

export type OutboxRecord = PendingEvent & {
  matchId: string;
  /** Device time the coach tapped, epoch ms. The queue's order. */
  enqueuedAt: number;
  /** How many times this action has been POSTed without success. */
  attempts: number;
  /** Not before this instant: the backoff. */
  nextAttemptAt: number;
  /** French, from the server, for the coach. */
  lastError: string | null;
  /**
   * Set when the server refused the action for good. It stays in the store — deleting it would
   * hide a tap that did not count — but it is out of the pending queue and never retried.
   */
  rejectedReason: string | null;
};

/** What a `POST /api/match-events` body needs. */
export type OutboxBatch = {
  matchId: string;
  events: readonly PendingEvent[];
};

export type TransportResult =
  | { ok: true }
  /**
   * `permanent` is the whole contract with the API: 4xx means never retry (show the coach), 5xx and
   * network errors mean keep it and back off.
   */
  | { ok: false; permanent: boolean; message: string };

export type OutboxTransport = (batch: OutboxBatch) => Promise<TransportResult>;

export type OutboxStorage = {
  all: (matchId: string) => Promise<OutboxRecord[]>;
  put: (records: readonly OutboxRecord[]) => Promise<void>;
  remove: (clientEventIds: readonly string[]) => Promise<void>;
};

export type OutboxState = {
  /** Waiting to be sent, oldest first. */
  pending: readonly OutboxRecord[];
  /** Refused for good: shown to the coach, never retried automatically. */
  rejected: readonly OutboxRecord[];
  /** A flush is in flight. */
  sending: boolean;
  /** Last failure, French, for the badge's tooltip. */
  lastError: string | null;
  /** False once a flush has failed on the network; true again as soon as one succeeds. */
  online: boolean;
};

/* -------------------------------------------------------------------------- */
/* Pure policy                                                                */
/* -------------------------------------------------------------------------- */

/**
 * How long to wait after `attempts` failures: 1s, 2s, 5s, 10s, 30s, then a minute for ever.
 *
 * Deliberately short at the start — the usual failure is a two-second tunnel of no signal, not a
 * server outage — and capped, because a coach who walks back into coverage at 80′ must not wait
 * for an exponential backoff to expire before the match syncs.
 */
export function backoffMs(attempts: number): number {
  const ladder = [1_000, 2_000, 5_000, 10_000, 30_000];
  if (attempts <= 0) return 0;
  return ladder[Math.min(attempts, ladder.length) - 1] ?? 60_000;
}

/** Queue order: when the coach tapped. `client_event_id` only breaks an exact tie. */
export function sortRecords(records: readonly OutboxRecord[]): OutboxRecord[] {
  return [...records].sort(
    (a, b) => a.enqueuedAt - b.enqueuedAt || a.clientEventId.localeCompare(b.clientEventId),
  );
}

export function pendingRecords(records: readonly OutboxRecord[]): OutboxRecord[] {
  return sortRecords(records.filter((record) => record.rejectedReason === null));
}

export function rejectedRecords(records: readonly OutboxRecord[]): OutboxRecord[] {
  return sortRecords(records.filter((record) => record.rejectedReason !== null));
}

/**
 * The leading run of pending actions whose backoff has expired.
 *
 * **Strictly FIFO**: nothing queued behind a waiting action is sent, even if its own backoff has
 * expired. Order matters — the server assigns `seq` on arrival, `compareMatchEvents` breaks a tie at
 * the same `clock_ms` with it, and the 55′ chain (a position change, then the substitution that
 * completes it) only replays correctly if the device's order survives the network.
 */
export function dueRecords(records: readonly OutboxRecord[], nowMs: number): OutboxRecord[] {
  const due: OutboxRecord[] = [];
  for (const record of pendingRecords(records)) {
    if (record.nextAttemptAt > nowMs) break;
    due.push(record);
  }
  return due;
}

/** Which HTTP statuses are hopeless. Anything else — including no response at all — is retried. */
export function isPermanentStatus(status: number): boolean {
  return status >= 400 && status < 500;
}

/** The wire shape: the record minus the queue's own bookkeeping. */
export function toWireEvent(record: OutboxRecord): PendingEvent {
  return {
    clientEventId: record.clientEventId,
    type: record.type,
    period: record.period,
    minute: record.minute,
    clockMs: record.clockMs,
    occurredAt: record.occurredAt,
    payload: record.payload ?? {},
    voidsEventId: record.voidsEventId ?? null,
  };
}

/** How many actions a single POST carries. `matchEventBatchSchema` refuses more than 200. */
export const FLUSH_BATCH_SIZE = 50;

/* -------------------------------------------------------------------------- */
/* Transport over fetch                                                       */
/* -------------------------------------------------------------------------- */

/** The real transport. `keepalive` so a flush survives the page being navigated away from. */
export function fetchTransport(batch: OutboxBatch): Promise<TransportResult> {
  return fetch("/api/match-events", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(batch),
    keepalive: true,
  }).then(
    async (response) => {
      if (response.ok) return { ok: true as const };
      const message = await readErrorMessage(response);
      return { ok: false as const, permanent: isPermanentStatus(response.status), message };
    },
    () => ({
      ok: false as const,
      permanent: false,
      message: "Pas de réseau : les actions sont conservées sur ton téléphone.",
    }),
  );
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error.length > 0) return body.error;
  } catch {
    // An HTML error page from a proxy, say. Fall through to the generic message.
  }
  return "Le serveur a refusé ces actions.";
}

/* -------------------------------------------------------------------------- */
/* Storage                                                                    */
/* -------------------------------------------------------------------------- */

const DB_NAME = "fm-match-outbox";
const DB_VERSION = 1;
const STORE = "events";

/**
 * IndexedDB, or memory when it is unavailable.
 *
 * Private-mode Safari and some in-app browsers refuse `indexedDB.open`. Failing softly to memory
 * costs the queue on a reload, which is bad, but far less bad than game mode refusing to start.
 */
export function createOutboxStorage(): OutboxStorage {
  let database: Promise<IDBDatabase> | null = null;

  function open(): Promise<IDBDatabase> {
    if (database) return database;
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: "clientEventId" });
          store.createIndex("matchId", "matchId");
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB indisponible"));
    });
    return database;
  }

  const fallback = createMemoryStorage();
  let usingFallback = typeof indexedDB === "undefined";

  async function withStore<T>(
    mode: IDBTransactionMode,
    run: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> {
    const db = await open();
    return new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode);
      const request = run(transaction.objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Écriture impossible"));
    });
  }

  return {
    async all(matchId) {
      if (usingFallback) return fallback.all(matchId);
      try {
        const rows = await withStore<OutboxRecord[]>("readonly", (store) =>
          store.index("matchId").getAll(matchId) as IDBRequest<OutboxRecord[]>,
        );
        return rows;
      } catch {
        usingFallback = true;
        return fallback.all(matchId);
      }
    },
    async put(records) {
      if (usingFallback) return fallback.put(records);
      try {
        for (const record of records) {
          await withStore("readwrite", (store) => store.put(record) as IDBRequest<IDBValidKey>);
        }
      } catch {
        usingFallback = true;
        await fallback.put(records);
      }
    },
    async remove(clientEventIds) {
      if (usingFallback) return fallback.remove(clientEventIds);
      try {
        for (const id of clientEventIds) {
          await withStore("readwrite", (store) => store.delete(id) as IDBRequest<undefined>);
        }
      } catch {
        usingFallback = true;
        await fallback.remove(clientEventIds);
      }
    },
  };
}

/** The same interface over a `Map`. The fallback in the browser, and what the tests run on. */
export function createMemoryStorage(initial: readonly OutboxRecord[] = []): OutboxStorage {
  const rows = new Map(initial.map((record) => [record.clientEventId, record]));
  return {
    async all(matchId) {
      return [...rows.values()].filter((record) => record.matchId === matchId);
    },
    async put(records) {
      for (const record of records) rows.set(record.clientEventId, record);
    },
    async remove(clientEventIds) {
      for (const id of clientEventIds) rows.delete(id);
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The queue                                                                  */
/* -------------------------------------------------------------------------- */

export type EnqueueInput = {
  type: MatchEventType;
  stamp: EventStamp;
  payload?: unknown;
  voidsEventId?: string | null;
  /** Device wall clock of the tap. Defaults to `now()`. */
  occurredAtMs?: number;
};

export type OutboxOptions = {
  matchId: string;
  storage?: OutboxStorage;
  transport?: OutboxTransport;
  /** Injected in tests. Never `Date.now()` inside the queue itself. */
  now?: () => number;
  newId?: () => string;
};

export type Outbox = {
  state: () => OutboxState;
  subscribe: (listener: (state: OutboxState) => void) => () => void;
  /** Read the store back after a reload, then try to catch up. */
  hydrate: () => Promise<void>;
  enqueue: (input: EnqueueInput) => Promise<OutboxRecord>;
  /**
   * Several actions that are one tap — the whistle's `PERIOD_END` + `FINAL_WHISTLE` (decision 151).
   * Stored together and sent together, in this order, so `seq` keeps it.
   */
  enqueueAll: (inputs: readonly EnqueueInput[]) => Promise<OutboxRecord[]>;
  /** Send everything due. Safe to call at any time: concurrent calls collapse into one. */
  flush: () => Promise<void>;
  /** Give a refused action one more chance, on the coach's say-so. */
  retry: (clientEventId: string) => Promise<void>;
  /** Acknowledge a refused action: it leaves the screen. */
  dismiss: (clientEventId: string) => Promise<void>;
  /** Attach the browser triggers (online, visibility, a ticking retry). */
  start: () => void;
  stop: () => void;
};

export function createOutbox(options: OutboxOptions): Outbox {
  const {
    matchId,
    storage = createOutboxStorage(),
    transport = fetchTransport,
    now = () => Date.now(),
    newId = () => crypto.randomUUID(),
  } = options;

  let records: OutboxRecord[] = [];
  let sending = false;
  /** The flush in progress, so concurrent callers await it instead of starting a second one. */
  let inFlight: Promise<void> | null = null;
  /** Set when a batch is refused: the next flush sends one action at a time to isolate the culprit. */
  let splitting = false;
  let lastError: string | null = null;
  let online = true;
  const listeners = new Set<(state: OutboxState) => void>();
  let timer: ReturnType<typeof setInterval> | null = null;

  function state(): OutboxState {
    return {
      pending: pendingRecords(records),
      rejected: rejectedRecords(records),
      sending,
      lastError,
      online,
    };
  }

  function notify(): void {
    const snapshot = state();
    for (const listener of listeners) listener(snapshot);
  }

  function upsert(next: readonly OutboxRecord[]): void {
    const byId = new Map(records.map((record) => [record.clientEventId, record]));
    for (const record of next) byId.set(record.clientEventId, record);
    records = [...byId.values()];
  }

  async function hydrate(): Promise<void> {
    records = await storage.all(matchId);
    notify();
    await flush();
  }

  /** `offset` is the record's place in a tap that queues several (see `enqueueAll`). */
  function newRecord(input: EnqueueInput, offset = 0): OutboxRecord {
    const at = input.occurredAtMs ?? now();
    return {
      clientEventId: newId(),
      matchId,
      type: input.type,
      period: input.stamp.period,
      minute: input.stamp.minute,
      clockMs: input.stamp.clockMs,
      occurredAt: new Date(at).toISOString(),
      payload: input.payload ?? {},
      voidsEventId: input.voidsEventId ?? null,
      enqueuedAt: at + offset,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
      rejectedReason: null,
    };
  }

  async function enqueue(input: EnqueueInput): Promise<OutboxRecord> {
    const record = newRecord(input);

    // Stored before anything else happens: from here on the action survives a crash.
    await storage.put([record]);
    upsert([record]);
    notify();

    void flush();
    return record;
  }

  async function enqueueAll(inputs: readonly EnqueueInput[]): Promise<OutboxRecord[]> {
    // `enqueuedAt` is the queue's own order and nothing else reads it. Two actions of one tap share
    // a wall clock, and the tie-break after it is the random `clientEventId` — which would send the
    // whistle before the period's end half the time. One millisecond apart keeps them in order;
    // `occurredAt`, which the server stores, is untouched.
    const fresh = inputs.map((input, index) => newRecord(input, index));
    if (fresh.length === 0) return fresh;

    // Stored together before anything is sent, so the first flush carries all of them.
    await storage.put(fresh);
    upsert(fresh);
    notify();

    void flush();
    return fresh;
  }

  /**
   * Send everything that is due, and keep going until nothing is.
   *
   * Concurrent callers get the flush that is already running rather than a second one: the UI calls
   * this from a tap, a three-second timer, the `online` event and `visibilitychange`, and two
   * overlapping POSTs of the same action would only lean on the server's idempotency for no reason.
   */
  function flush(): Promise<void> {
    if (inFlight) return inFlight;
    inFlight = drain().finally(() => {
      inFlight = null;
    });
    return inFlight;
  }

  async function drain(): Promise<void> {
    // Each pass either sends actions, rejects one, or backs off and returns, so the loop always
    // makes progress. The counter is a belt-and-braces guard against a transport that lies.
    for (let pass = 0; pass < 500; pass += 1) {
      const due = dueRecords(records, now());
      if (due.length === 0) return;

      const chunk = splitting ? due.slice(0, 1) : due.slice(0, FLUSH_BATCH_SIZE);

      sending = true;
      notify();

      let result: TransportResult;
      try {
        result = await transport({ matchId, events: chunk.map(toWireEvent) });
      } catch {
        result = {
          ok: false,
          permanent: false,
          message: "Envoi impossible : les actions sont conservées sur ton téléphone.",
        };
      }

      if (result.ok) {
        await storage.remove(chunk.map((record) => record.clientEventId));
        const sent = new Set(chunk.map((record) => record.clientEventId));
        records = records.filter((record) => !sent.has(record.clientEventId));
        lastError = null;
        online = true;
        splitting = false;
      } else if (result.permanent && chunk.length > 1) {
        /*
         * One bad action in a batch would otherwise block every good one behind it for ever: the
         * POST is all-or-nothing, so the whole batch keeps coming back with the same 400. Sending
         * them one at a time from now on isolates the offender, which is then rejected alone.
         */
        splitting = true;
        lastError = result.message;
      } else if (result.permanent) {
        const rejected = chunk.map((record) => ({
          ...record,
          rejectedReason: result.message,
          lastError: result.message,
        }));
        await storage.put(rejected);
        upsert(rejected);
        lastError = result.message;
        splitting = false;
      } else {
        const retried = chunk.map((record) => ({
          ...record,
          attempts: record.attempts + 1,
          nextAttemptAt: now() + backoffMs(record.attempts + 1),
          lastError: result.message,
        }));
        await storage.put(retried);
        upsert(retried);
        lastError = result.message;
        online = false;
        sending = false;
        notify();
        // No network: stop here rather than hammer it. The timer and the `online` event retry.
        return;
      }

      sending = false;
      notify();
    }
  }

  async function retry(clientEventId: string): Promise<void> {
    const record = records.find((item) => item.clientEventId === clientEventId);
    if (!record) return;
    const revived: OutboxRecord = {
      ...record,
      rejectedReason: null,
      attempts: 0,
      nextAttemptAt: 0,
      lastError: null,
    };
    await storage.put([revived]);
    upsert([revived]);
    splitting = false;
    notify();
    await flush();
  }

  async function dismiss(clientEventId: string): Promise<void> {
    await storage.remove([clientEventId]);
    records = records.filter((record) => record.clientEventId !== clientEventId);
    notify();
  }

  function start(): void {
    if (timer) return;
    // Every three seconds: short enough that a recovered connection syncs before the coach notices,
    // cheap enough that it costs nothing when the queue is empty (`flush` returns immediately).
    timer = setInterval(() => void flush(), 3_000);
    if (typeof window !== "undefined") {
      window.addEventListener("online", onOnline);
      document.addEventListener("visibilitychange", onVisible);
    }
  }

  function stop(): void {
    if (timer) clearInterval(timer);
    timer = null;
    if (typeof window !== "undefined") {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    }
  }

  function onOnline(): void {
    online = true;
    // A recovered connection should not have to wait out a backoff.
    records = records.map((record) =>
      record.rejectedReason === null ? { ...record, nextAttemptAt: 0 } : record,
    );
    void flush();
  }

  function onVisible(): void {
    if (document.visibilityState === "visible") void flush();
  }

  return {
    state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    hydrate,
    enqueue,
    enqueueAll,
    flush,
    retry,
    dismiss,
    start,
    stop,
  };
}

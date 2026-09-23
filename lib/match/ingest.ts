/**
 * Preparing a batch of device-generated events for the append-only log.
 *
 * This is the **pure** half of ingestion: given what the device sent, what the log already holds
 * and where the sequence has got to, it says exactly which rows to insert and with which `seq`.
 * The database half — the transaction, the permission check, the status transitions — lives in
 * `lib/match/append.ts`, which is `server-only` and therefore untestable by Vitest.
 *
 * Splitting it this way exists for one reason: **invariant 6**. Ingestion must be idempotent on
 * `client_event_id`, and "the outbox POSTed the same batch twice and got one row" is a claim worth
 * proving in a unit test rather than hoping for. `prepareEventBatch` is where that is decided, and
 * `ingest.test.ts` is the proof.
 *
 * Nothing here reads the clock. `occurred_at` and `clock_ms` are captured on the *device* when the
 * coach taps (decision 004), so a batch that syncs twenty minutes late still lands at the right
 * minute — the server must never restamp it.
 */

import { MAX_MINUTE, type MatchEventInput, type MatchEventType } from "./events";

/* -------------------------------------------------------------------------- */
/* Preparation                                                                */
/* -------------------------------------------------------------------------- */

/** One event ready to insert: exactly what the device sent, plus the `seq` the server assigns. */
export type PreparedEvent = MatchEventInput & { seq: number };

export type PreparedBatch = {
  /** Rows to insert, in the order the device produced them. */
  toInsert: readonly PreparedEvent[];
  /**
   * `client_event_id`s that are already in the log, or repeated inside this very batch. Nothing is
   * inserted for them and that is not an error: it is a retry doing its job.
   */
  duplicates: readonly string[];
};

export type PrepareOptions = {
  /** The `client_event_id`s of this batch that the log already holds. */
  storedClientEventIds: Iterable<string>;
  /** `max(seq) + 1` for this match. `seq` is monotonic per match and never reused. */
  nextSeq: number;
};

/**
 * Which of these events are new, and what `seq` each one gets.
 *
 * `seq` follows the **order of the array**, which is the order the device produced the events —
 * not their `clock_ms`. That is deliberate: `compareMatchEvents` uses `seq` only to break a tie
 * between two events at the same match time, and the 55′ chain (a position change, then the
 * substitution that completes it) replays correctly precisely because the device's order survives.
 */
export function prepareEventBatch(
  events: readonly MatchEventInput[],
  { storedClientEventIds, nextSeq }: PrepareOptions,
): PreparedBatch {
  const stored = new Set(storedClientEventIds);
  const seen = new Set<string>();
  const toInsert: PreparedEvent[] = [];
  const duplicates: string[] = [];
  let seq = nextSeq;

  for (const event of events) {
    if (stored.has(event.clientEventId) || seen.has(event.clientEventId)) {
      duplicates.push(event.clientEventId);
      continue;
    }
    seen.add(event.clientEventId);
    toInsert.push({ ...event, seq });
    seq += 1;
  }

  return { toInsert, duplicates };
}

/* -------------------------------------------------------------------------- */
/* What a batch means for the rest of the database                            */
/* -------------------------------------------------------------------------- */

/**
 * The consequences a batch has outside `match_events`.
 *
 * The log is the truth, but three rows elsewhere have to follow it: `matches.status` (so the
 * calendar can show « en cours »), `matches.operator_user_id` (decision 004 — whoever kicks off
 * owns the match), and `lineups.applied_event_id` (decision 006 — how "planned" and "actually
 * applied" stay distinguishable). Deciding that here keeps `append.ts` a straight line of writes.
 */
export type BatchEffects = {
  /** A `KICKOFF` is in the batch: the match has started. */
  startsMatch: boolean;
  /** A `FINAL_WHISTLE` is in the batch: freeze `match_player_stats` and close the match. */
  endsMatch: boolean;
  /** `lineups.id` of every composition this batch confirms, in order. */
  appliedLineupIds: readonly string[];
};

export function batchEffects(events: readonly MatchEventInput[]): BatchEffects {
  const appliedLineupIds: string[] = [];
  let startsMatch = false;
  let endsMatch = false;

  for (const event of events) {
    if (event.type === "KICKOFF") startsMatch = true;
    if (event.type === "FINAL_WHISTLE") endsMatch = true;
    if (event.type === "LINEUP_APPLIED") {
      // The payload has already been validated against `MATCH_EVENT_PAYLOAD_SCHEMAS` by
      // `matchEventInputSchema`, so a `lineupId` here is either a uuid or absent.
      const lineupId = (event.payload as { lineupId?: string | null } | undefined)?.lineupId;
      if (typeof lineupId === "string" && lineupId.length > 0) appliedLineupIds.push(lineupId);
    }
  }

  return { startsMatch, endsMatch, appliedLineupIds };
}

/* -------------------------------------------------------------------------- */
/* The response                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What the device gets back for one event. Deliberately carries **no** "was this a duplicate"
 * flag: invariant 6 says a retry must not create a second row, and the honest way to prove the
 * outbox can trust that is for the second POST to return byte-for-byte what the first one did.
 */
export type StoredEventRef = {
  clientEventId: string;
  /** `match_events.id` — what a later `VOID` must point at. */
  id: string;
  seq: number;
};

export type IngestSuccess = {
  matchId: string;
  /** One entry per event of the request, in request order. */
  events: readonly StoredEventRef[];
};

/**
 * Line the stored rows up with the request.
 *
 * The device sent `client_event_id`s; the log answers with the row each one became, whether it was
 * written a millisecond ago or an hour ago. An event missing from `stored` would mean an insert
 * silently did nothing, so it is reported rather than skipped — the outbox must not delete a
 * queued action it has no confirmation for.
 */
export function resolveStoredEvents(
  requested: readonly MatchEventInput[],
  stored: ReadonlyMap<string, { id: string; seq: number }>,
): { events: StoredEventRef[]; missing: string[] } {
  const events: StoredEventRef[] = [];
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const event of requested) {
    if (seen.has(event.clientEventId)) continue;
    seen.add(event.clientEventId);
    const row = stored.get(event.clientEventId);
    if (!row) {
      missing.push(event.clientEventId);
      continue;
    }
    events.push({ clientEventId: event.clientEventId, id: row.id, seq: row.seq });
  }

  return { events, missing };
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Why a batch was refused, in French: this text reaches the coach's screen through the outbox
 * (decision 012). Statuses are chosen so the outbox can tell "retry later" (5xx) from "this will
 * never work, show it to the coach" (4xx) without parsing anything.
 */
export const INGEST_ERRORS = {
  unauthenticated: "Session expirée. Reconnecte-toi pour continuer à enregistrer le match.",
  forbidden: "Tu n’es pas l’opérateur de ce match.",
  notFound: "Ce match n’existe pas dans cette équipe.",
  finished: "Ce match est terminé : les corrections passent par une modification du match.",
  malformed: "Ces actions sont invalides et n’ont pas été enregistrées.",
} as const;

/**
 * A sanity ceiling on a single POST. `matchEventBatchSchema` already caps the array at 200; this
 * is the same number named, for the outbox to chunk against.
 */
export const MAX_BATCH_SIZE = 200;

/** A minute no seven-a-side match reaches, re-exported so the outbox can refuse early. */
export { MAX_MINUTE };

/** Event types the game-mode screen is allowed to produce. `VOID` included (invariant 1). */
export const GAME_MODE_EVENT_TYPES: readonly MatchEventType[] = [
  "KICKOFF",
  "PERIOD_END",
  "PAUSE",
  "RESUME",
  "GOAL_FOR",
  "GOAL_AGAINST",
  "OWN_GOAL",
  "PENALTY_SCORED",
  "PENALTY_MISSED",
  "SUBSTITUTION",
  "POSITION_CHANGE",
  "LINEUP_APPLIED",
  "FOUL",
  "INJURY",
  "FINAL_WHISTLE",
  "VOID",
];

import "server-only";

/**
 * Writing to the append-only log.
 *
 * This is the **only** place in the application that inserts into `match_events`, and it never
 * updates or deletes a row (invariant 1). The four things it has to get right:
 *
 * 1. **Permission** — `can(actor, "match:operate", …)` before anything is written (invariant 4).
 * 2. **Idempotency** — the same `client_event_id` twice yields one row and the *same* response
 *    (invariant 6). The outbox retries blindly; it must be able to.
 * 3. **Order** — `seq` is monotonic per match, and two devices flushing at once must not both
 *    claim the same number. The match row is locked for the duration, which serialises them.
 * 4. **Consequences** — the rows outside the log that have to follow it: `matches.status`,
 *    `matches.operator_user_id`, `lineups.applied_event_id`, and `match_player_stats` at the
 *    final whistle.
 *
 * It returns a status and a body rather than throwing, because its only caller is an API route
 * talking to a queue: the outbox has to be able to tell "retry in ten seconds" from "this will
 * never work, show it to the coach", and an HTTP status is how it does that.
 */

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { db } from "@/db/client";
import { lineups, matchEvents, matches } from "@/db/schema";
import { can, type Actor } from "@/lib/auth/can";
import { finalizeMatchById } from "./finalize";
import { matchEventBatchSchema, type MatchEventInput } from "./events";
import {
  INGEST_ERRORS,
  batchEffects,
  prepareEventBatch,
  resolveStoredEvents,
  type IngestSuccess,
} from "./ingest";

export type AppendFailure = {
  ok: false;
  status: 400 | 403 | 404 | 409 | 500;
  body: { error: string; issues?: string[] };
};

export type AppendResult = { ok: true; status: 200; body: IngestSuccess } | AppendFailure;

/** One `match_events` row as this module needs to see it back. */
type StoredRow = { id: string; clientEventId: string; seq: number; matchId: string };

export async function appendMatchEvents(actor: Actor, raw: unknown): Promise<AppendResult> {
  const parsed = matchEventBatchSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: {
        error: INGEST_ERRORS.malformed,
        issues: parsed.error.issues.map((issue) => issue.message),
      },
    };
  }

  const { matchId, events } = parsed.data;

  const [match] = await db
    .select({
      id: matches.id,
      teamId: matches.teamId,
      status: matches.status,
      operatorUserId: matches.operatorUserId,
    })
    .from(matches)
    .where(eq(matches.id, matchId))
    .limit(1);

  if (!match) return fail(404, INGEST_ERRORS.notFound);

  // Invariant 4. The operator may be a coach, or the one person the coach delegated the phone to
  // for this match (decision 004) — `can()` owns that rule, not this file.
  const allowed = can(actor, "match:operate", {
    teamId: match.teamId,
    match: { status: match.status, operatorUserId: match.operatorUserId },
  });
  if (!allowed) return fail(403, INGEST_ERRORS.forbidden);

  const clientEventIds = events.map((event) => event.clientEventId);
  let stored = await selectStored(clientEventIds);

  // `client_event_id` is unique across the whole table, so an id that belongs to another match is
  // not a duplicate — it is a bug on the device, and silently inserting nothing would look like
  // success to the outbox.
  const foreign = stored.filter((row) => row.matchId !== matchId);
  if (foreign.length > 0) return fail(409, INGEST_ERRORS.notFound);

  /*
   * A finished match takes no new events: correcting one is `match:amend`, which is M7's job and a
   * different screen. But the batch that *carried* the final whistle must still be replayable —
   * the outbox will retry it if the response was lost — so a batch whose every event is already in
   * the log is answered normally.
   */
  if (match.status === "finished") {
    const known = new Set(stored.map((row) => row.clientEventId));
    if (!clientEventIds.every((id) => known.has(id))) return fail(409, INGEST_ERRORS.finished);
    return respond(matchId, events, stored);
  }

  await insertNewEvents(matchId, actor.userId, events, stored);

  // Re-read rather than trust `returning`: a concurrent flush of the same batch may have inserted
  // a row this transaction skipped, and the outbox must not drop a queued action it has no
  // confirmed id for.
  stored = await selectStored(clientEventIds);

  const effects = batchEffects(events);
  await applyEffects(matchId, actor, match.status, match.operatorUserId, events, stored, effects);

  if (effects.endsMatch) await finalizeMatchById(match.teamId, matchId);

  revalidatePath(`/match/${matchId}/jeu`);
  revalidatePath(`/match/${matchId}`);
  revalidatePath("/calendrier");

  return respond(matchId, events, stored);
}

/* -------------------------------------------------------------------------- */
/* The insert                                                                 */
/* -------------------------------------------------------------------------- */

async function insertNewEvents(
  matchId: string,
  createdBy: string,
  events: readonly MatchEventInput[],
  stored: readonly StoredRow[],
): Promise<void> {
  const known = stored.map((row) => row.clientEventId);
  if (events.every((event) => known.includes(event.clientEventId))) return;

  await db.transaction(async (tx) => {
    // Serialise concurrent flushes for this match. Two phones operating the same match is rare but
    // real (the coach's and an assistant's), and without this they would race for the same `seq`
    // and one transaction would die on `match_events_match_seq_unique`.
    await tx.select({ id: matches.id }).from(matches).where(eq(matches.id, matchId)).for("update");

    const [seqRow] = await tx
      .select({ next: sql<number>`coalesce(max(${matchEvents.seq}), -1) + 1` })
      .from(matchEvents)
      .where(eq(matchEvents.matchId, matchId));

    const { toInsert } = prepareEventBatch(events, {
      storedClientEventIds: known,
      nextSeq: Number(seqRow?.next ?? 0),
    });
    if (toInsert.length === 0) return;

    await tx
      .insert(matchEvents)
      .values(
        toInsert.map((event) => ({
          matchId,
          clientEventId: event.clientEventId,
          type: event.type,
          period: event.period,
          minute: event.minute,
          clockMs: event.clockMs,
          occurredAt: event.occurredAt,
          payload: (event.payload ?? {}) as Record<string, unknown>,
          voidsEventId: event.voidsEventId ?? null,
          createdBy,
          seq: event.seq,
        })),
      )
      // The last line of defence for invariant 6: if the same batch is being ingested twice at the
      // same instant, the loser inserts nothing instead of failing.
      .onConflictDoNothing({ target: matchEvents.clientEventId });
  });
}

async function selectStored(clientEventIds: readonly string[]): Promise<StoredRow[]> {
  if (clientEventIds.length === 0) return [];
  return db
    .select({
      id: matchEvents.id,
      clientEventId: matchEvents.clientEventId,
      seq: matchEvents.seq,
      matchId: matchEvents.matchId,
    })
    .from(matchEvents)
    .where(inArray(matchEvents.clientEventId, [...clientEventIds]));
}

/* -------------------------------------------------------------------------- */
/* What the log implies elsewhere                                             */
/* -------------------------------------------------------------------------- */

async function applyEffects(
  matchId: string,
  actor: Actor,
  status: "scheduled" | "live" | "finished",
  operatorUserId: string | null,
  events: readonly MatchEventInput[],
  stored: readonly StoredRow[],
  effects: { startsMatch: boolean; appliedLineupIds: readonly string[] },
): Promise<void> {
  if (effects.startsMatch && status === "scheduled") {
    // Whoever kicks off owns the match from then on (decision 004), unless a coach has already
    // been named operator — hence the `coalesce`, not an overwrite.
    await db
      .update(matches)
      .set({ status: "live", operatorUserId: operatorUserId ?? actor.userId })
      .where(eq(matches.id, matchId));
  }

  if (effects.appliedLineupIds.length === 0) return;

  const idByClientEventId = new Map(stored.map((row) => [row.clientEventId, row.id]));

  for (const event of events) {
    if (event.type !== "LINEUP_APPLIED") continue;
    const lineupId = (event.payload as { lineupId?: string | null } | undefined)?.lineupId;
    if (!lineupId) continue;
    const eventId = idByClientEventId.get(event.clientEventId);
    if (!eventId) continue;

    // `is null` in the predicate, so a re-POST of the same batch cannot re-point a composition that
    // was already confirmed by an earlier event (decision 006 — the link records what happened).
    await db
      .update(lineups)
      .set({ appliedEventId: eventId })
      .where(
        and(
          eq(lineups.id, lineupId),
          eq(lineups.matchId, matchId),
          isNull(lineups.appliedEventId),
        ),
      );
  }
}

/* -------------------------------------------------------------------------- */
/* Responses                                                                  */
/* -------------------------------------------------------------------------- */

function respond(
  matchId: string,
  events: readonly MatchEventInput[],
  stored: readonly StoredRow[],
): AppendResult {
  const map = new Map(stored.map((row) => [row.clientEventId, { id: row.id, seq: row.seq }]));
  const { events: resolved, missing } = resolveStoredEvents(events, map);

  if (missing.length > 0) {
    // Something was accepted and then not found: never expected, and a lie the outbox would act on
    // by deleting the action. A 500 keeps it queued.
    return fail(500, INGEST_ERRORS.malformed);
  }

  return { ok: true, status: 200, body: { matchId, events: resolved } };
}

function fail(status: AppendFailure["status"], error: string): AppendFailure {
  return { ok: false, status, body: { error } };
}

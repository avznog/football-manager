/**
 * `POST /api/match-events` — the one door into the append-only log.
 *
 * Game mode never calls a Server Action. Every action the coach taps goes into an IndexedDB queue
 * (`lib/match/outbox.ts`) and reaches the server through this endpoint, which is what makes the
 * screen work with no signal: a queue needs something it can retry, and a Server Action invoked
 * from a dead network is not that.
 *
 * The handler itself is deliberately thin — read the session, parse the JSON, delegate. Everything
 * that can be got wrong lives in `lib/match/append.ts` (permissions, idempotency, `seq`) and
 * `lib/match/ingest.ts` (pure, tested).
 *
 * **Retrying is safe**: the same `client_event_id` twice produces one row and the same response
 * (invariant 6). The status codes are the outbox's contract:
 *
 * | Status | Meaning for the queue                                                  |
 * |--------|------------------------------------------------------------------------|
 * | 200    | Stored. Drop the actions from the queue.                               |
 * | 400    | Malformed. Never retry; show the coach.                               |
 * | 401    | Session gone. Never retry; the coach has to log in again.              |
 * | 403    | Not the operator of this match. Never retry.                          |
 * | 404/409| Wrong or closed match. Never retry.                                   |
 * | 5xx    | Our fault, or the database's. Keep the actions and back off.           |
 */

import { getActor } from "@/lib/auth/dal";
import { appendMatchEvents } from "@/lib/match/append";
import { INGEST_ERRORS } from "@/lib/match/ingest";

export async function POST(request: Request): Promise<Response> {
  // `getActor`, not `requireActor`: a redirect to /connexion is useless to a background fetch.
  const actor = await getActor();
  if (!actor) {
    return Response.json({ error: INGEST_ERRORS.unauthenticated }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: INGEST_ERRORS.malformed }, { status: 400 });
  }

  const result = await appendMatchEvents(actor, body);
  return Response.json(result.body, { status: result.status });
}

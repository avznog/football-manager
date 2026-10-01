/**
 * `POST /api/dev/trace` — the owner's iPhone talking to the preview deployment's log stream.
 *
 * The phone that misbehaves is never the machine running the session. A visual viewport that
 * shrinks under the keyboard, a resolved `env(safe-area-inset-bottom)` of `0px` outside standalone
 * mode, a tap that `elementFromPoint` says landed on the wrong element: all of it is observable on
 * the device and nowhere else, and iOS Safari offers no console a session can read. So the capture
 * script on the phone POSTs a batch here, this handler prints it to the server console as one JSON
 * line per entry, and the owner reads it live with `vercel logs`.
 *
 * **Nothing is stored.** No table, no row, no migration — deliberately, and it is the load-bearing
 * part of the design: a diagnostic channel whose removal costs a schema change is a channel nobody
 * removes. Deleting these three files deletes the feature.
 *
 * The handler is thin, like `app/api/match-events/route.ts`: read the environment, parse the JSON,
 * delegate. The gate, the schema and the formatting all live in `lib/dev/trace.ts`, where Vitest can
 * reach them — decision 114's warning about a guard that merely *looks* like a gate applies to
 * exactly this kind of endpoint.
 *
 * ## No session, and no `can()`
 *
 * Invariant 4 says every mutation goes through `can()`. This route performs **no mutation**: it
 * writes no row, reads no row, and touches no database client at all, so there is nothing for
 * `can()` to authorise. And it is unauthenticated on purpose — the traces worth having most are the
 * ones from `/connexion` and `/rejoindre`, where by definition there is no session yet, and a guard
 * that refused them would leave the one screen a new player meets first permanently unobservable.
 *
 * The residual risk, stated plainly rather than argued away: on a preview deployment, anyone who
 * knows the path can write noise into the log stream. It is bounded by the entry cap
 * (`MAX_TRACE_ENTRIES`), by the payload schema's per-field length limits, and by the fact that the
 * output is a log line nobody but the owner reads. On production the endpoint does not exist at all:
 * `isTraceSinkEnabled` is false for `VERCEL_ENV === "production"` and the answer is a 404, which is
 * what an absent route answers too.
 *
 * | Status | Meaning                                                                      |
 * |--------|------------------------------------------------------------------------------|
 * | 200    | Printed. `{ received }` is how many entries reached the log.                  |
 * | 400    | Not JSON, or not this schema. `issues` names the fields. Never retry.         |
 * | 404    | The sink is off — production, or an environment it refuses. Indistinguishable |
 * |        | from the route not being deployed, which is the intent.                       |
 */

import {
  formatTraceLines,
  isTraceSinkEnabled,
  parseTracePayload,
  TRACE_ERRORS,
} from "@/lib/dev/trace";

export async function POST(request: Request): Promise<Response> {
  // Read inside the handler, never at module scope: `next build` imports every route to collect its
  // config, and decision 075 says a build must not depend on the environment being populated.
  const enabled = isTraceSinkEnabled({
    VERCEL_ENV: process.env.VERCEL_ENV,
    NODE_ENV: process.env.NODE_ENV,
  });
  if (!enabled) {
    return Response.json({ error: TRACE_ERRORS.disabled }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: TRACE_ERRORS.malformed }, { status: 400 });
  }

  const parsed = parseTracePayload(body);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error, issues: parsed.issues }, { status: 400 });
  }

  // The sink's whole output. `console.log` and not a logger: the reader is `vercel logs`.
  for (const line of formatTraceLines(parsed.payload)) {
    console.log(line);
  }

  return Response.json({ received: parsed.payload.entries.length }, { status: 200 });
}

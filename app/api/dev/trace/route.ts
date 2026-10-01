/**
 * `/api/dev/trace` — the owner's iPhone talking to the preview deployment's log stream.
 *
 * `POST` takes a capture and prints it. `GET` hands back the capture script itself, so the Safari
 * bookmark is a ~400-character loader instead of a 14 KB `javascript:` URL nobody can verify pasted
 * whole.
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
 * ## No session, and no `can()` — a shared secret instead
 *
 * Invariant 4 says every mutation goes through `can()`. This route performs **no mutation**: it
 * writes no row, reads no row, and touches no database client at all, so there is nothing for
 * `can()` to authorise. And it carries no session on purpose — the traces worth having most are the
 * ones from `/connexion` and `/rejoindre`, where by definition there is no session yet, and a guard
 * that refused them would leave the one screen a new player meets first permanently unobservable.
 *
 * What stands in for a session is a **shared secret**, `TRACE_SECRET`, which the owner sets in
 * Vercel's *preview* environment and nowhere else. The gate is `isTraceRequestAllowed` and it is
 * three conditions, all required: `VERCEL_ENV` is not `production`, `TRACE_SECRET` is set and
 * non-empty, and the request presents exactly it. **Absent secret means disabled** — a deployment
 * somebody forgot to configure is a dead endpoint, never an open one.
 *
 * Both verbs accept the secret two ways. `x-trace-secret` is the real one. `?k=<secret>` exists
 * because a bookmarklet cannot set a header on the `<script src>` it injects, and it is **the weaker
 * form**: a query string lands in the server's access logs and in the browser's history, where a
 * header does not. It is accepted on both verbs rather than only on `GET`, for symmetry — one gate,
 * one way of reading it, no verb-specific branch to get subtly wrong.
 *
 * **Every refusal is a 404 with the same body**, whether the sink is off, misconfigured, or being
 * probed with a wrong key. Not 401, not 403: the endpoint must be indistinguishable from one that was
 * never deployed, and a 403 is a confirmation that there is something there to guess at.
 *
 * | Status | Meaning                                                                       |
 * |--------|-------------------------------------------------------------------------------|
 * | 200    | POST: printed, `{ received }` is how many entries reached the log.             |
 * |        | GET: the capture script, as JavaScript.                                       |
 * | 400    | POST only: not JSON, or not this schema. `issues` names the fields. No retry.  |
 * | 404    | Off, unconfigured, or the wrong secret. Indistinguishable from absent, which   |
 * |        | is the intent.                                                                |
 */

import { CAPTURE_SOURCE } from "@/lib/dev/capture-source";
import {
  formatTraceLines,
  isTraceRequestAllowed,
  parseTracePayload,
  TRACE_ERRORS,
} from "@/lib/dev/trace";

/**
 * The gate, asked once per request.
 *
 * The environment is read **inside** the handler and never at module scope: `next build` imports
 * every route to collect its config, and decision 075 says a build must not depend on the
 * environment being populated.
 */
function allowed(request: Request): boolean {
  const presented =
    request.headers.get("x-trace-secret") ?? new URL(request.url).searchParams.get("k");

  return isTraceRequestAllowed(
    {
      VERCEL_ENV: process.env.VERCEL_ENV,
      NODE_ENV: process.env.NODE_ENV,
      TRACE_SECRET: process.env.TRACE_SECRET,
    },
    presented,
  );
}

/** The one refusal, so « off », « unconfigured » and « wrong key » cannot drift apart. */
function notFound(): Response {
  return Response.json({ error: TRACE_ERRORS.disabled }, { status: 404 });
}

/**
 * `GET` — the capture script, so the bookmark can be a loader.
 *
 * A 14 KB `javascript:` URL has one failure mode that looks exactly like success: a paste Safari
 * truncated. Serving the script instead makes the bookmark `javascript:` plus an injected
 * `<script src="/api/dev/trace?k=…">` — a little over 400 characters, thirty-odd times shorter, and
 * short enough to read end to end in the address field.
 *
 * The source is a **committed constant**, `CAPTURE_SOURCE`, and emphatically not a file read at
 * runtime: `scripts/` is not included in Vercel's serverless bundle, so `readFile` here would work on
 * the owner's machine and 500 on preview — the worst available failure, because it only appears where
 * nobody is holding a debugger. `scripts/iphone-trace/build-bookmarklet.mjs` generates the constant
 * and it is regenerated and committed whenever `capture.js` changes; `lib/dev/trace.test.ts` fails if
 * the two have drifted far enough that the marker is gone.
 *
 * Stated rather than glossed: this does put the capture script's text inside **this route's server
 * bundle**. That is accepted. It is not in any client bundle, it changes no rendered screen, it is
 * invisible to `audit:screens` and it does not touch decision 127 — nothing of it runs unless the
 * owner fetches it with the secret in hand.
 *
 * `no-store`, because a cached stale probe is a trap: the whole value of the tool is that what ran on
 * the phone is what is in `capture.js` right now.
 */
export async function GET(request: Request): Promise<Response> {
  if (!allowed(request)) return notFound();

  return new Response(CAPTURE_SOURCE, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!allowed(request)) return notFound();

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

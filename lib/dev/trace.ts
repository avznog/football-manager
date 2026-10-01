/**
 * The pure half of the iPhone trace sink.
 *
 * Every defect found in waves 3 and 4 was a screen stating something untrue on a phone, and the
 * cheapest review tool in the repo — « actually looked at, at 390 px » — stops being enough the
 * moment the thing that misbehaves is the *device*: Safari's visual viewport under a keyboard, a
 * resolved `env(safe-area-inset-bottom)` that is `0px` outside standalone mode, an unhandled
 * rejection that only ever fires on a real iPhone with a real network. None of that is visible from
 * a desktop browser at 390 px, and none of it reaches a desktop devtools console, because the phone
 * holding the evidence is not the machine running the session.
 *
 * So the owner captures it on the phone, against the **preview** deployment, and POSTs the batch
 * here; the route prints it to the server console and he reads it live with `vercel logs`. That is
 * the whole design, and the part that matters is what it deliberately is **not**: there is no table,
 * no migration, no row. A diagnostic channel that outlives its usefulness by a schema change is a
 * cost the next session pays; one that exists only as a log line disappears the moment the endpoint
 * is deleted.
 *
 * Everything testable lives in this file rather than in the route, because Vitest only collects
 * `lib/**`, `db/**` and root `*.test.ts` — a gate that cannot be unit-tested is a gate that merely
 * *looks* like one (decision 114), and `isTraceSinkEnabled` is exactly the kind of guard that
 * warning is about. It therefore takes its environment as an argument and never reads `process.env`.
 */

import { z } from "zod";

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Whether the sink answers at all, decided from the environment alone.
 *
 * `VERCEL_ENV` is populated automatically by Vercel on every deployment — `production`,
 * `preview` or `development` — so this gate needs **no dashboard change and no new variable**.
 * That is the point: coordination rule 3 reserves infrastructure for the owner, and a diagnostic
 * endpoint is not worth a trip to the dashboard. Off Vercel (a local `next dev`, a Vitest run)
 * `VERCEL_ENV` is absent and `NODE_ENV` decides.
 *
 * Pure, and taking the environment as a parameter, so the production case is a unit test rather
 * than a claim. The one thing it must never do is return `true` when `VERCEL_ENV` is `production`.
 */
export function isTraceSinkEnabled(env: { VERCEL_ENV?: string; NODE_ENV?: string }): boolean {
  if (env.VERCEL_ENV === "production") return false;
  if (env.VERCEL_ENV === "preview" || env.VERCEL_ENV === "development") return true;
  if (env.VERCEL_ENV) return false;
  return env.NODE_ENV !== "production";
}

/* -------------------------------------------------------------------------- */
/* Refusals                                                                   */
/* -------------------------------------------------------------------------- */

/** A sanity ceiling on one POST, named so the capture script can chunk against it. */
export const MAX_TRACE_ENTRIES = 200;

/**
 * Why a batch was refused, in French like every other user-facing string in the repo — even though
 * the only reader is the owner with a bookmarklet, because the rule has no exceptions: French that
 * tutoies, and a decision-128 scan of `lib/` as text finds nothing to correct here.
 *
 * `disabled` is answered with a **404**, not a 403: on production the endpoint must be
 * indistinguishable from one that was never deployed.
 */
export const TRACE_ERRORS = {
  disabled: "Cette route n’existe pas.",
  malformed: "Cette trace est illisible : ce n’est pas du JSON.",
  invalid: "Cette trace ne respecte pas le format attendu.",
  tooLarge: `Cette trace dépasse ${MAX_TRACE_ENTRIES} entrées : découpe-la en plusieurs envois.`,
} as const;

/* -------------------------------------------------------------------------- */
/* The payload contract                                                       */
/* -------------------------------------------------------------------------- */

/** Every entry is stamped with how long after the capture started it happened, in ms. */
const atSchema = z.number().int().min(0).max(24 * 60 * 60 * 1000);

const rectSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

const sizeSchema = z.object({ width: z.number(), height: z.number() });

/**
 * One thing that happened on the phone.
 *
 * A discriminated union on `kind` rather than one loose shape with optional everything, for the
 * same reason `match_events` has typed payloads: the union is what makes a missing `stack` on an
 * `error` a schema failure instead of a line that silently says less than it should.
 *
 * `hit-test` is the member that justifies the whole file. « A confirm button 8 px off the right
 * edge » is a defect no test caught and no screenshot showed; what finds it is asking the phone
 * what `elementFromPoint` actually returns where the owner's thumb lands, and `expected` against
 * `actualTag`/`actualLabel` is that question's answer.
 */
export const traceEntrySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("log"),
    at: atSchema,
    level: z.enum(["log", "info", "warn", "error", "debug"]),
    message: z.string().max(2000),
  }),
  z.object({
    kind: z.literal("error"),
    at: atSchema,
    // Looser than a `log`'s 2000: a thrown value's description is whatever the capture script could
    // make of it, and refusing the one entry that says what broke would be the wrong trade.
    message: z.string().max(4000),
    stack: z.string().max(4000).optional(),
    source: z.string().max(300).optional(),
    line: z.number().int().optional(),
    column: z.number().int().optional(),
  }),
  z.object({
    kind: z.literal("rejection"),
    at: atSchema,
    message: z.string().max(4000),
    stack: z.string().max(4000).optional(),
  }),
  z.object({
    kind: z.literal("hit-test"),
    at: atSchema,
    label: z.string().max(200),
    expected: z.string().max(200),
    actualTag: z.string().max(80),
    actualLabel: z.string().max(200),
    rect: rectSchema,
  }),
  z.object({
    kind: z.literal("note"),
    at: atSchema,
    message: z.string().max(2000),
  }),
]);

export type TraceEntry = z.infer<typeof traceEntrySchema>;

/**
 * What the phone measured about itself.
 *
 * `visualViewport` is nullable because the API does not exist everywhere, and it is here at all
 * because on iOS Safari it is the only honest answer to « where is the bottom of the screen »:
 * `innerHeight` lies while the URL bar is collapsing and while the keyboard is up.
 * `safeAreaBottom` is the *resolved* `env(safe-area-inset-bottom)` in px, read off a probe element,
 * because the value the CSS sees and the value a designer assumes differ outside standalone mode.
 */
export const traceDeviceSchema = z.object({
  ua: z.string().max(400),
  dpr: z.number(),
  screen: sizeSchema,
  viewport: sizeSchema,
  visualViewport: z
    .object({
      width: z.number(),
      height: z.number(),
      offsetTop: z.number(),
      scale: z.number(),
    })
    .nullable(),
  theme: z.enum(["light", "dark"]),
  standalone: z.boolean(),
  safeAreaBottom: z.number(),
});

export type TraceDevice = z.infer<typeof traceDeviceSchema>;

/**
 * One capture, as the bookmarklet POSTs it.
 *
 * `sessionLabel` is free text the owner types into a prompt (« tabbar après compo »): it is the
 * only thing that makes one of fifty log batches findable half an hour later, so it is required
 * rather than optional. `capturedAt` is the *device's* clock, not the server's — same reasoning as
 * decision 004, the thing that observed the event is the thing that timestamps it.
 */
export const tracePayloadSchema = z.object({
  sessionLabel: z.string().trim().min(1).max(80),
  capturedAt: z.iso.datetime({ offset: true }),
  page: z.string().max(300),
  device: traceDeviceSchema,
  entries: z.array(traceEntrySchema).min(1).max(MAX_TRACE_ENTRIES),
});

export type TracePayload = z.infer<typeof tracePayloadSchema>;

export type TraceParseResult =
  | { ok: true; payload: TracePayload }
  | { ok: false; error: string; issues: string[] };

/**
 * Validate a body straight off the wire. The route owns no Zod: the same reason
 * `lib/match/ingest.ts` exists, namely that `safeParse` and its French issue list are testable and
 * a route handler is not.
 *
 * An over-cap batch gets `tooLarge` rather than the generic `invalid`, because it is the one
 * refusal the capture script can act on by itself — split the batch and send twice.
 */
export function parseTracePayload(body: unknown): TraceParseResult {
  const result = tracePayloadSchema.safeParse(body);
  if (result.success) return { ok: true, payload: result.data };

  const entries = (body as { entries?: unknown } | null)?.entries;
  const overCap = Array.isArray(entries) && entries.length > MAX_TRACE_ENTRIES;

  return {
    ok: false,
    error: overCap ? TRACE_ERRORS.tooLarge : TRACE_ERRORS.invalid,
    issues: result.error.issues.map((issue) =>
      issue.path.length > 0 ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The fixed prefix every line carries, so `vercel logs | grep` is the whole reading tool.
 *
 * It has to be a literal the owner can type from memory and that nothing else in the repo emits —
 * a marker that collides with ordinary Next output is a marker that filters nothing.
 */
export const TRACE_MARKER = "[iphone-trace]";

/**
 * The lines to print for one capture: a header, then one per entry, in the order the phone
 * produced them.
 *
 * Two properties are load-bearing and both are asserted in the tests. **Every line is single-line
 * JSON**: a stack trace contains newlines, and a log platform splits on newlines, so an unescaped
 * stack would arrive as fifteen unparseable fragments with the marker on only the first —
 * `JSON.stringify` is what prevents that, not a convenience. And **the function is pure**: it reads
 * no clock and no environment, so « one line per entry plus a header » is a test rather than a hope.
 */
export function formatTraceLines(payload: TracePayload): string[] {
  const { device } = payload;
  const header = {
    t: "header",
    label: payload.sessionLabel,
    capturedAt: payload.capturedAt,
    page: payload.page,
    entries: payload.entries.length,
    theme: device.theme,
    standalone: device.standalone,
    dpr: device.dpr,
    screen: `${device.screen.width}x${device.screen.height}`,
    viewport: `${device.viewport.width}x${device.viewport.height}`,
    visualViewport: device.visualViewport
      ? `${device.visualViewport.width}x${device.visualViewport.height}` +
        `@${device.visualViewport.offsetTop}/${device.visualViewport.scale}`
      : null,
    safeAreaBottom: device.safeAreaBottom,
    ua: device.ua,
  };

  const lines = [line(header)];
  for (const [index, entry] of payload.entries.entries()) {
    lines.push(line({ t: "entry", label: payload.sessionLabel, i: index, ...entry }));
  }
  return lines;
}

/**
 * One log line: the marker, a space, and a JSON object. `JSON.stringify` never emits a raw newline
 * inside a string — it escapes them as `\n` — which is the entire guarantee this helper exists to
 * state in one place.
 */
function line(value: unknown): string {
  return `${TRACE_MARKER} ${JSON.stringify(value)}`;
}

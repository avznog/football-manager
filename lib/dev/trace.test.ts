import { describe, expect, it } from "vitest";

import { CAPTURE_SOURCE } from "./capture-source";
import {
  formatTraceLines,
  isTraceRequestAllowed,
  isTraceSinkEnabled,
  MAX_TRACE_ENTRIES,
  parseTracePayload,
  TRACE_ERRORS,
  TRACE_MARKER,
  traceSecretMatches,
  tracePayloadSchema,
  type TraceEntry,
} from "./trace";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const device = {
  ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15",
  dpr: 3,
  screen: { width: 393, height: 852 },
  viewport: { width: 393, height: 745 },
  visualViewport: { width: 393, height: 408, offsetTop: 0, scale: 1 },
  theme: "dark" as const,
  standalone: true,
  safeAreaBottom: 34,
};

function payload(entries: unknown[]) {
  return {
    sessionLabel: "tabbar après compo",
    capturedAt: "2026-03-14T09:30:00.000Z",
    page: "/match/12/jeu?onglet=terrain",
    device,
    entries,
  };
}

const note: TraceEntry = { kind: "note", at: 0, message: "ouverture de l’écran" };

/* -------------------------------------------------------------------------- */
/* The gate                                                                   */
/* -------------------------------------------------------------------------- */

describe("isTraceSinkEnabled", () => {
  it("refuses production, whatever NODE_ENV says", () => {
    expect(isTraceSinkEnabled({ VERCEL_ENV: "production" })).toBe(false);
    expect(isTraceSinkEnabled({ VERCEL_ENV: "production", NODE_ENV: "development" })).toBe(false);
    expect(isTraceSinkEnabled({ VERCEL_ENV: "production", NODE_ENV: "test" })).toBe(false);
  });

  it("allows preview and Vercel's development environment", () => {
    expect(isTraceSinkEnabled({ VERCEL_ENV: "preview" })).toBe(true);
    expect(isTraceSinkEnabled({ VERCEL_ENV: "development" })).toBe(true);
    expect(isTraceSinkEnabled({ VERCEL_ENV: "preview", NODE_ENV: "production" })).toBe(true);
  });

  it("falls back to NODE_ENV off Vercel, where VERCEL_ENV is absent", () => {
    expect(isTraceSinkEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(isTraceSinkEnabled({ NODE_ENV: "test" })).toBe(true);
    expect(isTraceSinkEnabled({})).toBe(true);
    // `next start` on someone's own machine with no Vercel at all: still production, still off.
    expect(isTraceSinkEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it("refuses an environment name it does not know, rather than guessing", () => {
    expect(isTraceSinkEnabled({ VERCEL_ENV: "staging", NODE_ENV: "development" })).toBe(false);
  });

  it("refuses a padded environment name too, rather than trimming its way to a guess", () => {
    // Unlike `TRACE_SECRET`, `VERCEL_ENV` is written by the platform and never pasted by hand, so
    // there is nothing here to make diagnosable and the honest answer to an unrecognised spelling is
    // still « off ». Asserted rather than assumed, because the one thing this function must never do
    // is let something that reads as production through.
    expect(isTraceSinkEnabled({ VERCEL_ENV: " production ", NODE_ENV: "development" })).toBe(false);
    expect(isTraceSinkEnabled({ VERCEL_ENV: "preview\n", NODE_ENV: "development" })).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The secret                                                                 */
/* -------------------------------------------------------------------------- */

describe("traceSecretMatches", () => {
  it("accepts exactly the expected secret", () => {
    expect(traceSecretMatches("s3cret-de-trace", "s3cret-de-trace")).toBe(true);
  });

  it("fails closed when no secret is configured, which is the whole point", () => {
    expect(traceSecretMatches(undefined, "anything")).toBe(false);
    expect(traceSecretMatches("", "anything")).toBe(false);
    expect(traceSecretMatches(undefined, undefined)).toBe(false);
    // The empty string presented against an unset secret must not read as « both empty, equal ».
    expect(traceSecretMatches("", "")).toBe(false);
  });

  it("treats a whitespace-only secret as never configured, not as a live key", () => {
    // What this guards against is a paste into the Vercel dashboard that landed as a space or a
    // newline: the sink must be dead, the way it is when the variable was never set at all.
    expect(traceSecretMatches(" ", " ")).toBe(false);
    expect(traceSecretMatches("\n", "\n")).toBe(false);
    expect(traceSecretMatches("\t", "\t")).toBe(false);
    expect(traceSecretMatches("  \n ", "  \n ")).toBe(false);
    // And it is the *expected* side that decides: nothing a caller presents can revive it.
    expect(traceSecretMatches(" ", "anything")).toBe(false);
    expect(traceSecretMatches("\n", "")).toBe(false);
  });

  it("trims both sides, because a pasted secret arrives with a trailing newline", () => {
    // Off, unconfigured and wrong-key are one identical 404 by design, so a stray newline would be
    // a symptom the owner has no way to tell from a disabled sink. Hence the trim, on both sides:
    // the corruption lands on whichever one he pasted into.
    expect(traceSecretMatches("s3cret-de-trace\n", "s3cret-de-trace")).toBe(true);
    expect(traceSecretMatches(" s3cret-de-trace ", "s3cret-de-trace")).toBe(true);
    expect(traceSecretMatches("s3cret-de-trace", "s3cret-de-trace\n")).toBe(true);
    expect(traceSecretMatches("s3cret-de-trace", "  s3cret-de-trace\t")).toBe(true);
    expect(traceSecretMatches("\ts3cret-de-trace\n", "\n s3cret-de-trace ")).toBe(true);
  });

  it("trims the ends only: interior whitespace is part of the secret", () => {
    expect(traceSecretMatches("s3cret de trace", "s3cretdetrace")).toBe(false);
    expect(traceSecretMatches("s3cret de trace", "s3cret  de trace")).toBe(false);
    expect(traceSecretMatches("s3cret de trace", "s3cret\tde trace")).toBe(false);
  });

  it("refuses a missing, empty or wrong presentation", () => {
    expect(traceSecretMatches("s3cret-de-trace", undefined)).toBe(false);
    expect(traceSecretMatches("s3cret-de-trace", null)).toBe(false);
    expect(traceSecretMatches("s3cret-de-trace", "")).toBe(false);
    expect(traceSecretMatches("s3cret-de-trace", "s3cret-de-trace-")).toBe(false);
    expect(traceSecretMatches("s3cret-de-trace", "S3cret-de-trace")).toBe(false);
  });

  it("does not throw on a length mismatch, which is what timingSafeEqual would do", () => {
    expect(() => traceSecretMatches("court", "beaucoup plus long")).not.toThrow();
    expect(traceSecretMatches("court", "beaucoup plus long")).toBe(false);
  });

  it("compares bytes and not code units, so a multi-byte secret still works", () => {
    expect(traceSecretMatches("clé-é✓", "clé-é✓")).toBe(true);
    expect(traceSecretMatches("clé-é✓", "cle-e✓")).toBe(false);
  });
});

describe("isTraceRequestAllowed", () => {
  const preview = { VERCEL_ENV: "preview", TRACE_SECRET: "s3cret-de-trace" };

  it("allows a preview deployment presenting the configured secret", () => {
    expect(isTraceRequestAllowed(preview, "s3cret-de-trace")).toBe(true);
  });

  it("refuses production even with the right secret", () => {
    expect(
      isTraceRequestAllowed(
        { VERCEL_ENV: "production", TRACE_SECRET: "s3cret-de-trace" },
        "s3cret-de-trace",
      ),
    ).toBe(false);
  });

  it("refuses an allowed environment with no secret configured", () => {
    expect(isTraceRequestAllowed({ VERCEL_ENV: "preview" }, "s3cret-de-trace")).toBe(false);
    expect(isTraceRequestAllowed({ NODE_ENV: "development" }, "")).toBe(false);
    // Local development is not an exception: unset means off there too.
    expect(isTraceRequestAllowed({ NODE_ENV: "development", TRACE_SECRET: "" }, "x")).toBe(false);
    // A variable holding nothing but a keypress is unset, not configured with a one-space key.
    expect(isTraceRequestAllowed({ VERCEL_ENV: "preview", TRACE_SECRET: " " }, " ")).toBe(false);
    expect(isTraceRequestAllowed({ VERCEL_ENV: "preview", TRACE_SECRET: "\n" }, "\n")).toBe(false);
  });

  it("allows a secret the dashboard stored with a trailing newline", () => {
    // The realistic corruption, end to end: the variable carries what was pasted and the header
    // carries the clean value, and the two still have to agree.
    expect(
      isTraceRequestAllowed(
        { VERCEL_ENV: "preview", TRACE_SECRET: "s3cret-de-trace\n" },
        "s3cret-de-trace",
      ),
    ).toBe(true);
    expect(isTraceRequestAllowed(preview, " s3cret-de-trace ")).toBe(true);
  });

  it("refuses a wrong or absent presentation on an otherwise healthy deployment", () => {
    expect(isTraceRequestAllowed(preview, "autre-chose")).toBe(false);
    expect(isTraceRequestAllowed(preview, null)).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The schema                                                                 */
/* -------------------------------------------------------------------------- */

describe("tracePayloadSchema", () => {
  it("accepts one valid payload of each entry kind", () => {
    const entries: TraceEntry[] = [
      { kind: "log", at: 12, level: "warn", message: "hydration mismatch" },
      {
        kind: "error",
        at: 340,
        message: "undefined is not an object",
        stack: "at GameMode\nat Suspense",
        source: "/_next/static/chunks/app.js",
        line: 1,
        column: 42,
      },
      { kind: "rejection", at: 980, message: "Failed to fetch", stack: "at flushOutbox" },
      {
        kind: "hit-test",
        at: 1400,
        label: "bouton Confirmer",
        expected: "BUTTON Confirmer",
        actualTag: "DIV",
        actualLabel: "overlay",
        rect: { x: 300, y: 740, width: 88, height: 44 },
      },
      note,
    ];

    const result = tracePayloadSchema.safeParse(payload(entries));

    expect(result.success).toBe(true);
    expect(result.success && result.data.entries).toHaveLength(5);
  });

  it("accepts a device with no visualViewport, which is a browser that lacks the API", () => {
    const result = parseTracePayload({
      ...payload([note]),
      device: { ...device, visualViewport: null },
    });

    expect(result.ok).toBe(true);
  });

  it("refuses more entries than the cap, and says so rather than listing a field", () => {
    const tooMany = Array.from({ length: MAX_TRACE_ENTRIES + 1 }, (_, i) => ({
      ...note,
      at: i,
    }));

    const result = parseTracePayload(payload(tooMany));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(TRACE_ERRORS.tooLarge);
  });

  it("accepts exactly the cap, so the limit is inclusive", () => {
    const atCap = Array.from({ length: MAX_TRACE_ENTRIES }, (_, i) => ({ ...note, at: i }));

    expect(parseTracePayload(payload(atCap)).ok).toBe(true);
  });

  it("refuses an unknown kind, naming the path", () => {
    const result = parseTracePayload(payload([{ kind: "screenshot", at: 0 }]));

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toBe(TRACE_ERRORS.invalid);
    expect(result.ok === false && result.issues.join(" ")).toContain("entries.0");
  });

  it("refuses an entry that drops a field its kind requires", () => {
    const result = parseTracePayload(payload([{ kind: "log", at: 0, message: "no level" }]));

    expect(result.ok).toBe(false);
  });

  it("refuses an empty batch and a missing session label", () => {
    expect(parseTracePayload(payload([])).ok).toBe(false);
    expect(parseTracePayload({ ...payload([note]), sessionLabel: "   " }).ok).toBe(false);
  });

  it("refuses a capturedAt that is not an ISO instant", () => {
    expect(parseTracePayload({ ...payload([note]), capturedAt: "14/03/2026" }).ok).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* Formatting                                                                 */
/* -------------------------------------------------------------------------- */

describe("formatTraceLines", () => {
  const entries: TraceEntry[] = [
    { kind: "log", at: 1, level: "info", message: "mounted" },
    // The multi-line stack is the point: a log platform splits on newlines, so this is the case
    // that would arrive as unparseable fragments if the line were not JSON-encoded.
    { kind: "error", at: 2, message: "boom", stack: "at a\nat b\nat c" },
    { kind: "note", at: 3, message: "fin" },
  ];

  const lines = formatTraceLines(tracePayloadSchema.parse(payload(entries)));

  it("emits a header plus exactly one line per entry", () => {
    expect(lines).toHaveLength(entries.length + 1);
  });

  it("prefixes every line with the greppable marker", () => {
    for (const line of lines) {
      expect(line.startsWith(`${TRACE_MARKER} `)).toBe(true);
    }
  });

  it("emits no raw newline, even for a stack that contains two", () => {
    for (const line of lines) {
      expect(line).not.toContain("\n");
      expect(line).not.toContain("\r");
    }
  });

  it("emits valid JSON after the marker, every line", () => {
    for (const line of lines) {
      const json = line.slice(TRACE_MARKER.length + 1);
      expect(() => JSON.parse(json)).not.toThrow();
    }
  });

  it("keeps the stack's newlines as escapes, so the trace survives the round trip", () => {
    const parsed = JSON.parse(lines[2].slice(TRACE_MARKER.length + 1)) as { stack: string };

    expect(parsed.stack).toBe("at a\nat b\nat c");
  });

  it("summarises the capture in the header, label included so one batch is findable", () => {
    const header = JSON.parse(lines[0].slice(TRACE_MARKER.length + 1)) as Record<string, unknown>;

    expect(header.t).toBe("header");
    expect(header.label).toBe("tabbar après compo");
    expect(header.page).toBe("/match/12/jeu?onglet=terrain");
    expect(header.entries).toBe(3);
    expect(header.viewport).toBe("393x745");
    expect(header.theme).toBe("dark");
    expect(header.safeAreaBottom).toBe(34);
  });

  it("carries the label on every entry line, because grep reads one line at a time", () => {
    for (const line of lines.slice(1)) {
      const entry = JSON.parse(line.slice(TRACE_MARKER.length + 1)) as { label: string; i: number };
      expect(entry.label).toBe("tabbar après compo");
      expect(typeof entry.i).toBe("number");
    }
  });
});

/* -------------------------------------------------------------------------- */
/* The served capture source                                                  */
/* -------------------------------------------------------------------------- */

/**
 * `GET /api/dev/trace` serves `CAPTURE_SOURCE`, which is generated from
 * `scripts/iphone-trace/capture.js` by `build-bookmarklet.mjs` and committed. Nothing else in the
 * repo can notice that the two have parted company — the route cannot read `capture.js` at runtime,
 * because `scripts/` is not in Vercel's serverless bundle, which is the reason the constant exists at
 * all.
 *
 * So this is a drift alarm and not a proof: it asserts the constant is there and still looks like the
 * capture script, which catches the two failures that matter — a generator that wrote an empty string,
 * and a hand-edit that gutted it. It deliberately does **not** re-minify `capture.js` and compare: that
 * would make the test a second copy of the build, and a bug in the minifier would then be asserted
 * true rather than caught. The real rule is « rerun the build in the same commit as the edit ».
 */
describe("CAPTURE_SOURCE", () => {
  it("is a non-empty script, and plausibly the whole of it", () => {
    expect(CAPTURE_SOURCE.length).toBeGreaterThan(5000);
  });

  it("still contains the markers that make it the capture script", () => {
    // The idempotence flag the owner types into a tethered Web Inspector, and the one the loader
    // bookmarklet checks before injecting a second copy.
    expect(CAPTURE_SOURCE).toContain("window.__fmTrace");
    // Where it posts, which is this very route.
    expect(CAPTURE_SOURCE).toContain('const ENDPOINT = "/api/dev/trace"');
    // The header that carries the shared secret: without it every POST would come back 404.
    expect(CAPTURE_SOURCE).toContain("x-trace-secret");
    // The hit test is the member that justifies the whole tool.
    expect(CAPTURE_SOURCE).toContain("elementFromPoint");
  });

  it("bakes in no secret: the key reaches the shim from outside", () => {
    expect(CAPTURE_SOURCE).toContain("window.__fmTraceKey");
    // It may only ever *read* the global. `=` and not `===`, so the `typeof … === "string"` test the
    // shim does on it is not mistaken for an assignment.
    expect(CAPTURE_SOURCE).not.toMatch(/__fmTraceKey\s*=[^=]/);
  });

  it("carries no comment block, so what is served is what the minifier produced", () => {
    expect(CAPTURE_SOURCE.startsWith("(function ()")).toBe(true);
  });
});

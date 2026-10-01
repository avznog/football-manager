import { describe, expect, it } from "vitest";

import {
  formatTraceLines,
  isTraceSinkEnabled,
  MAX_TRACE_ENTRIES,
  parseTracePayload,
  TRACE_ERRORS,
  TRACE_MARKER,
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

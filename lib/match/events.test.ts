import { describe, expect, it } from "vitest";

import { matchEventType } from "@/db/schema";

import {
  EVENT_LABELS_FR,
  MATCH_EVENT_PAYLOAD_SCHEMAS,
  MATCH_EVENT_TYPES,
  MAX_CLOCK_MS,
  canBeVoided,
  compareMatchEvents,
  eventLabelFr,
  isClockEvent,
  isScoringEvent,
  matchEventBatchSchema,
  matchEventInputSchema,
  parseMatchEventPayload,
} from "./events";

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

describe("the event vocabulary", () => {
  it("is exactly the Postgres enum, at runtime as well as at compile time", () => {
    // The compile-time proof is `MATCH_EVENT_TYPES_MATCH_THE_DATABASE`; this catches a *reordering*,
    // which the type system cannot see and which would silently change nothing today but would
    // matter to anything that indexes by position.
    expect([...MATCH_EVENT_TYPES]).toEqual([...matchEventType.enumValues]);
  });

  it("has a French label for every type, with typographic apostrophes", () => {
    for (const type of MATCH_EVENT_TYPES) {
      const label = eventLabelFr(type);
      expect(label.length).toBeGreaterThan(0);
      expect(label).not.toContain("'");
    }
    expect(Object.keys(EVENT_LABELS_FR)).toHaveLength(MATCH_EVENT_TYPES.length);
    expect(EVENT_LABELS_FR.KICKOFF).toBe("Coup d’envoi");
  });

  it("knows which events move the score and which drive the clock", () => {
    expect(isScoringEvent("OWN_GOAL")).toBe(true);
    expect(isScoringEvent("PENALTY_SCORED")).toBe(true);
    // A missed penalty is not a scoring event: nothing changes on the board.
    expect(isScoringEvent("PENALTY_MISSED")).toBe(false);
    expect(isClockEvent("PAUSE")).toBe(true);
    expect(isClockEvent("GOAL_FOR")).toBe(false);
  });

  it("refuses to void a void", () => {
    expect(canBeVoided("GOAL_FOR")).toBe(true);
    expect(canBeVoided("VOID")).toBe(false);
  });
});

describe("payload parsing", () => {
  it("reads a clock event with no payload at all", () => {
    // The column defaults to '{}', and a synthesised event may carry nothing.
    expect(parseMatchEventPayload("KICKOFF", undefined)).toEqual({ ok: true, payload: {} });
    expect(parseMatchEventPayload("FINAL_WHISTLE", null)).toEqual({ ok: true, payload: {} });
  });

  it("accepts a goal with no scorer — an opponent's own goal in our favour", () => {
    const parsed = parseMatchEventPayload("GOAL_FOR", {});
    expect(parsed.ok).toBe(true);
  });

  it("still demands a scorer for a penalty and for an own goal", () => {
    expect(parseMatchEventPayload("PENALTY_SCORED", {}).ok).toBe(false);
    expect(parseMatchEventPayload("OWN_GOAL", {}).ok).toBe(false);
  });

  it("is lenient about the shape of an id by default, and strict at the ingestion boundary", () => {
    // The reducer must never refuse to read a log Postgres has already accepted.
    expect(parseMatchEventPayload("FOUL", { memberId: "thomas" }).ok).toBe(true);
    expect(parseMatchEventPayload("FOUL", { memberId: "thomas" }, { strict: true }).ok).toBe(false);
    expect(parseMatchEventPayload("FOUL", { memberId: UUID_A }, { strict: true }).ok).toBe(true);
  });

  it("rejects an empty id in both strictnesses", () => {
    expect(parseMatchEventPayload("FOUL", { memberId: "" }).ok).toBe(false);
    expect(parseMatchEventPayload("FOUL", { memberId: "   " }).ok).toBe(false);
  });

  it("reports which field is wrong, so an anomaly can name it", () => {
    const parsed = parseMatchEventPayload("SUBSTITUTION", { outId: "leo" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.issues.join(" ")).toContain("inId");
  });

  it("accepts a substitution without a slot — « Momo pour Julien »", () => {
    expect(parseMatchEventPayload("SUBSTITUTION", { outId: "julien", inId: "momo" }).ok).toBe(true);
  });

  it("needs a whole team in a LINEUP_APPLIED, and a lineup id only when there is one", () => {
    expect(
      parseMatchEventPayload("LINEUP_APPLIED", { slots: [{ slotId: "s1", memberId: "hugo" }] }).ok,
    ).toBe(true);
    // An ad-hoc change on the touchline corresponds to no row in `lineups`.
    expect(
      parseMatchEventPayload("LINEUP_APPLIED", {
        lineupId: null,
        slots: [{ slotId: "s1", memberId: "hugo" }],
      }).ok,
    ).toBe(true);
    expect(parseMatchEventPayload("LINEUP_APPLIED", { slots: [] }).ok).toBe(false);
  });

  it("keeps an optional pause reason but does not require it", () => {
    expect(parseMatchEventPayload("PAUSE", { reason: "joueur au sol" })).toEqual({
      ok: true,
      payload: { reason: "joueur au sol" },
    });
    expect(parseMatchEventPayload("PAUSE", {}).ok).toBe(true);
  });

  it("requires a comment to say something, and lets it name a player or nobody", () => {
    expect(parseMatchEventPayload("COMMENT", { note: "  Mur mal placé  " })).toEqual({
      ok: true,
      payload: { note: "Mur mal placé" },
    });
    expect(parseMatchEventPayload("COMMENT", { note: "Trop haut", memberId: UUID_B }).ok).toBe(true);
    // A note that is only whitespace is not a note: `trim()` empties it and `min(1)` refuses it.
    expect(parseMatchEventPayload("COMMENT", { note: "   " }).ok).toBe(false);
    expect(parseMatchEventPayload("COMMENT", {}).ok).toBe(false);
    expect(parseMatchEventPayload("COMMENT", { note: "x".repeat(280) }).ok).toBe(true);
    expect(parseMatchEventPayload("COMMENT", { note: "x".repeat(281) }).ok).toBe(false);
    // Strict at the boundary: the member reference has to be a real id.
    expect(
      parseMatchEventPayload("COMMENT", { note: "Trop haut", memberId: "karim" }, { strict: true }).ok,
    ).toBe(false);
  });

  it("exposes one schema per event type, so nothing can be added without a payload definition", () => {
    for (const type of MATCH_EVENT_TYPES) {
      expect(MATCH_EVENT_PAYLOAD_SCHEMAS[type]).toBeDefined();
    }
  });
});

describe("the ingestion envelope", () => {
  const base = {
    clientEventId: UUID_A,
    type: "GOAL_FOR" as const,
    period: 1,
    minute: 11,
    clockMs: 660_000,
    occurredAt: "2026-04-11T10:11:00.000Z",
    payload: { scorerId: UUID_B, assistId: UUID_C },
  };

  it("accepts a well-formed event and coerces the numbers a form submits as strings", () => {
    const parsed = matchEventInputSchema.safeParse({ ...base, period: "1", clockMs: "660000" });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.clockMs).toBe(660_000);
    expect(parsed.data.occurredAt).toBeInstanceOf(Date);
  });

  it("validates the payload against the event type, in French", () => {
    const parsed = matchEventInputSchema.safeParse({
      ...base,
      type: "PENALTY_SCORED",
      payload: {},
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues[0].message).toContain("Contenu invalide");
  });

  it("requires a target on a VOID and forbids one anywhere else", () => {
    expect(
      matchEventInputSchema.safeParse({ ...base, type: "VOID", payload: {} }).success,
    ).toBe(false);
    expect(
      matchEventInputSchema.safeParse({
        ...base,
        type: "VOID",
        payload: {},
        voidsEventId: UUID_C,
      }).success,
    ).toBe(true);
    expect(matchEventInputSchema.safeParse({ ...base, voidsEventId: UUID_C }).success).toBe(false);
  });

  it("guards against a runaway device clock", () => {
    expect(matchEventInputSchema.safeParse({ ...base, clockMs: MAX_CLOCK_MS + 1 }).success).toBe(
      false,
    );
    expect(matchEventInputSchema.safeParse({ ...base, minute: -1 }).success).toBe(false);
  });

  it("takes a batch, because the outbox flushes several events at once", () => {
    expect(matchEventBatchSchema.safeParse({ matchId: UUID_C, events: [base] }).success).toBe(true);
    expect(matchEventBatchSchema.safeParse({ matchId: UUID_C, events: [] }).success).toBe(false);
  });
});

describe("ordering", () => {
  it("sorts by match time, not by insertion order", () => {
    const events = [
      { id: "b", clockMs: 2_400_000, seq: 2 },
      { id: "a", clockMs: 660_000, seq: 9 },
    ];
    expect([...events].sort(compareMatchEvents).map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("breaks a tie at the same match time with seq — the 55′ chain depends on it", () => {
    const positionChange = { id: "z", clockMs: 3_300_000, seq: 14 };
    const substitution = { id: "a", clockMs: 3_300_000, seq: 15 };
    expect([substitution, positionChange].sort(compareMatchEvents).map((e) => e.id)).toEqual([
      "z",
      "a",
    ]);
  });

  it("is total, so the sort is deterministic even without seq", () => {
    const a = { id: "a", clockMs: 0 };
    const b = { id: "b", clockMs: 0 };
    expect(compareMatchEvents(a, b)).toBeLessThan(0);
    expect(compareMatchEvents(b, a)).toBeGreaterThan(0);
    expect(compareMatchEvents(a, a)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";

import { ratingWindow } from "./window";

const NOW = Date.UTC(2026, 8, 22, 18, 0, 0);
const HOUR = 3_600_000;

describe("ratingWindow", () => {
  it("is open once the match is finished and no next match has started", () => {
    expect(
      ratingWindow({ finished: true, nextKickoffAtMs: NOW + 48 * HOUR, nowMs: NOW }),
    ).toMatchObject({ state: "open", isOpen: true, closesAtMs: NOW + 48 * HOUR });
  });

  it("is open with no next match on the calendar at all", () => {
    expect(ratingWindow({ finished: true, nextKickoffAtMs: null, nowMs: NOW })).toMatchObject({
      state: "open",
      isOpen: true,
      closesAtMs: null,
    });
  });

  it("closes at the next kick-off", () => {
    expect(ratingWindow({ finished: true, nextKickoffAtMs: NOW - 1, nowMs: NOW })).toMatchObject({
      state: "closed",
      isOpen: false,
    });
  });

  it("treats the kick-off instant itself as closed", () => {
    // Strict at the boundary, so the state cannot flip with millisecond jitter.
    expect(ratingWindow({ finished: true, nextKickoffAtMs: NOW, nowMs: NOW }).state).toBe("closed");
  });

  it("stays open a minute before the next kick-off", () => {
    expect(
      ratingWindow({ finished: true, nextKickoffAtMs: NOW + 60_000, nowMs: NOW }).isOpen,
    ).toBe(true);
  });

  it("is not open before the final whistle, whatever the calendar says", () => {
    expect(
      ratingWindow({ finished: false, nextKickoffAtMs: NOW + 48 * HOUR, nowMs: NOW }),
    ).toMatchObject({ state: "not-yet", isOpen: false });
    expect(ratingWindow({ finished: false, nextKickoffAtMs: null, nowMs: NOW }).isOpen).toBe(false);
  });

  it("an unfinished match whose successor has kicked off is still 'not-yet', never 'open'", () => {
    // A match left in `live` by mistake: it must not become rateable just because time passed.
    expect(ratingWindow({ finished: false, nextKickoffAtMs: NOW - HOUR, nowMs: NOW }).state).toBe(
      "not-yet",
    );
  });
});

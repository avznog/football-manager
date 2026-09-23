import { describe, expect, it } from "vitest";

import { ratingDeadlineFr, ratingWindow } from "./window";

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

describe("ratingDeadlineFr", () => {
  /**
   * The whole point: `closesAtMs` existed from the first day and no screen read it, so the app
   * enforced a deadline it never named. NOW is 20:00 in Paris on 22 September 2026, so a window
   * shutting 48 hours later shuts on the Thursday evening.
   */
  it("names the instant the window shuts", () => {
    expect(ratingDeadlineFr(NOW + 48 * HOUR, NOW)).toBe(
      "À finir avant le coup d’envoi du match suivant, jeudi 24/09/2026 à 20:00 : après, les " +
        "notes de ce match ne bougent plus et tu ne verras pas celles de l’équipe.",
    );
  });

  /** Both halves of what missing it costs — the notes freeze, *and* the others stay hidden. */
  it("says what happens after, not only when", () => {
    const sentence = ratingDeadlineFr(NOW + 48 * HOUR, NOW);
    expect(sentence).toContain("ne bougent plus");
    expect(sentence).toContain("tu ne verras pas celles de l’équipe");
  });

  /**
   * A deadline the reader can place against tonight, not a date he has to count days from — and
   * the digits alongside it, so the sentence stays true in a screenshot read the next morning.
   */
  it("uses the relative day when the next match is tomorrow, with the date behind it", () => {
    expect(ratingDeadlineFr(NOW + 24 * HOUR, NOW)).toBe(
      "À finir avant le coup d’envoi du match suivant, demain, 23/09/2026 à 20:00 : après, les " +
        "notes de ce match ne bougent plus et tu ne verras pas celles de l’équipe.",
    );
  });

  /**
   * No fixture after this one: the window genuinely has no end, so there is nothing to warn about.
   * Inventing « pas de date limite » would be a claim that stops being true the moment the coach
   * adds a match.
   */
  it("says nothing when no next match is scheduled", () => {
    expect(ratingDeadlineFr(null, NOW)).toBeNull();
  });

  /**
   * Printing a deadline that has already gone by is exactly the defect this function exists to
   * remove. The closed screens say so in their own words.
   */
  it("says nothing once the deadline has passed", () => {
    expect(ratingDeadlineFr(NOW - HOUR, NOW)).toBeNull();
    expect(ratingDeadlineFr(NOW, NOW)).toBeNull();
  });

  /** The same boundary as `ratingWindow`: open a minute before, so the two never disagree. */
  it("still warns a minute before the kick-off, while the window is open", () => {
    expect(ratingWindow({ finished: true, nextKickoffAtMs: NOW + 60_000, nowMs: NOW }).isOpen).toBe(
      true,
    );
    expect(ratingDeadlineFr(NOW + 60_000, NOW)).not.toBeNull();
  });
});

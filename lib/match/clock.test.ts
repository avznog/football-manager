import { describe, expect, it } from "vitest";

import {
  type ClockAnchor,
  DEFAULT_PERIODS,
  IDLE_CLOCK_ANCHOR,
  MS_PER_MINUTE,
  type PlayInterval,
  clockMsToMinute,
  clockMsWithinPeriod,
  formatClock,
  formatMinuteFr,
  formatMinuteLabelFr,
  minuteToClockMs,
  msToWholeMinutes,
  periodEndMs,
  periodOfClockMs,
  periodStartMs,
  periodsConfig,
  playedMsBetween,
  projectClockMs,
  readClock,
  regulationMinutes,
  regulationMs,
  resolveClockMs,
  toEpochMs,
} from "./clock";

const TWO_THIRTY = DEFAULT_PERIODS;
const THREE_TWENTY = { periodsCount: 3, periodMinutes: 20 };

describe("periodsConfig", () => {
  it("defaults to 2×30", () => {
    expect(periodsConfig()).toEqual({ periodsCount: 2, periodMinutes: 30 });
    expect(periodsConfig(null)).toEqual({ periodsCount: 2, periodMinutes: 30 });
    // A column that was not selected must not produce NaN minutes.
    expect(periodsConfig({ periodsCount: null, periodMinutes: null })).toEqual(TWO_THIRTY);
  });

  it("takes whatever the match says", () => {
    expect(periodsConfig(THREE_TWENTY)).toEqual(THREE_TWENTY);
    expect(regulationMinutes(THREE_TWENTY)).toBe(60);
    expect(regulationMs(TWO_THIRTY)).toBe(3_600_000);
  });

  it("ignores nonsense rather than propagating it", () => {
    expect(periodsConfig({ periodsCount: 0, periodMinutes: Number.NaN })).toEqual(TWO_THIRTY);
  });
});

describe("continuous minutes", () => {
  it("starts the second half where the first ended (decision 009)", () => {
    expect(periodStartMs(1, TWO_THIRTY)).toBe(0);
    expect(periodStartMs(2, TWO_THIRTY)).toBe(30 * MS_PER_MINUTE);
    expect(periodEndMs(2, TWO_THIRTY)).toBe(60 * MS_PER_MINUTE);
    // Never a reset clock: the 31st minute of the match is 30′, not 0′.
    expect(clockMsToMinute(periodStartMs(2, TWO_THIRTY))).toBe(30);
  });

  it("chains three periods too", () => {
    expect(periodStartMs(3, THREE_TWENTY)).toBe(40 * MS_PER_MINUTE);
    expect(periodEndMs(3, THREE_TWENTY)).toBe(60 * MS_PER_MINUTE);
  });

  it("puts a boundary in the period that is starting, and never invents a period", () => {
    expect(periodOfClockMs(0, TWO_THIRTY)).toBe(1);
    expect(periodOfClockMs(30 * MS_PER_MINUTE - 1, TWO_THIRTY)).toBe(1);
    expect(periodOfClockMs(30 * MS_PER_MINUTE, TWO_THIRTY)).toBe(2);
    // Stoppage time at the end of the last period stays in the last period.
    expect(periodOfClockMs(62 * MS_PER_MINUTE, TWO_THIRTY)).toBe(2);
  });

  it("reports the time elapsed inside a period when asked", () => {
    expect(clockMsWithinPeriod(38 * MS_PER_MINUTE, 2, TWO_THIRTY)).toBe(8 * MS_PER_MINUTE);
  });
});

describe("converting elapsed milliseconds to a display", () => {
  it("floors the minute, so the kick-off is 0′ and a goal at 10′30″ is 10′", () => {
    expect(clockMsToMinute(0)).toBe(0);
    expect(clockMsToMinute(630_000)).toBe(10);
    expect(clockMsToMinute(659_999)).toBe(10);
    expect(clockMsToMinute(660_000)).toBe(11);
  });

  it("is invertible at whole minutes", () => {
    expect(minuteToClockMs(38)).toBe(2_280_000);
    expect(clockMsToMinute(minuteToClockMs(38))).toBe(38);
  });

  it("never returns a negative clock", () => {
    expect(clockMsToMinute(-5_000)).toBe(0);
    expect(formatClock(-5_000)).toBe("00:00");
  });

  it("renders mm:ss for the big clock", () => {
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(59_999)).toBe("00:59");
    expect(formatClock(2_285_000)).toBe("38:05");
    // Past the hour the minutes simply keep counting: 60:00, not 1:00:00.
    expect(formatClock(60 * MS_PER_MINUTE)).toBe("60:00");
  });

  it("uses the typographic prime, never an ASCII quote", () => {
    expect(formatMinuteFr(12)).toBe("12’");
    expect(formatMinuteFr(12)).not.toContain("'");
  });

  it("labels stoppage time the way football does", () => {
    expect(formatMinuteLabelFr(24 * MS_PER_MINUTE, 1, TWO_THIRTY)).toBe("24’");
    expect(formatMinuteLabelFr(30 * MS_PER_MINUTE, 1, TWO_THIRTY)).toBe("30’");
    // 31′10″ of a first half is 30’+2, not 31’ — which would read as the second half.
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE + 10_000, 1, TWO_THIRTY)).toBe("30’+2");
    // The same instant recorded as the second period is simply 31′.
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE, 2, TWO_THIRTY)).toBe("31’");
  });
});

describe("projecting a running clock", () => {
  const anchor: ClockAnchor = {
    phase: "running",
    period: 2,
    clockMs: 38 * MS_PER_MINUTE,
    anchoredAtMs: 1_000_000,
    running: true,
  };

  it("advances with the wall clock while the game is running", () => {
    expect(projectClockMs(anchor, 1_000_000 + 90_000)).toBe(38 * MS_PER_MINUTE + 90_000);
  });

  it("freezes while paused — that is the whole point of a pause", () => {
    const paused: ClockAnchor = { ...anchor, phase: "paused", running: false };
    expect(projectClockMs(paused, 1_000_000 + 600_000)).toBe(38 * MS_PER_MINUTE);
  });

  it("never runs backwards when a device clock is behind the server's", () => {
    expect(projectClockMs(anchor, 900_000)).toBe(38 * MS_PER_MINUTE);
  });

  it("ignores a missing now, so a server render without a clock is still correct", () => {
    expect(projectClockMs(anchor)).toBe(38 * MS_PER_MINUTE);
    expect(projectClockMs(anchor, null)).toBe(38 * MS_PER_MINUTE);
    expect(projectClockMs(IDLE_CLOCK_ANCHOR, 5_000_000)).toBe(0);
  });

  it("reads out everything the clock component needs at once", () => {
    const reading = readClock(anchor, TWO_THIRTY, 1_000_000 + 60_000);
    expect(reading).toMatchObject({
      period: 2,
      minute: 39,
      clock: "39:00",
      label: "39’",
      running: true,
      remainingMs: 21 * MS_PER_MINUTE,
      stoppageMs: 0,
      awaitingFinalWhistle: false,
    });
  });

  it("shows stoppage time rather than capping the clock at the end of the period", () => {
    const late: ClockAnchor = { ...anchor, clockMs: 62 * MS_PER_MINUTE };
    const reading = readClock(late, TWO_THIRTY);
    expect(reading.stoppageMs).toBe(2 * MS_PER_MINUTE);
    expect(reading.remainingMs).toBe(0);
    expect(reading.label).toBe("60’+2");
  });

  it("knows when it is waiting for the final whistle", () => {
    const atTheEnd: ClockAnchor = {
      phase: "break",
      period: 2,
      clockMs: 60 * MS_PER_MINUTE,
      anchoredAtMs: 1_000_000,
      running: false,
    };
    expect(readClock(atTheEnd, TWO_THIRTY).awaitingFinalWhistle).toBe(true);
    // Half-time of the same match is a break too, but nobody is waiting to whistle.
    expect(readClock({ ...atTheEnd, period: 1 }, TWO_THIRTY).awaitingFinalWhistle).toBe(false);
  });
});

describe("reading a logged event's clock position", () => {
  it("trusts clock_ms", () => {
    expect(resolveClockMs({ clockMs: 2_280_000, minute: 11 })).toBe(2_280_000);
  });

  it("falls back to the minute for a retro-entered event that has no milliseconds", () => {
    expect(resolveClockMs({ clockMs: null, minute: 38 })).toBe(2_280_000);
    expect(resolveClockMs({})).toBe(0);
  });

  it("accepts every shape a timestamp arrives in", () => {
    const epoch = Date.UTC(2026, 3, 11, 10, 0, 0);
    expect(toEpochMs(new Date("2026-04-11T10:00:00.000Z"))).toBe(epoch);
    expect(toEpochMs("2026-04-11T10:00:00.000Z")).toBe(epoch);
    expect(toEpochMs(epoch)).toBe(epoch);
    expect(toEpochMs(null)).toBeNull();
    expect(toEpochMs("not a date")).toBeNull();
    expect(toEpochMs(new Date("nonsense"))).toBeNull();
  });
});

describe("intervals of real play", () => {
  /** A 2×30 with a pause from 10′ to 10′ of match time (a pause consumes no match time). */
  const intervals: PlayInterval[] = [
    { period: 1, startMs: 0, endMs: 30 * MS_PER_MINUTE },
    { period: 2, startMs: 30 * MS_PER_MINUTE, endMs: 60 * MS_PER_MINUTE },
  ];

  it("credits a player across half-time without the break", () => {
    // 20′ → 40′ is 20 minutes of football, whatever the referee did with the oranges.
    expect(playedMsBetween(intervals, 20 * MS_PER_MINUTE, 40 * MS_PER_MINUTE, 0)).toBe(
      20 * MS_PER_MINUTE,
    );
  });

  it("gives nothing for a window entirely outside play", () => {
    const firstHalfOnly: PlayInterval[] = [{ period: 1, startMs: 0, endMs: 30 * MS_PER_MINUTE }];
    expect(playedMsBetween(firstHalfOnly, 40 * MS_PER_MINUTE, 50 * MS_PER_MINUTE, 0)).toBe(0);
    expect(playedMsBetween(intervals, 20 * MS_PER_MINUTE, 20 * MS_PER_MINUTE, 0)).toBe(0);
    expect(playedMsBetween(intervals, 20 * MS_PER_MINUTE, 10 * MS_PER_MINUTE, 0)).toBe(0);
  });

  it("closes an open interval at the caller's boundary — a live match", () => {
    const live: PlayInterval[] = [{ period: 1, startMs: 0, endMs: null }];
    expect(playedMsBetween(live, 0, 30 * MS_PER_MINUTE, 12 * MS_PER_MINUTE)).toBe(
      12 * MS_PER_MINUTE,
    );
  });

  it("skips a paused stretch, so a frozen clock hands out no minutes", () => {
    const paused: PlayInterval[] = [
      { period: 1, startMs: 0, endMs: 10 * MS_PER_MINUTE },
      { period: 1, startMs: 10 * MS_PER_MINUTE, endMs: 30 * MS_PER_MINUTE },
    ];
    expect(playedMsBetween(paused, 0, 30 * MS_PER_MINUTE, 0)).toBe(30 * MS_PER_MINUTE);
  });
});

describe("msToWholeMinutes", () => {
  it("rounds, so a bench player's season is neither inflated nor erased", () => {
    // 2 minutes and 10 seconds is 2; 2 minutes 40 is 3.
    expect(msToWholeMinutes(130_000)).toBe(2);
    expect(msToWholeMinutes(160_000)).toBe(3);
    expect(msToWholeMinutes(0)).toBe(0);
    expect(msToWholeMinutes(-1)).toBe(0);
  });
});

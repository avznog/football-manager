import { describe, expect, it } from "vitest";

import {
  type ClockAnchor,
  DEFAULT_PERIODS,
  IDLE_CLOCK_ANCHOR,
  MS_PER_MINUTE,
  type PlayInterval,
  actualPeriodStarts,
  clockMsToMinute,
  clockMsWithinPeriod,
  periodElapsedMs,
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

  it("labels a minute by the football played, in either half (decision 213)", () => {
    expect(formatMinuteLabelFr(24 * MS_PER_MINUTE)).toBe("24’");
    expect(formatMinuteLabelFr(30 * MS_PER_MINUTE)).toBe("30’");
    // 31′10″ of a first half let run long is « 31’ ». Decision 209 wrote « 30’+2 » here, and the
    // owner could not tell it from the second half's own « 30’+2 ».
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE + 10_000)).toBe("31’");
    // The same instant is the same label whatever period it was recorded as, which is the point.
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE)).toBe("31’");
  });
});

/*
 * The behaviour the owner asked for on 2026-10-27 (decision 213), after a fortnight of decision 209's
 * period-relative labels: one minute per moment, counted from the kick-off of the match, with the
 * stopped time left out. « 10’ » ten minutes in; « 31’ » for a first half let run past 30; « 35’ » one
 * minute into a second half that kicked off at 34′.
 */
describe("a period that ran past its nominal end", () => {
  const LATE_END = 33 * MS_PER_MINUTE + 40 * 1_000;

  it("labels every moment by the football played, whatever period it falls in", () => {
    // The first half let run to 33′40″: « 33’ », not « 30’+4 ».
    expect(formatMinuteLabelFr(LATE_END)).toBe("33’");
    // The second half's kick-off is stored at that same instant and reads the same, because it is the
    // same moment of the afternoon. Decision 209 gave these two « 30’+4 » and « 30’ ».
    expect(formatMinuteLabelFr(LATE_END)).toBe("33’");
    // The owner's own example: one minute into a second half that kicked off at 34′.
    expect(formatMinuteLabelFr(34 * MS_PER_MINUTE + 60_000)).toBe("35’");
    // Eight minutes into the late second half: 41′40″ played, « 41’ ».
    expect(formatMinuteLabelFr(LATE_END + 8 * MS_PER_MINUTE)).toBe("41’");
  });

  it("takes no period at all, which is the property the old scheme lacked", () => {
    // One argument. There is no second reading of the same millisecond to disagree with.
    expect(formatMinuteLabelFr(0)).toBe("0’");
    expect(formatMinuteLabelFr(10 * MS_PER_MINUTE)).toBe("10’");
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE)).toBe("31’");
    expect(formatMinuteLabelFr(60 * MS_PER_MINUTE)).toBe("60’");
    // Seconds floor, as they always did: the 31st minute starts at 31′00″ and lasts until 31′59″.
    expect(formatMinuteLabelFr(31 * MS_PER_MINUTE + 59_000)).toBe("31’");
  });

  it("measures the current period from where it actually began", () => {
    // The header's second figure, and the only period-relative number left in the app.
    expect(periodElapsedMs(LATE_END, LATE_END)).toBe(0);
    expect(periodElapsedMs(LATE_END + 13 * MS_PER_MINUTE, LATE_END)).toBe(13 * MS_PER_MINUTE);
    // The first half, which began at 0: the period clock and the match clock are the same number.
    expect(periodElapsedMs(24 * MS_PER_MINUTE, 0)).toBe(24 * MS_PER_MINUTE);
  });

  it("falls back to the whole clock when nobody knows where the period began", () => {
    // Right for the first period, and the safest answer for any caller without an anchor.
    expect(periodElapsedMs(24 * MS_PER_MINUTE)).toBe(24 * MS_PER_MINUTE);
    expect(periodElapsedMs(24 * MS_PER_MINUTE, null)).toBe(24 * MS_PER_MINUTE);
    expect(periodElapsedMs(24 * MS_PER_MINUTE, Number.NaN)).toBe(24 * MS_PER_MINUTE);
  });

  it("never counts the period backwards", () => {
    // A period recorded as starting after the clock it is read at reads 0, not a negative.
    expect(periodElapsedMs(10 * MS_PER_MINUTE, LATE_END)).toBe(0);
    expect(periodElapsedMs(-5_000, 0)).toBe(0);
  });

  it("takes each period's real start from the intervals the reducer already builds", () => {
    const starts = actualPeriodStarts([
      { period: 1, startMs: 0, endMs: 12 * MS_PER_MINUTE },
      // A pause inside the first half: a second interval for the same period, not a new start.
      { period: 1, startMs: 12 * MS_PER_MINUTE, endMs: LATE_END },
      { period: 2, startMs: LATE_END, endMs: null },
    ]);
    expect(starts.get(1)).toBe(0);
    expect(starts.get(2)).toBe(LATE_END);
    // A period nobody kicked off has no entry, and the lookup then falls back to the nominal start.
    expect(starts.get(3)).toBeUndefined();
    expect(actualPeriodStarts([]).size).toBe(0);
  });
});

/*
 * The header the owner asked for: the whole match's clock, and the current period's beside it.
 * « at the 45 mn of the game ... 45' of the game and 13' for the second half (if the first lasted 32) »
 */
describe("the two clocks in game mode's header", () => {
  const FIRST_HALF_RAN = 32 * MS_PER_MINUTE;

  const inSecondHalf = (playedMs: number): ClockAnchor => ({
    phase: "running",
    period: 2,
    clockMs: playedMs,
    periodStartedAtMs: FIRST_HALF_RAN,
    anchoredAtMs: null,
    running: false,
  });

  it("shows the match at 45′ and the second period at 13′", () => {
    const reading = readClock(inSecondHalf(45 * MS_PER_MINUTE), TWO_THIRTY);
    expect(reading.minute).toBe(45);
    expect(reading.clock).toBe("45:00");
    expect(reading.label).toBe("45’");
    expect(reading.periodMinute).toBe(13);
    expect(reading.periodClock).toBe("13:00");
    expect(reading.periodLabel).toBe("13’");
    // 32 + 13 = 45: the two figures are one number read two ways, never two measurements.
    expect(reading.periodClockMs + FIRST_HALF_RAN).toBe(reading.clockMs);
  });

  it("measures what is left against this period's own length, not the match's nominal end", () => {
    // The second half of a 2×30 that kicked off at 32′ is due to end at 62′ of the match. Seventeen
    // minutes in, it has thirteen left — and no added time, though 49′ is past the nominal 60′.
    const reading = readClock(inSecondHalf(49 * MS_PER_MINUTE), TWO_THIRTY);
    expect(reading.remainingMs).toBe(13 * MS_PER_MINUTE);
    expect(reading.stoppageMs).toBe(0);
    expect(reading.stoppageMinutes).toBe(0);
  });

  it("announces added time from the first second of it, and counts it per period", () => {
    // Thirty minutes and ten seconds into the second half: the board goes up to +1 immediately.
    const reading = readClock(inSecondHalf(FIRST_HALF_RAN + 30 * MS_PER_MINUTE + 10_000), TWO_THIRTY);
    expect(reading.stoppageMs).toBe(10_000);
    expect(reading.stoppageMinutes).toBe(1);
    expect(reading.remainingMs).toBe(0);
    // The match clock keeps running past the nominal 60′ and says so plainly.
    expect(reading.label).toBe("62’");
    expect(reading.periodLabel).toBe("30’");
  });

  it("reads the first period as one clock twice, because it is", () => {
    const reading = readClock(
      { ...inSecondHalf(13 * MS_PER_MINUTE), period: 1, periodStartedAtMs: 0 },
      TWO_THIRTY,
    );
    expect(reading.label).toBe("13’");
    expect(reading.periodLabel).toBe("13’");
  });
});

describe("projecting a running clock", () => {
  const anchor: ClockAnchor = {
    phase: "running",
    period: 2,
    clockMs: 38 * MS_PER_MINUTE,
    // A first half whistled exactly on time: the second period began where it nominally begins.
    periodStartedAtMs: 30 * MS_PER_MINUTE,
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
    // The anchor's second half began at the nominal 30′, so 62′ of match time is 32′ of this half.
    const late: ClockAnchor = { ...anchor, clockMs: 62 * MS_PER_MINUTE };
    const reading = readClock(late, TWO_THIRTY);
    expect(reading.stoppageMs).toBe(2 * MS_PER_MINUTE);
    expect(reading.stoppageMinutes).toBe(2);
    expect(reading.remainingMs).toBe(0);
    // The match clock says what it is — the 62nd minute of football — and the period line carries
    // the « +2 » (decision 213).
    expect(reading.label).toBe("62’");
    expect(reading.periodLabel).toBe("32’");
  });

  it("knows when it is waiting for the final whistle", () => {
    const atTheEnd: ClockAnchor = {
      phase: "break",
      period: 2,
      clockMs: 60 * MS_PER_MINUTE,
      periodStartedAtMs: 30 * MS_PER_MINUTE,
      anchoredAtMs: 1_000_000,
      running: false,
    };
    expect(readClock(atTheEnd, TWO_THIRTY).awaitingFinalWhistle).toBe(true);
    // Half-time of the same match is a break too, but nobody is waiting to whistle.
    expect(
      readClock({ ...atTheEnd, period: 1, periodStartedAtMs: 0 }, TWO_THIRTY).awaitingFinalWhistle,
    ).toBe(false);
  });

  it("keeps counting the match through a second half that kicked off late", () => {
    const lateEnd = 33 * MS_PER_MINUTE + 40 * 1_000;
    const secondHalf: ClockAnchor = {
      phase: "running",
      period: 2,
      clockMs: lateEnd,
      periodStartedAtMs: lateEnd,
      anchoredAtMs: 1_000_000,
      running: true,
    };
    // The kick-off itself. Decision 209 showed 30:00 here; 213 shows the football actually played,
    // and the second line says the half has not started.
    expect(readClock(secondHalf, TWO_THIRTY)).toMatchObject({
      clockMs: lateEnd,
      minute: 33,
      clock: "33:40",
      label: "33’",
      periodMinute: 0,
      periodClock: "00:00",
      periodLabel: "0’",
      remainingMs: 30 * MS_PER_MINUTE,
      stoppageMs: 0,
    });
    // Two minutes of football later: 35′40″ of the match, 2′ of the half.
    expect(readClock(secondHalf, TWO_THIRTY, 1_000_000 + 2 * MS_PER_MINUTE)).toMatchObject({
      minute: 35,
      clock: "35:40",
      label: "35’",
      periodLabel: "2’",
      stoppageMs: 0,
    });
    // And the +N badge appears once *this* half has had its thirty minutes, not when the match
    // clock passes 60′ — which it did three minutes and forty seconds earlier.
    const full = readClock(secondHalf, TWO_THIRTY, 1_000_000 + 30 * MS_PER_MINUTE + 30_000);
    expect(full).toMatchObject({ clock: "64:10", label: "64’", periodLabel: "30’", remainingMs: 0 });
    expect(full.stoppageMs).toBe(30_000);
    expect(full.stoppageMinutes).toBe(1);
  });

  it("reads half-time, during the break, as the football the first half was given", () => {
    const lateEnd = 33 * MS_PER_MINUTE + 40 * 1_000;
    const halfTime: ClockAnchor = {
      phase: "break",
      period: 1,
      clockMs: lateEnd,
      periodStartedAtMs: 0,
      anchoredAtMs: 1_000_000,
      running: false,
    };
    // « 33’ », because that is how long the half ran. Decision 209 wrote « 30’+4 » here; the figure
    // is now in the period line's « +4 » instead, where it is about the half rather than the match.
    expect(readClock(halfTime, TWO_THIRTY, 1_000_000 + 600_000)).toMatchObject({
      label: "33’",
      clock: "33:40",
      minute: 33,
      periodLabel: "33’",
      stoppageMinutes: 4,
    });
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

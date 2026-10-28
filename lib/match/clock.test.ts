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
  displayClockMs,
  displayMinute,
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

/*
 * The bug of 2026-10-21, found in a real match: a first half let run to 33′40″ has its second-half
 * kick-off *stored* at 33′40″ — it must be, or the log sorts wrong and the two halves' played
 * intervals overlap — and the bar read « 33′ » for the kick-off of a half that starts at 30′.
 */
describe("a period that ran past its nominal end", () => {
  const LATE_END = 33 * MS_PER_MINUTE + 40 * 1_000;

  it("counts the second half from 30′, however late the first one ended", () => {
    expect(displayClockMs(LATE_END, 2, TWO_THIRTY, LATE_END)).toBe(30 * MS_PER_MINUTE);
    expect(displayMinute(LATE_END, 2, TWO_THIRTY, LATE_END)).toBe(30);
    expect(formatMinuteLabelFr(LATE_END, 2, TWO_THIRTY, LATE_END)).toBe("30’");
    // Eight minutes into that half: 41′40″ of real match time, « 38’ » on the screen.
    const eightIn = LATE_END + 8 * MS_PER_MINUTE;
    expect(displayMinute(eightIn, 2, TWO_THIRTY, LATE_END)).toBe(38);
    expect(formatMinuteLabelFr(eightIn, 2, TWO_THIRTY, LATE_END)).toBe("38’");
  });

  it("keeps the first half's own overrun in stoppage notation", () => {
    // The first half started where it should, so its mapping is the identity: 30’+4, never 33’.
    expect(formatMinuteLabelFr(LATE_END, 1, TWO_THIRTY, 0)).toBe("30’+4");
    expect(displayMinute(LATE_END, 1, TWO_THIRTY, 0)).toBe(33);
  });

  it("labels the same stored millisecond differently in each half — which is the whole point", () => {
    expect(formatMinuteLabelFr(LATE_END, 1, TWO_THIRTY, 0)).toBe("30’+4");
    expect(formatMinuteLabelFr(LATE_END, 2, TWO_THIRTY, LATE_END)).toBe("30’");
  });

  it("still ends the overrunning second half in stoppage notation", () => {
    // 63′40″ stored is 60′ displayed — the half has had its 30 minutes — and 10 seconds later, +1.
    expect(formatMinuteLabelFr(LATE_END + 30 * MS_PER_MINUTE, 2, TWO_THIRTY, LATE_END)).toBe("60’");
    expect(
      formatMinuteLabelFr(LATE_END + 30 * MS_PER_MINUTE + 10_000, 2, TWO_THIRTY, LATE_END),
    ).toBe("60’+1");
  });

  it("is the identity when the actual start is not supplied, so every old caller is unmoved", () => {
    for (const period of [1, 2]) {
      for (const clockMs of [0, 24 * MS_PER_MINUTE, LATE_END, 62 * MS_PER_MINUTE]) {
        expect(formatMinuteLabelFr(clockMs, period, TWO_THIRTY)).toBe(
          formatMinuteLabelFr(clockMs, period, TWO_THIRTY, periodStartMs(period, TWO_THIRTY)),
        );
        expect(displayMinute(clockMs, period, TWO_THIRTY)).toBe(
          displayMinute(clockMs, period, TWO_THIRTY, periodStartMs(period, TWO_THIRTY)),
        );
        // And on a clock that is actually inside its own period — the only input a log produces —
        // that identity is the plain elapsed minute, unchanged from before this fix.
        if (clockMs >= periodStartMs(period, TWO_THIRTY)) {
          expect(displayMinute(clockMs, period, TWO_THIRTY)).toBe(clockMsToMinute(clockMs));
        }
      }
    }
    // And null — the shape the anchor carries before any kick-off — is "not supplied" too.
    expect(formatMinuteLabelFr(LATE_END, 1, TWO_THIRTY, null)).toBe("30’+4");
  });

  it("never counts backwards into the previous period", () => {
    // A period that had not begun at this clock reads as its own start, not as a negative offset.
    expect(displayClockMs(10 * MS_PER_MINUTE, 2, TWO_THIRTY, LATE_END)).toBe(30 * MS_PER_MINUTE);
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

  it("puts the whole bar back on 30′ when the second half kicked off late", () => {
    const lateEnd = 33 * MS_PER_MINUTE + 40 * 1_000;
    const secondHalf: ClockAnchor = {
      phase: "running",
      period: 2,
      clockMs: lateEnd,
      periodStartedAtMs: lateEnd,
      anchoredAtMs: 1_000_000,
      running: true,
    };
    // The kick-off itself: the owner's bug read 33:40 here.
    expect(readClock(secondHalf, TWO_THIRTY)).toMatchObject({
      clockMs: lateEnd,
      minute: 30,
      clock: "30:00",
      label: "30’",
      remainingMs: 30 * MS_PER_MINUTE,
      stoppageMs: 0,
    });
    // Two minutes of football later, by the wall clock.
    expect(readClock(secondHalf, TWO_THIRTY, 1_000_000 + 2 * MS_PER_MINUTE)).toMatchObject({
      minute: 32,
      clock: "32:00",
      label: "32’",
      stoppageMs: 0,
    });
    // And the +N badge only appears once *this* half has had its thirty minutes.
    const full = readClock(secondHalf, TWO_THIRTY, 1_000_000 + 30 * MS_PER_MINUTE + 30_000);
    expect(full).toMatchObject({ clock: "60:30", label: "60’+1", remainingMs: 0 });
    expect(full.stoppageMs).toBe(30_000);
  });

  it("reads half-time, during the break, as the first half's stoppage time", () => {
    const lateEnd = 33 * MS_PER_MINUTE + 40 * 1_000;
    const halfTime: ClockAnchor = {
      phase: "break",
      period: 1,
      clockMs: lateEnd,
      periodStartedAtMs: 0,
      anchoredAtMs: 1_000_000,
      running: false,
    };
    // « 30’+4 », not « 30’ »: something that happened here happened after the 30th minute.
    expect(readClock(halfTime, TWO_THIRTY, 1_000_000 + 600_000)).toMatchObject({
      label: "30’+4",
      clock: "33:40",
      minute: 33,
    });
  });
});

/*
 * The header the owner asked for on 2026-10-27 (decision 214): the clock that is on the television,
 * and under it the football actually played. « at the 45 mn of the game … 45’ for the second half if
 * the first lasted 32 » — after an overrun the two differ, and the difference is the point.
 */
describe("the two figures in game mode's header", () => {
  const FIRST_HALF_RAN = 32 * MS_PER_MINUTE;
  const secondHalf = (playedMs: number): ClockAnchor => ({
    phase: "running",
    period: 2,
    clockMs: playedMs,
    periodStartedAtMs: FIRST_HALF_RAN,
    anchoredAtMs: null,
    running: false,
  });

  it("shows the television's 43’ over the 45 minutes of football behind it", () => {
    // 32′ of first half, 13 of second: the screen counts the half from 30, the players from 0.
    const reading = readClock(secondHalf(45 * MS_PER_MINUTE), TWO_THIRTY);
    expect(reading.clock).toBe("43:00");
    expect(reading.minute).toBe(43);
    expect(reading.label).toBe("43’");
    expect(reading.playedMinute).toBe(45);
    expect(reading.playedLabel).toBe("45’");
    // The one that every minute played is built from is the second, not the first.
    expect(reading.clockMs).toBe(45 * MS_PER_MINUTE);
  });

  it("agrees with itself before any overrun, which is most of a match", () => {
    const firstHalf: ClockAnchor = { ...secondHalf(13 * MS_PER_MINUTE), period: 1, periodStartedAtMs: 0 };
    const reading = readClock(firstHalf, TWO_THIRTY);
    expect(reading.label).toBe("13’");
    expect(reading.playedLabel).toBe("13’");
  });

  it("ceils the added-time badge, so it cannot disagree with the label beside it", () => {
    // Ten seconds into the first half's added time: the label announces « 30’+1 », and the badge used
    // to floor the same number to « +0 ».
    const justOver: ClockAnchor = {
      phase: "running",
      period: 1,
      clockMs: 30 * MS_PER_MINUTE + 10_000,
      periodStartedAtMs: 0,
      anchoredAtMs: null,
      running: false,
    };
    const reading = readClock(justOver, TWO_THIRTY);
    expect(reading.label).toBe("30’+1");
    expect(reading.stoppageMinutes).toBe(1);
    expect(Math.floor(reading.stoppageMs / MS_PER_MINUTE)).toBe(0); // what it used to print
    // And exactly on the hour mark there is no added time at all.
    expect(readClock({ ...justOver, clockMs: 30 * MS_PER_MINUTE }, TWO_THIRTY).stoppageMinutes).toBe(0);
  });

  it("counts the second half's added time against the second half, not the match", () => {
    /*
     * The half kicked off at 32′, so it has had its thirty minutes at 62′ of football and not at 60′.
     * That is the whole reason stoppage is measured per period: measuring against the match's nominal
     * 60′ would have put the board up two minutes early, while the half was still inside its time.
     */
    const onTime = readClock(secondHalf(62 * MS_PER_MINUTE), TWO_THIRTY);
    expect(onTime.label).toBe("60’");
    expect(onTime.stoppageMinutes).toBe(0);
    expect(onTime.playedLabel).toBe("62’");
    // Two minutes earlier — past the match's nominal 60′, still inside this half — and nothing yet.
    const beforeThat = readClock(secondHalf(60 * MS_PER_MINUTE + 30_000), TWO_THIRTY);
    expect(beforeThat.label).toBe("58’");
    expect(beforeThat.stoppageMinutes).toBe(0);
    // Half a minute past its thirty, and the board goes up.
    const over = readClock(secondHalf(62 * MS_PER_MINUTE + 30_000), TWO_THIRTY);
    expect(over.label).toBe("60’+1");
    expect(over.stoppageMinutes).toBe(1);
    expect(over.playedLabel).toBe("62’");
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

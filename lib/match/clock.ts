/**
 * The match clock: continuous minutes, configurable periods, manual pauses.
 *
 * Pure and framework-free — **no `Date.now()`**. Wall-clock time always arrives as an argument,
 * which is what lets a test say "it is now the 43rd minute" without waiting for it.
 *
 * ## The two numbers, and which one is the truth
 *
 * - `clockMs` is elapsed **match** time: it advances only while the game is being played, so it
 *   already excludes half-time and every pause. It is the truth, and the reducer works in it.
 * - `minute` is what the screen shows. It is continuous (decision 009): with 2×30 the second half
 *   runs 30′→60′, never 0′→30′, so "24′" identifies a moment in a match without also having to
 *   know its period.
 *
 * Therefore `clockMs` at the kick-off of period *p* is `(p − 1) × periodMinutes`, whatever the
 * wall clock did in between — a referee who takes twelve minutes for half-time does not give
 * anybody twelve extra minutes played.
 *
 * ## Both directions
 *
 * `clockMsToMinute` / `formatClock` take elapsed milliseconds to what the UI renders.
 * `projectClockMs` goes the other way for a running match: it takes an anchor produced by the
 * reducer (the last event's match time, plus the wall-clock instant it happened at) and a "now",
 * and returns the match time now. The game-mode screen stamps new events with it, and the ticking
 * display reads from it.
 */

/* -------------------------------------------------------------------------- */
/* Units and configuration                                                    */
/* -------------------------------------------------------------------------- */

export const MS_PER_SECOND = 1_000;
export const MS_PER_MINUTE = 60_000;

/** Periods as configured on the match (`matches.periods_count`, `matches.period_minutes`). */
export type PeriodsConfig = {
  periodsCount: number;
  periodMinutes: number;
};

/** 2 × 30 for seven-a-side (decision 009). */
export const DEFAULT_PERIODS: PeriodsConfig = { periodsCount: 2, periodMinutes: 30 };

/**
 * Coerce whatever a caller has — a `matches` row, a partial, nothing at all — into a usable
 * configuration. The database already guarantees both are positive; this only has to survive a
 * caller that passes `null` because a column was not selected.
 */
export function periodsConfig(
  input?: { periodsCount?: number | null; periodMinutes?: number | null } | null,
): PeriodsConfig {
  const count = input?.periodsCount;
  const minutes = input?.periodMinutes;
  return {
    periodsCount:
      typeof count === "number" && Number.isFinite(count) && count >= 1
        ? Math.floor(count)
        : DEFAULT_PERIODS.periodsCount,
    periodMinutes:
      typeof minutes === "number" && Number.isFinite(minutes) && minutes >= 1
        ? Math.floor(minutes)
        : DEFAULT_PERIODS.periodMinutes,
  };
}

/** Total regulation time, in milliseconds. 2×30 → 3 600 000. */
export function regulationMs(config: PeriodsConfig): number {
  return config.periodsCount * config.periodMinutes * MS_PER_MINUTE;
}

export function regulationMinutes(config: PeriodsConfig): number {
  return config.periodsCount * config.periodMinutes;
}

/** Match time at which period `p` kicks off. Period 1 starts at 0. */
export function periodStartMs(period: number, config: PeriodsConfig): number {
  return Math.max(0, Math.floor(period) - 1) * config.periodMinutes * MS_PER_MINUTE;
}

/** Match time at which period `p` is due to end — the referee may disagree by a minute or two. */
export function periodEndMs(period: number, config: PeriodsConfig): number {
  return periodStartMs(period, config) + config.periodMinutes * MS_PER_MINUTE;
}

/**
 * Which period a match time falls in, clamped to the configured count so that stoppage time at
 * the very end of the last period does not invent a period that does not exist.
 *
 * The boundary belongs to the period that is starting: with 2×30, exactly 30′00″ is period 2.
 * Events at a boundary carry their own `period` anyway (the log records it), which is why every
 * display function here takes the period explicitly rather than guessing.
 */
export function periodOfClockMs(clockMs: number, config: PeriodsConfig): number {
  const periodMs = config.periodMinutes * MS_PER_MINUTE;
  const raw = Math.floor(Math.max(0, clockMs) / periodMs) + 1;
  return Math.min(Math.max(1, raw), config.periodsCount);
}

/** Elapsed time inside the given period. Used by nothing but a per-period debug readout. */
export function clockMsWithinPeriod(clockMs: number, period: number, config: PeriodsConfig): number {
  return Math.max(0, clockMs - periodStartMs(period, config));
}

/* -------------------------------------------------------------------------- */
/* Converting elapsed milliseconds to what the UI shows                       */
/* -------------------------------------------------------------------------- */

/**
 * The displayed minute of an elapsed match time: **floored**, so the first minute of the match is
 * "0′" and a goal at 10′30″ is "10′".
 *
 * Broadcast football rounds the other way (that goal is "11′"). Flooring is chosen because the
 * number on the coach's screen is a stopwatch he is reading live — it must match the seconds
 * ticking beside it, and it must not label the kick-off "1′". It also agrees with the seeded logs,
 * where `clock_ms = minute × 60 000`.
 */
export function clockMsToMinute(clockMs: number): number {
  return Math.floor(Math.max(0, clockMs) / MS_PER_MINUTE);
}

/** The match time a whole displayed minute starts at. The inverse of `clockMsToMinute`. */
export function minuteToClockMs(minute: number): number {
  return Math.max(0, Math.floor(minute)) * MS_PER_MINUTE;
}

/** `mm:ss`, zero-padded, for the big clock at the top of game mode. */
export function formatClock(clockMs: number): string {
  const seconds = Math.floor(Math.max(0, clockMs) / MS_PER_SECOND);
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

/** A bare minute with the typographic prime: `12’`. */
export function formatMinuteFr(minute: number): string {
  return `${Math.max(0, Math.floor(minute))}’`;
}

/**
 * How a timeline line is labelled. Inside the period it is just the minute; beyond the period's
 * nominal end it becomes football's stoppage notation, `30’+2`, so a goal scored in added time at
 * the end of the first half does not read as if it happened in the second.
 *
 * The period is passed in rather than derived: at exactly 30′00″ of a 2×30, the log alone knows
 * whether that was the end of the first half or the kick-off of the second.
 */
export function formatMinuteLabelFr(
  clockMs: number,
  period: number,
  config: PeriodsConfig,
): string {
  const nominalEnd = periodEndMs(period, config);
  if (clockMs <= nominalEnd) return formatMinuteFr(clockMsToMinute(clockMs));
  const extraMinutes = Math.ceil((clockMs - nominalEnd) / MS_PER_MINUTE);
  return `${clockMsToMinute(nominalEnd)}’+${extraMinutes}`;
}

/* -------------------------------------------------------------------------- */
/* Projecting a running clock                                                 */
/* -------------------------------------------------------------------------- */

export type ClockPhase =
  /** No kick-off in the log yet. */
  | "before-kickoff"
  /** The ball is in play and the clock is ticking. */
  | "running"
  /** A manual pause (`PAUSE`): the clock is frozen, the period is not over. */
  | "paused"
  /** Between two periods: half-time, or waiting for the final whistle after the last one. */
  | "break"
  /** `FINAL_WHISTLE` recorded. Nothing accrues any more. */
  | "finished";

/**
 * Everything needed to know what the clock says at an arbitrary "now", and nothing else.
 * Produced by the reducer from the log; consumed by the UI once a second.
 */
export type ClockAnchor = {
  phase: ClockPhase;
  /** The period in progress, or the one that just ended. At least 1, even before kick-off. */
  period: number;
  /** Match time at `anchoredAtMs`. */
  clockMs: number;
  /** Wall clock (epoch ms) of the event that produced `clockMs`; null when the log is empty. */
  anchoredAtMs: number | null;
  /** Whether match time advances from the anchor. True only while `phase === "running"`. */
  running: boolean;
};

export const IDLE_CLOCK_ANCHOR: ClockAnchor = {
  phase: "before-kickoff",
  period: 1,
  clockMs: 0,
  anchoredAtMs: null,
  running: false,
};

/**
 * Match time at wall-clock instant `nowMs`.
 *
 * A stopped clock ignores `nowMs` entirely — that is the whole point of a pause. A running clock
 * adds the wall time elapsed since the anchor, never less than zero: a phone whose clock is
 * behind the server's must not make the match run backwards.
 *
 * Note that the clock is **not capped** at the end of the period. A coach who forgets to whistle
 * gets 32′ of a 30′ half, which is honest; `ClockReading.stoppageMs` is there to show it.
 */
export function projectClockMs(anchor: ClockAnchor, nowMs?: number | null): number {
  if (!anchor.running || anchor.anchoredAtMs === null || nowMs === null || nowMs === undefined) {
    return anchor.clockMs;
  }
  return anchor.clockMs + Math.max(0, nowMs - anchor.anchoredAtMs);
}

/** Everything the clock component renders, computed once. */
export type ClockReading = {
  phase: ClockPhase;
  period: number;
  clockMs: number;
  /** Continuous displayed minute (decision 009). */
  minute: number;
  /** `mm:ss`. */
  clock: string;
  /** `12’`, or `30’+2` in stoppage time. */
  label: string;
  running: boolean;
  /** Time left in the current period, 0 once it is over. */
  remainingMs: number;
  /** Time played beyond the period's nominal end, 0 inside it. */
  stoppageMs: number;
  /** True when the last period has ended but no final whistle has been recorded. */
  awaitingFinalWhistle: boolean;
};

export function readClock(
  anchor: ClockAnchor,
  config: PeriodsConfig,
  nowMs?: number | null,
): ClockReading {
  const clockMs = projectClockMs(anchor, nowMs);
  const period = Math.min(Math.max(1, anchor.period), config.periodsCount);
  const nominalEnd = periodEndMs(period, config);
  return {
    phase: anchor.phase,
    period,
    clockMs,
    minute: clockMsToMinute(clockMs),
    clock: formatClock(clockMs),
    label: formatMinuteLabelFr(clockMs, period, config),
    running: anchor.running,
    remainingMs: Math.max(0, nominalEnd - clockMs),
    stoppageMs: Math.max(0, clockMs - nominalEnd),
    awaitingFinalWhistle: anchor.phase === "break" && period >= config.periodsCount,
  };
}

/* -------------------------------------------------------------------------- */
/* Reading a logged event's clock position                                    */
/* -------------------------------------------------------------------------- */

/**
 * The match time of a logged event.
 *
 * `clock_ms` is captured on the device and is authoritative. `minute` is only a fallback, for a
 * synthesised retro-entry event (decision 013) that carries the minute a player remembers and no
 * millisecond at all.
 */
export function resolveClockMs(event: {
  clockMs?: number | null;
  minute?: number | null;
}): number {
  const { clockMs, minute } = event;
  if (typeof clockMs === "number" && Number.isFinite(clockMs) && clockMs >= 0) {
    return Math.floor(clockMs);
  }
  if (typeof minute === "number" && Number.isFinite(minute) && minute >= 0) {
    return minuteToClockMs(minute);
  }
  return 0;
}

/**
 * Epoch milliseconds from whatever crossed the RSC boundary: a `Date` from Drizzle, an ISO string
 * from JSON, or a number from a test. Returns null for anything unusable, so a missing timestamp
 * degrades into "cannot project a live clock" rather than into `NaN` leaking through the state.
 */
export function toEpochMs(value: Date | string | number | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/* -------------------------------------------------------------------------- */
/* Intervals of real play                                                     */
/* -------------------------------------------------------------------------- */

/** A half-open span of match time during which the game was being played. */
export type PlayInterval = {
  period: number;
  startMs: number;
  /** Null while the interval is still open (a live, running match). */
  endMs: number | null;
};

/**
 * How much of `[fromMs, toMs)` was actually played.
 *
 * This is the one function that makes minutes played correct across half-time: a player on the
 * pitch from 20′ to 40′ of a 2×30 is credited 20 minutes, not 20 plus however long the teams spent
 * eating oranges — because the break is simply not one of the intervals.
 */
export function playedMsBetween(
  intervals: readonly PlayInterval[],
  fromMs: number,
  toMs: number,
  openEndMs: number,
): number {
  if (toMs <= fromMs) return 0;
  let total = 0;
  for (const interval of intervals) {
    const end = interval.endMs ?? openEndMs;
    const overlap = Math.min(toMs, end) - Math.max(fromMs, interval.startMs);
    if (overlap > 0) total += overlap;
  }
  return total;
}

/** Whole minutes, for a column that is an `integer` and a UI that shows "38 min". */
export function msToWholeMinutes(ms: number): number {
  return Math.round(Math.max(0, ms) / MS_PER_MINUTE);
}

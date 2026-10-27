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
 * ## An overrun period, and why the screen shows real elapsed time
 *
 * That last sentence holds for the *wall* clock, not for a half the coach let run long. A first half
 * whistled at 33′40″ of a 2×30 leaves real elapsed match time at 33′40″, and the second-half
 * kick-off is stamped there — it has to be, because the log is sorted by `clock_ms` and a kick-off
 * stamped before the period end it follows would replay in the wrong order, and because the played
 * intervals of the two halves would otherwise overlap and pay everybody for the same 3′40″ twice.
 *
 * **So the second half genuinely starts at 33′40″ of football, and that is what every screen shows.**
 * An action taken one minute into it reads « 35’ », not « 31’ » and not « 30’+1 ». Decision 213: one
 * minute per moment, counted from the kick-off, with the stopped time left out — which is exactly
 * `clock_ms`, so a label is now `clockMsToMinute` and nothing else.
 *
 * Decision 209 did the opposite for a fortnight — it mapped each period back onto its *nominal* start
 * so the second half read 30′→60′ and added time read « 30’+2 ». It is superseded, and the reason is
 * worth keeping: that scheme made two different moments share a label. « 30’ » was both the end of an
 * overrun first half and the kick-off of the second, and the owner, reading his own match back, could
 * not tell which seven a goal belonged to. Football's own notation solves that with a separate
 * scoreboard the viewer already understands; a one-line list in a phone app has no such context.
 *
 * **What a period-relative figure is still needed for is the header**, and only there: game mode shows
 * the whole match's clock *and* the current half's, so « 45’ · 2e période 13’ » says both how far the
 * afternoon has got and how long this half has run. That is what `periodElapsedMs` is for, and it is
 * the only consumer — nothing that labels an *event* asks which period it belongs to any more.
 *
 * Nothing stored ever moved, under either decision: `clock_ms` and `match_events.minute` are real
 * elapsed match time and minutes played are computed from the intervals.
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
 * How long the current period has been going: real elapsed match time minus the clock at which that
 * period actually kicked off.
 *
 * The **only** period-relative figure left in the app (decision 213), and it exists for the game-mode
 * header, which shows the match's clock beside the current half's. Nothing that labels an event uses
 * it: an event's minute is counted from the kick-off of the match, full stop.
 *
 * `periodStartedAtMs` null, absent or not finite — before any kick-off, or a caller that does not know
 * — gives back the whole elapsed clock, which is right for the first period and the safest answer for
 * anything else. Never negative: a period recorded as starting after the clock it is read at reads 0
 * rather than counting backwards.
 */
export function periodElapsedMs(clockMs: number, periodStartedAtMs?: number | null): number {
  const start =
    typeof periodStartedAtMs === "number" && Number.isFinite(periodStartedAtMs)
      ? periodStartedAtMs
      : 0;
  return Math.max(0, Math.max(0, clockMs) - start);
}

/**
 * How a timeline line is labelled: the elapsed minute of the match, and nothing else (decision 213).
 *
 * « 10’ » ten minutes in. « 31’ » for a first half the coach let run past 30. « 35’ » one minute into
 * a second half that kicked off at 34′, because that moment really is the 35th minute of football
 * played. No stoppage notation, no per-period reset, and no `period` argument — the label does not
 * depend on which half it falls in, which is the property decision 209 lacked and the owner missed.
 *
 * It is `formatMinuteFr(clockMsToMinute(clockMs))`, kept as its own name because every screen in the
 * app calls it and one of them one day will want to change how a minute reads.
 */
export function formatMinuteLabelFr(clockMs: number): string {
  return formatMinuteFr(clockMsToMinute(clockMs));
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
  /**
   * Match time at which `period` actually kicked off — the `clock_ms` of its `KICKOFF`, which after
   * an overrun of the previous period is *later* than its nominal start. Null before any kick-off.
   * This is what lets the display put the second half back at 30′ (see the header).
   */
  periodStartedAtMs: number | null;
  /** Wall clock (epoch ms) of the event that produced `clockMs`; null when the log is empty. */
  anchoredAtMs: number | null;
  /** Whether match time advances from the anchor. True only while `phase === "running"`. */
  running: boolean;
};

export const IDLE_CLOCK_ANCHOR: ClockAnchor = {
  phase: "before-kickoff",
  period: 1,
  clockMs: 0,
  periodStartedAtMs: null,
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
  /**
   * Real elapsed match time — the truth, the thing events are stamped with, and since decision 213
   * also the thing every screen shows. Stopped time is already out of it.
   */
  clockMs: number;
  /** The elapsed minute of the match. Always agrees with `label` and with `clock`. */
  minute: number;
  /** `mm:ss` of the whole match: the big figure in game mode's header. */
  clock: string;
  /** `45’`. No stoppage notation since decision 213. */
  label: string;
  /**
   * The same four, for the **current period alone** — the second figure in the header, « 2e période
   * 13’ ». After a first half of 32′, a match clock of 45′ is a period clock of 13′.
   *
   * These are the only period-relative numbers left in the app, and they are here rather than derived
   * in the component so that the two figures in one header can never be computed from two different
   * `now`s and disagree by a second.
   */
  periodClockMs: number;
  periodMinute: number;
  periodClock: string;
  periodLabel: string;
  running: boolean;
  /**
   * Time left in the current period, 0 once it is over — measured against that period's own length,
   * so a first half that overran does not eat into the second's.
   */
  remainingMs: number;
  /** Time this period has run beyond its length, 0 inside it. */
  stoppageMs: number;
  /**
   * `stoppageMs` as the whole minutes a scoreboard would announce — **ceiled**, because the fourth
   * official's board goes up the moment added time begins, not a minute later. The badge in
   * `match-bar.tsx` used to floor it while the label ceiled it, so the first minute of added time
   * read « +0 » beside an announced « 30’+1 »; there is one spelling now and this is it.
   */
  stoppageMinutes: number;
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
  /*
   * Two figures off one `clockMs`, which is the whole reason they are computed here: the header shows
   * both at once, and a component reading the match clock and the period clock from two calls could
   * show 45′ beside a 13′ that belonged to a different second.
   *
   * The period's length, not its nominal end, is what « remaining » and « stoppage » are measured
   * against now. After an overrun first half those were the same thing under decision 209 and are not
   * under 213: the second half of a 2×30 that kicks off at 34′ is due to end at 64′ of the match, and
   * asking how far past 60′ it is would announce added time four minutes early.
   */
  const periodMs = periodElapsedMs(clockMs, anchor.periodStartedAtMs);
  const periodLengthMs = config.periodMinutes * MS_PER_MINUTE;
  const stoppageMs = Math.max(0, periodMs - periodLengthMs);
  return {
    phase: anchor.phase,
    period,
    clockMs,
    minute: clockMsToMinute(clockMs),
    clock: formatClock(clockMs),
    label: formatMinuteLabelFr(clockMs),
    periodClockMs: periodMs,
    periodMinute: clockMsToMinute(periodMs),
    periodClock: formatClock(periodMs),
    periodLabel: formatMinuteLabelFr(periodMs),
    running: anchor.running,
    remainingMs: Math.max(0, periodLengthMs - periodMs),
    stoppageMs,
    stoppageMinutes: Math.ceil(stoppageMs / MS_PER_MINUTE),
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
 * Period → the match time at which it actually kicked off, for the display scale above.
 *
 * A period's intervals are opened in chronological order and the first of them is opened by its
 * `KICKOFF` (later ones by a `RESUME`), so the first interval seen for a period carries its real
 * start. Periods absent from the log are absent from the map, and a caller that looks one up and
 * finds nothing passes `undefined` straight through to the nominal-start fallback.
 */
export function actualPeriodStarts(intervals: readonly PlayInterval[]): Map<number, number> {
  const starts = new Map<number, number>();
  for (const interval of intervals) {
    if (!starts.has(interval.period)) starts.set(interval.period, interval.startMs);
  }
  return starts;
}

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

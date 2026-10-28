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
 * ## The one place the two numbers come apart: an overrun period
 *
 * That last sentence holds for the *wall* clock, not for a half the coach let run long. A first half
 * whistled at 33′40″ of a 2×30 leaves real elapsed match time at 33′40″, and the second-half
 * kick-off is stamped there — it has to be, because the log is sorted by `clock_ms` and a kick-off
 * stamped before the period end it follows would replay in the wrong order, and because the played
 * intervals of the two halves would otherwise overlap and pay everybody for the same 3′40″ twice.
 *
 * So the second half genuinely starts at 33′40″ of match time, and showing that as « 33′ » is the
 * bug this file now fixes: real football shows 45+3 and then kicks the second half off at 45.
 * **Displayed minutes are therefore relative to their own period**, offset by that period's
 * *nominal* start:
 *
 *     displayed = nominalStart(period) + (clockMs − the clock at which that period actually began)
 *
 * This narrows decision 009 rather than reversing it: minutes are still continuous across the
 * match, 0→30 then 30→60, but they are continuous *within a period with stoppage notation* rather
 * than continuous across an overrun. Nothing stored moves — `clock_ms` and `match_events.minute`
 * stay real elapsed match time, and minutes played are computed from the intervals, untouched.
 *
 * Every display function below therefore takes the period's **actual** start as an optional
 * argument. Omitted, it falls back to the nominal start, which is the identity: that is what keeps
 * a caller with no such knowledge — and every retro match, whose kick-offs are stamped exactly at
 * `periodStartMs` — behaving as before.
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
 * Real elapsed match time, moved onto the display's scale: the period's nominal start plus however
 * long the period has actually been going. See the header — this is the whole of the overrun fix,
 * and every other display function here goes through it.
 *
 * `periodStartedAtMs` is the `clock_ms` at which this period actually kicked off. Omitted, null, or
 * not a finite number, it falls back to the nominal start and the mapping is the identity.
 *
 * Never returns less than the period's nominal start: an event carrying a period that had not begun
 * yet (a hand-written row, a retro minute clamped oddly) reads as the start of it rather than as a
 * negative offset into the previous one.
 */
export function displayClockMs(
  clockMs: number,
  period: number,
  config: PeriodsConfig,
  periodStartedAtMs?: number | null,
): number {
  const nominalStart = periodStartMs(period, config);
  const actualStart =
    typeof periodStartedAtMs === "number" && Number.isFinite(periodStartedAtMs)
      ? periodStartedAtMs
      : nominalStart;
  return Math.max(nominalStart, nominalStart + (Math.max(0, clockMs) - actualStart));
}

/**
 * The minute to display for an event: `clockMsToMinute`, but on the display's scale, so it always
 * agrees with the label `formatMinuteLabelFr` writes for the same arguments. A second-half kick-off
 * stored at 33′40″ is minute 30, not 33.
 */
export function displayMinute(
  clockMs: number,
  period: number,
  config: PeriodsConfig,
  periodStartedAtMs?: number | null,
): number {
  return clockMsToMinute(displayClockMs(clockMs, period, config, periodStartedAtMs));
}

/**
 * How a timeline line is labelled. Inside the period it is just the minute; beyond the period's
 * nominal end it becomes football's stoppage notation, `30’+2`, so a goal scored in added time at
 * the end of the first half does not read as if it happened in the second.
 *
 * The period is passed in rather than derived: at exactly 30′00″ of a 2×30, the log alone knows
 * whether that was the end of the first half or the kick-off of the second. With `periodStartedAtMs`
 * those two cases now also *read* differently, which is the point: a `PERIOD_END` at 33′40″ of the
 * first half is « 30’+4 », and the second-half kick-off stamped at the very same 33′40″ is « 30’ ».
 *
 * That also settles **an event during the break**, half-time's applied composition above all: it
 * carries the period that just ended, so it keeps that period's stoppage notation — « 30’+4 », not
 * « 30’ », which would claim something that happened after the 30th minute happened on it.
 */
export function formatMinuteLabelFr(
  clockMs: number,
  period: number,
  config: PeriodsConfig,
  periodStartedAtMs?: number | null,
): string {
  const displayMs = displayClockMs(clockMs, period, config, periodStartedAtMs);
  const nominalEnd = periodEndMs(period, config);
  if (displayMs <= nominalEnd) return formatMinuteFr(clockMsToMinute(displayMs));
  const extraMinutes = Math.ceil((displayMs - nominalEnd) / MS_PER_MINUTE);
  return `${clockMsToMinute(nominalEnd)}’+${extraMinutes}`;
}

/**
 * The **inverse** of `displayClockMs`: the real match clock for a minute the coach typed on the
 * display's scale (decision 214).
 *
 * This is what the correction sheet needs, and the reason it exists is a bug the owner hit by hand.
 * The sheet's field held real elapsed time while its title showed the display minute, so to move a
 * goal to the « 56’ » he could see, he had to work out and type **59**. He did, and it worked, and
 * nothing in the app told him he was doing the app's arithmetic for it.
 *
 *     clockMs = actualStart(period) + (minuteToClockMs(minute) − nominalStart(period))
 *
 * The period is derived from the **typed** minute, not from a real clock, because display minutes map
 * onto the nominal periods one for one: of a 2×30, 0–29 is the first half and 31–60 the second. At
 * exactly 30 it is the first half's end, which is the same choice `periodOfClockMs` already makes and
 * the same one the old code made.
 *
 * **A minute in added time cannot be typed**, and that is a property of the notation rather than of
 * this function: the first half's stoppage reads « 30’+2 », so there is no integer for it. Typing 30
 * lands on 30′00″ exactly, which is the end of the first half. Worth knowing before correcting a goal
 * scored in added time; `docs/ROADMAP.md` carries it.
 */
export function clockMsForDisplayMinute(
  minute: number,
  config: PeriodsConfig,
  periodStarts?: ReadonlyMap<number, number> | null,
): { clockMs: number; period: number } {
  const displayMs = minuteToClockMs(Math.max(0, minute));
  const period = periodOfClockMs(displayMs, config);
  const nominalStart = periodStartMs(period, config);
  const actualStart = periodStarts?.get(period) ?? nominalStart;
  return { clockMs: Math.max(0, actualStart + (displayMs - nominalStart)), period };
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
  /** Real elapsed match time — the truth, the thing events are stamped with. */
  clockMs: number;
  /**
   * Continuous displayed minute (decision 009), **relative to its own period**: after a first half
   * that ran to 33′40″, the second half's minute 0 is 30, not 33. See the header for why this
   * narrows 009 rather than contradicting it. Always agrees with `label` and with `clock`.
   */
  minute: number;
  /** `mm:ss`, on the same display scale as `minute` and `label`. */
  clock: string;
  /** `12’`, or `30’+2` in stoppage time. */
  label: string;
  /**
   * The football actually played, which after an overrun period is **more** than `minute`: a second
   * half that kicked off at 32′ and has run 13 shows « 43’ » and has had 45 minutes of football.
   *
   * It is `clockMs` as a minute, and it is here rather than left to the component because game mode's
   * header prints the two side by side (decision 214) and they must come from one `clockMs`. It is
   * also the number every minute played is built from, which is why the header says « jouées ».
   */
  playedMinute: number;
  /** `45’` — `playedMinute`, formatted. */
  playedLabel: string;
  running: boolean;
  /** Time left in the current period, 0 once it is over. */
  remainingMs: number;
  /** Time played beyond the period's nominal end, 0 inside it. */
  stoppageMs: number;
  /**
   * `stoppageMs` as the whole minutes a scoreboard would announce — **ceiled**, because the fourth
   * official's board goes up the moment added time begins, not a minute later, and because that is
   * what `formatMinuteLabelFr` does for « 30’+1 ». The badge in `match-bar.tsx` floored it while the
   * label ceiled it, so the first minute of added time read « +0 » beside an announced « 30’+1 ».
   * One spelling now, and this is it.
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
  const nominalEnd = periodEndMs(period, config);
  /*
   * Everything the bar renders is read off this one number, so the big `mm:ss`, the minute, the
   * label and the `+N` stoppage badge can never disagree: a second half that kicked off at 33′40″
   * reads 30:00 and « 30’ », and it is 3′40″ later than real match time that it starts showing +1.
   */
  const displayMs = displayClockMs(clockMs, period, config, anchor.periodStartedAtMs);
  return {
    phase: anchor.phase,
    period,
    clockMs,
    minute: clockMsToMinute(displayMs),
    clock: formatClock(displayMs),
    label: formatMinuteLabelFr(clockMs, period, config, anchor.periodStartedAtMs),
    playedMinute: clockMsToMinute(clockMs),
    playedLabel: formatMinuteFr(clockMsToMinute(clockMs)),
    running: anchor.running,
    remainingMs: Math.max(0, nominalEnd - displayMs),
    stoppageMs: Math.max(0, displayMs - nominalEnd),
    stoppageMinutes: Math.ceil(Math.max(0, displayMs - nominalEnd) / MS_PER_MINUTE),
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

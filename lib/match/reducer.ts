/**
 * `reduceMatch` — the one place that turns the append-only log into everything else.
 *
 * Nothing about a match is stored except what happened: the score, who is on the pitch, minutes
 * played, who was in goal, clean-sheet minutes, the timeline — all of it is derived here
 * (decision 003, invariant 2 of `CLAUDE.md`). This is a **pure function**: no database, no
 * `Date.now()`, no randomness. The same log always reduces to the same state, which is what makes
 * the owner's season statistics arguable rather than magic — and what lets this file be tested
 * against hand-written fixtures down to the minute.
 *
 * ## The rules that neither the notes nor the plan settled
 *
 * Each of these is a judgement call. It is written down because a number that nobody can explain
 * is worse than a number that is merely debatable, and each one is pinned by a test in
 * `reducer.test.ts`.
 *
 * 1. **Minutes are exact milliseconds, rounded for display.** A substitute who comes on at 58′ of
 *    a 60′ match gets 2 minutes, not 3: `Math.round(120000 / 60000)`. Broadcast football would say
 *    3 (it counts the minute in progress), but these minutes are summed over a season, and
 *    systematically rounding every appearance up would inflate a bench player's season by a third.
 *    `playedMs` keeps the exact figure; `minutes` is what goes in `match_player_stats.minutes`.
 *
 * 2. **Time only accrues while the game is being played.** Half-time, a manual `PAUSE`, and
 *    anything after the final whistle add nothing to anybody. `clock_ms` already excludes pauses by
 *    definition, but the intervals are computed from the log anyway so that a device which
 *    mis-counts a pause cannot hand out free minutes.
 *
 * 3. **Clean minutes are per spell on the pitch, and end at the first goal conceded during that
 *    spell.** A player on from 0′ to 60′ of a match we lose 0-1 at 24′ has 24 clean minutes — the
 *    other 36 were played with the sheet already broken. A player who is *off* the pitch when we
 *    concede keeps accruing when he comes back on: his new spell starts clean. That is the
 *    distinction decision 011 asks for, and the reason the stat is called "minutes
 *    d'invincibilité" rather than "minutes played in a clean sheet".
 *    Two alternatives were rejected: crediting every minute not immediately adjacent to a goal
 *    (which makes the whole of a 0-5 defeat "clean", i.e. meaningless), and stopping the clock for
 *    everybody at the team's first concession (which punishes a substitute who came on afterwards
 *    and kept a second clean sheet of his own).
 *
 * 4. **An own goal concedes.** `OWN_GOAL` puts a goal in our net, so it breaks the clean sheet and
 *    counts in `concededWhileOn` exactly like `GOAL_AGAINST`; it additionally records an own goal
 *    against its scorer, and never a goal for him. There is no event for an *opponent's* own goal
 *    in our favour — we track no opponent players (decision 010) — so it is logged as a `GOAL_FOR`
 *    with no `scorerId`: the team gets the goal, nobody is credited, and every player on the pitch
 *    keeps his clean minutes, because we did not concede.
 *
 * 5. **A scored penalty is a goal.** `PENALTY_SCORED` increments both `goals` and
 *    `penaltiesScored`, so `goals` is the complete tally a top-scorer table wants and
 *    `penaltiesScored` is the breakdown. **Do not add them together.** `PENALTY_MISSED` touches
 *    the score for nobody and is not a shot — we do not track shots at all (decision 010).
 *
 * 6. **A `POSITION_CHANGE` never displaces anybody.** A slot is a label on a player, not a chair.
 *    The seeded 55′ chain — Karim moves into the striker's slot, *then* Julien is substituted out
 *    of it — momentarily puts two players in one slot, and that is a legitimate reading of a
 *    coach's actions in sequence. Only a `LINEUP_APPLIED` payload that assigns one slot twice is an
 *    anomaly, because that payload claims to describe a whole team at one instant.
 *
 * 7. **A player may come back on.** Seven-a-side substitutions are rolling, so a player can have
 *    several spells; minutes, clean minutes and goalkeeping minutes are all summed across them.
 *
 * 8. **A broken payload never loses a goal.** If a payload cannot be read, the event is recorded as
 *    an anomaly and still counted at team level when its team-level meaning is unambiguous (a
 *    `PENALTY_SCORED` with no scorer is still 1-0). Player-only events with no player (a `FOUL`
 *    with no member) simply do nothing but appear in the timeline.
 *
 * 9. **A voided event is skipped but never hidden.** `VOID` points at its target through
 *    `voids_event_id`; the target stops counting everywhere, and both lines stay in the timeline so
 *    the UI can strike one through — « But 58’ — annulé » (decision 003). A `VOID` may not target
 *    another `VOID`.
 *
 * ## What this function deliberately does not compute
 *
 * Man of the match and average ratings (they come from `ratings`, not from the log), season
 * aggregates (`lib/stats/`), availability, injuries beyond the `INJURY` events in this match,
 * anything about the opponent's players, and `matches.status` — it reports what the *clock* says
 * and leaves writing a column to the caller.
 */

import { FORMATION_SLOT_COUNT } from "@/db/reference";
import type { SquadRole } from "@/db/schema";
import { scoreLineFr } from "@/lib/calendar/labels";

import {
  type ClockAnchor,
  type ClockPhase,
  type ClockReading,
  type PeriodsConfig,
  type PlayInterval,
  clockMsToMinute,
  formatMinuteLabelFr,
  msToWholeMinutes,
  periodsConfig,
  playedMsBetween,
  readClock,
  resolveClockMs,
  toEpochMs,
} from "./clock";
import {
  EVENT_LABELS_FR,
  type MatchEventPayloads,
  type MatchEventType,
  compareMatchEvents,
  parseMatchEventPayload,
} from "./events";
import { type LineupDiff, type SlotAssignment, type SlotInfo, diffLineups } from "./lineup";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * One row of `match_events`, reduced to what the replay needs. A full `MatchEvent` from
 * `db/schema.ts` is assignable to this (`reducer.test.ts` proves it at compile time), and so is a
 * plain object from JSON — `occurredAt` accepts the `Date` Drizzle returns, the ISO string that
 * survives the RSC boundary, or epoch milliseconds from a fixture.
 */
export type MatchEventRecord = {
  id: string;
  clientEventId?: string | null;
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  occurredAt: Date | string | number;
  payload?: unknown;
  voidsEventId?: string | null;
  /** Monotonic per match. Breaks ties between two events at the same `clockMs`. */
  seq?: number | null;
};

/** A planned composition (`lineups` + `lineup_slots`), for the game-mode prompt. */
export type PlannedLineup = {
  id: string;
  fromMinute: number;
  isInitial?: boolean;
  /** Null until the coach confirms it in game mode (decision 006). */
  appliedEventId?: string | null;
  formationId?: string | null;
  slots: readonly SlotAssignment[];
};

export type SquadEntry = {
  teamMemberId: string;
  role: SquadRole;
};

export type MatchReducerConfig = {
  /** From `matches`. Defaults to 2 × 30 (decision 009). */
  periodsCount?: number | null;
  periodMinutes?: number | null;
  /**
   * The `formation_slots` of every formation the log refers to. Without it the reducer cannot know
   * which slot is the goal, so goalkeeping and goalkeeping-clean minutes stay at zero and an
   * anomaly says so.
   */
  slots?: readonly SlotInfo[] | null;
  /** `match_squad`, so the state can carry each player's squad role and list the bench. */
  squad?: readonly SquadEntry[] | null;
  /**
   * Wall clock, epoch milliseconds. Supplied while a match is live so the running clock and the
   * minutes of the players currently on the pitch advance to *now*. Omitted (or on a finished
   * match) everything is computed as of the last event. Never read from `Date.now()` in here —
   * that is the caller's job, and the reason this function is testable.
   */
  nowMs?: number | null;
};

/* -------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* -------------------------------------------------------------------------- */

export type PitchSpell = {
  fromClockMs: number;
  /** Null while the player is still on the pitch. */
  toClockMs: number | null;
};

export type PositionSpell = {
  slotId: string | null;
  positionCode: string | null;
  fromClockMs: number;
  toClockMs: number | null;
};

/**
 * Everything the log says about one player in this match. The integer fields map one-to-one onto
 * `match_player_stats`; see `toMatchPlayerStats`.
 */
export type PlayerMatchState = {
  memberId: string;
  squadRole: SquadRole | null;
  /** Exact time on the pitch. `minutes` is this, rounded (rule 1). */
  playedMs: number;
  minutes: number;
  /** Exact time in the `GB` slot. */
  gkMs: number;
  gkMinutes: number;
  /** Minutes on the pitch with the sheet still clean, per spell (rule 3). */
  cleanMs: number;
  cleanMinutes: number;
  /** The same, restricted to time spent in goal — the goalkeeper's headline stat (decision 011). */
  gkCleanMs: number;
  gkCleanMinutes: number;
  /** Goals conceded by the team while this player was on the pitch. */
  concededWhileOn: number;
  /** Goals conceded while this player was the goalkeeper. */
  concededWhileGk: number;
  /** All goals, penalties included (rule 5). */
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  /** `INJURY` events for this player in this match. */
  injuries: number;
  onPitch: boolean;
  slotId: string | null;
  positionCode: string | null;
  /** On the pitch at the kick-off of the first period. */
  startedMatch: boolean;
  /** Spent any time on the pitch at all. */
  playedMatch: boolean;
  /** Spent any time in the `GB` slot. */
  wasGoalkeeper: boolean;
  /** Every stint on the pitch, in order. More than one when a player comes back on (rule 7). */
  spells: readonly PitchSpell[];
  /** Position over time: every slot held, in order. */
  positionSpells: readonly PositionSpell[];
};

export type OnPitchEntry = {
  memberId: string;
  slotId: string | null;
  positionCode: string | null;
  sinceClockMs: number;
  isGoalkeeper: boolean;
};

export type TimelineActorRole =
  | "scorer"
  | "assist"
  | "own-goal"
  | "penalty"
  | "in"
  | "out"
  | "moved"
  | "foul"
  | "injured"
  /** The player a `COMMENT` is about, when the coach attached one. */
  | "commented";

export type TimelineActor = {
  memberId: string;
  role: TimelineActorRole;
};

export type TimelineEntry = {
  eventId: string;
  clientEventId: string | null;
  type: MatchEventType;
  period: number;
  clockMs: number;
  /** Continuous minute (decision 009). */
  minute: number;
  /** `58’`, or `30’+2` in stoppage time. */
  minuteLabel: string;
  /** French name of the event kind. Player names are the UI's job — the reducer knows none. */
  labelFr: string;
  /** True when a `VOID` points at this event: show it, struck through. */
  voided: boolean;
  voidedByEventId: string | null;
  /** Set on a `VOID` entry itself: the event it annuls. */
  voidsEventId: string | null;
  /** Whom the entry is about, so the UI can splice in names without re-reading the payload. */
  actors: readonly TimelineActor[];
  /**
   * The free text an event carries, today only a `COMMENT`'s note. `null` on everything else, so
   * the presenter has one field to read rather than a payload to re-interpret.
   */
  note: string | null;
  /** The running score immediately after this event, on the events that changed it. */
  scoreAfter: { goalsFor: number; goalsAgainst: number } | null;
  /** True when the payload could not be read; the entry is still shown. */
  invalidPayload: boolean;
};

export type MatchAnomalyCode =
  | "invalid-payload"
  | "voids-on-non-void"
  | "void-without-target"
  | "void-targets-void"
  | "void-target-unknown"
  | "duplicate-void"
  | "kickoff-while-in-play"
  | "period-end-while-stopped"
  | "goal-before-kickoff"
  | "event-after-final-whistle"
  | "duplicate-final-whistle"
  | "substitute-in-already-on"
  | "substitute-out-not-on"
  | "position-change-off-pitch"
  | "scorer-off-pitch"
  | "too-many-on-pitch"
  | "lineup-slot-conflict"
  | "goalkeeper-unknown"
  | "no-goalkeeper-on-pitch";

/**
 * Something in the log that cannot be true. The reducer never throws and never silently drops:
 * it does the most useful thing it can and reports what it found. Messages are English — these are
 * diagnostics for a developer, not text for the coach.
 */
export type MatchAnomaly = {
  code: MatchAnomalyCode;
  message: string;
  eventId: string | null;
  clockMs: number | null;
};

export type PlannedLineupFlagReason = "injured" | "already-off" | "not-in-squad";

export type PlannedLineupFlag = {
  memberId: string;
  reason: PlannedLineupFlagReason;
};

/**
 * A planned composition and what it would take to apply it. This is what raises the game-mode
 * prompt: `due && !applied` means the minute has come and the coach has not confirmed yet.
 */
export type PlannedLineupState = {
  lineupId: string;
  fromMinute: number;
  isInitial: boolean;
  applied: boolean;
  appliedEventId: string | null;
  /** The match has reached `fromMinute`. */
  due: boolean;
  /** The changes it implies against the players on the pitch right now. */
  diff: LineupDiff;
  /** Players the prompt must show in red: injured in this match, already off, or not selected. */
  flags: readonly PlannedLineupFlag[];
};

export type MatchState = {
  periods: PeriodsConfig;
  /** What the clock says, and whether it is ticking. */
  clock: ClockAnchor;
  /** The same thing rendered: minute, `mm:ss`, French label. */
  reading: ClockReading;
  phase: ClockPhase;
  started: boolean;
  finished: boolean;
  /** Periods that have kicked off. */
  periodsStarted: number;
  goalsFor: number;
  goalsAgainst: number;
  /** « 3 – 2 », ours first — `scoreLineFr`, the app's one scoreline (decision 061). */
  scoreLabel: string;
  /** Null until the final whistle: a match in progress has no result. */
  result: "win" | "draw" | "loss" | null;
  onPitch: readonly OnPitchEntry[];
  goalkeeperId: string | null;
  /** Squad members with a playing role who are not on the pitch. Empty without `config.squad`. */
  bench: readonly string[];
  /** One entry per player the log or the squad mentions, most minutes first. */
  players: readonly PlayerMatchState[];
  timeline: readonly TimelineEntry[];
  /** Match time of every goal conceded, in order. */
  concededAt: readonly number[];
  /** Match time of every goal scored, in order. */
  scoredAt: readonly number[];
  /** Spans of real play, half-time and pauses excluded. */
  playIntervals: readonly PlayInterval[];
  plannedLineups: readonly PlannedLineupState[];
  /** The one the UI must prompt about, if any. */
  pendingLineup: PlannedLineupState | null;
  /** `lineups.id` of every composition actually applied, in order. */
  appliedLineupIds: readonly string[];
  voidedEventIds: readonly string[];
  anomalies: readonly MatchAnomaly[];
};

/* -------------------------------------------------------------------------- */
/* Internals                                                                  */
/* -------------------------------------------------------------------------- */

type Prepared = {
  event: MatchEventRecord;
  clockMs: number;
  occurredAtMs: number | null;
};

type PitchEntry = {
  slotId: string | null;
  /** Start of the accrual window for minutes played; advanced as time is banked. */
  sinceClockMs: number;
  /** Start of the accrual window for clean minutes; null once this spell has conceded. */
  cleanSince: number | null;
  /** Start of the accrual window for goalkeeping minutes; null when not in goal. */
  gkSince: number | null;
  gkCleanSince: number | null;
};

type PlayerAcc = {
  memberId: string;
  squadRole: SquadRole | null;
  playedMs: number;
  cleanMs: number;
  gkMs: number;
  gkCleanMs: number;
  concededWhileOn: number;
  concededWhileGk: number;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  injuries: number;
  wasGoalkeeper: boolean;
  spells: PitchSpell[];
  positionSpells: PositionSpell[];
};

function buildSlotIndex(slots: readonly SlotInfo[] | null | undefined) {
  const map = new Map<string, SlotInfo>();
  for (const slot of slots ?? []) map.set(slot.id, slot);
  return {
    hasCatalogue: map.size > 0,
    positionOf: (slotId: string | null): string | null =>
      slotId === null ? null : (map.get(slotId)?.positionCode ?? null),
    sortOf: (slotId: string | null): number =>
      slotId === null ? Number.MAX_SAFE_INTEGER : (map.get(slotId)?.sort ?? Number.MAX_SAFE_INTEGER),
    isGoal: (slotId: string | null): boolean =>
      slotId !== null && map.get(slotId)?.positionCode === "GB",
  };
}

/* -------------------------------------------------------------------------- */
/* The reducer                                                                */
/* -------------------------------------------------------------------------- */

export function reduceMatch(
  events: readonly MatchEventRecord[],
  lineups: readonly PlannedLineup[] = [],
  config: MatchReducerConfig = {},
): MatchState {
  const periods = periodsConfig(config);
  const slots = buildSlotIndex(config.slots);
  const nowMs = typeof config.nowMs === "number" && Number.isFinite(config.nowMs) ? config.nowMs : null;

  const anomalies: MatchAnomaly[] = [];
  const reportedOnce = new Set<MatchAnomalyCode>();
  const report = (
    code: MatchAnomalyCode,
    message: string,
    event?: { id: string } | null,
    clockMs?: number | null,
    once = false,
  ) => {
    if (once) {
      if (reportedOnce.has(code)) return;
      reportedOnce.add(code);
    }
    anomalies.push({
      code,
      message,
      eventId: event?.id ?? null,
      clockMs: clockMs ?? null,
    });
  };

  /* ---- 1. Order the log, and work out what is annulled ------------------- */

  const prepared: Prepared[] = events
    .map((event) => ({
      event,
      clockMs: resolveClockMs(event),
      occurredAtMs: toEpochMs(event.occurredAt),
    }))
    .sort((a, b) =>
      compareMatchEvents(
        { clockMs: a.clockMs, seq: a.event.seq, id: a.event.id },
        { clockMs: b.clockMs, seq: b.event.seq, id: b.event.id },
      ),
    );

  const byId = new Map(prepared.map((item) => [item.event.id, item]));
  /** target event id → the `VOID` event that annuls it. */
  const voidedBy = new Map<string, string>();

  for (const { event, clockMs } of prepared) {
    if (event.type !== "VOID") {
      if (event.voidsEventId) {
        report(
          "voids-on-non-void",
          `a ${event.type} event carries voids_event_id; only a VOID may`,
          event,
          clockMs,
        );
      }
      continue;
    }
    if (!event.voidsEventId) {
      report("void-without-target", "a VOID event has no voids_event_id", event, clockMs);
      continue;
    }
    const target = byId.get(event.voidsEventId);
    if (!target) {
      // Entirely possible in the field: the outbox may still be holding the event it annuls.
      report(
        "void-target-unknown",
        `VOID targets ${event.voidsEventId}, which is not in this log`,
        event,
        clockMs,
      );
      continue;
    }
    if (target.event.type === "VOID") {
      report("void-targets-void", "a VOID may not annul another VOID", event, clockMs);
      continue;
    }
    if (voidedBy.has(target.event.id)) {
      report("duplicate-void", `event ${target.event.id} is annulled twice`, event, clockMs);
      continue;
    }
    voidedBy.set(target.event.id, event.id);
  }

  const isLive = (item: Prepared) =>
    item.event.type !== "VOID" && !voidedBy.has(item.event.id);
  const live = prepared.filter(isLive);

  /* ---- 2. The clock: spans of real play, and the anchor ------------------ */

  const intervals: PlayInterval[] = [];
  let phase: ClockPhase = "before-kickoff";
  let periodsStarted = 0;
  let currentPeriod = 0;
  let finalWhistleAt: number | null = null;

  const openInterval = (period: number, startMs: number) => {
    intervals.push({ period, startMs, endMs: null });
  };
  const closeInterval = (endMs: number) => {
    const last = intervals[intervals.length - 1];
    if (last && last.endMs === null) last.endMs = Math.max(last.startMs, endMs);
  };

  for (const { event, clockMs } of live) {
    switch (event.type) {
      case "KICKOFF": {
        if (phase === "running" || phase === "paused") {
          report("kickoff-while-in-play", "KICKOFF while a period is already running", event, clockMs);
          break;
        }
        periodsStarted += 1;
        currentPeriod = Math.max(event.period || periodsStarted, periodsStarted);
        openInterval(currentPeriod, clockMs);
        phase = "running";
        break;
      }
      case "PERIOD_END": {
        if (phase !== "running" && phase !== "paused") {
          report("period-end-while-stopped", "PERIOD_END with no period running", event, clockMs);
          break;
        }
        closeInterval(clockMs);
        phase = "break";
        break;
      }
      case "PAUSE": {
        // Duplicate taps are ignored in silence: the outbox can legitimately deliver two.
        if (phase !== "running") break;
        closeInterval(clockMs);
        phase = "paused";
        break;
      }
      case "RESUME": {
        if (phase !== "paused") break;
        openInterval(currentPeriod, clockMs);
        phase = "running";
        break;
      }
      case "FINAL_WHISTLE": {
        if (phase === "finished") {
          report("duplicate-final-whistle", "a second FINAL_WHISTLE", event, clockMs);
          break;
        }
        closeInterval(clockMs);
        phase = "finished";
        finalWhistleAt = clockMs;
        break;
      }
      default:
        break;
    }
  }

  const lastLive = live[live.length - 1];
  const anchor: ClockAnchor = {
    phase,
    period: Math.max(1, currentPeriod),
    clockMs: lastLive ? lastLive.clockMs : 0,
    anchoredAtMs: lastLive ? lastLive.occurredAtMs : null,
    running: phase === "running",
  };

  /**
   * Where the accounting stops. For a running match with a `nowMs` it is the projected match time,
   * so the players on the pitch are credited up to this instant; otherwise it is the last event.
   */
  const boundaryMs = Math.max(
    anchor.clockMs,
    anchor.running && anchor.anchoredAtMs !== null && nowMs !== null
      ? anchor.clockMs + Math.max(0, nowMs - anchor.anchoredAtMs)
      : anchor.clockMs,
  );

  const playedBetween = (fromMs: number, toMs: number) =>
    playedMsBetween(intervals, fromMs, toMs, boundaryMs);

  /* ---- 3. Replay ---------------------------------------------------------- */

  const players = new Map<string, PlayerAcc>();
  for (const entry of config.squad ?? []) {
    players.set(entry.teamMemberId, newPlayer(entry.teamMemberId, entry.role));
  }
  const playerOf = (memberId: string): PlayerAcc => {
    const existing = players.get(memberId);
    if (existing) return existing;
    const created = newPlayer(memberId, null);
    players.set(memberId, created);
    return created;
  };

  const pitch = new Map<string, PitchEntry>();
  const timeline: TimelineEntry[] = [];
  const concededAt: number[] = [];
  const scoredAt: number[] = [];
  const appliedLineupIds: string[] = [];
  const injuredInMatch = new Set<string>();
  const everLeftPitch = new Set<string>();
  let goalsFor = 0;
  let goalsAgainst = 0;
  let firstKickoffSeen = false;

  /** Bank everything that has accrued for one player up to `atMs`, and move his cursors there. */
  const accrue = (memberId: string, atMs: number) => {
    const entry = pitch.get(memberId);
    if (!entry) return;
    const player = playerOf(memberId);
    player.playedMs += playedBetween(entry.sinceClockMs, atMs);
    entry.sinceClockMs = Math.max(entry.sinceClockMs, atMs);
    if (entry.cleanSince !== null) {
      player.cleanMs += playedBetween(entry.cleanSince, atMs);
      entry.cleanSince = Math.max(entry.cleanSince, atMs);
    }
    if (entry.gkSince !== null) {
      player.gkMs += playedBetween(entry.gkSince, atMs);
      entry.gkSince = Math.max(entry.gkSince, atMs);
      if (entry.gkCleanSince !== null) {
        player.gkCleanMs += playedBetween(entry.gkCleanSince, atMs);
        entry.gkCleanSince = Math.max(entry.gkCleanSince, atMs);
      }
    }
  };

  const enterPitch = (memberId: string, slotId: string | null, atMs: number) => {
    const player = playerOf(memberId);
    const inGoal = slots.isGoal(slotId);
    pitch.set(memberId, {
      slotId,
      sinceClockMs: atMs,
      cleanSince: atMs,
      gkSince: inGoal ? atMs : null,
      gkCleanSince: inGoal ? atMs : null,
    });
    if (inGoal) player.wasGoalkeeper = true;
    player.spells.push({ fromClockMs: atMs, toClockMs: null });
    player.positionSpells.push({
      slotId,
      positionCode: slots.positionOf(slotId),
      fromClockMs: atMs,
      toClockMs: null,
    });
  };

  const leavePitch = (memberId: string, atMs: number): boolean => {
    if (!pitch.has(memberId)) return false;
    accrue(memberId, atMs);
    const player = playerOf(memberId);
    closeLast(player.spells, atMs);
    closeLast(player.positionSpells, atMs);
    pitch.delete(memberId);
    everLeftPitch.add(memberId);
    return true;
  };

  const moveTo = (memberId: string, slotId: string | null, atMs: number): boolean => {
    const entry = pitch.get(memberId);
    if (!entry) return false;
    if (entry.slotId === slotId) return true;
    accrue(memberId, atMs);
    const player = playerOf(memberId);
    const wasInGoal = slots.isGoal(entry.slotId);
    const nowInGoal = slots.isGoal(slotId);
    if (wasInGoal && !nowInGoal) {
      entry.gkSince = null;
      entry.gkCleanSince = null;
    } else if (!wasInGoal && nowInGoal) {
      // A new spell in goal starts with a clean sheet of its own (decision 011, rule 3).
      entry.gkSince = atMs;
      entry.gkCleanSince = atMs;
      player.wasGoalkeeper = true;
    }
    entry.slotId = slotId;
    closeLast(player.positionSpells, atMs);
    player.positionSpells.push({
      slotId,
      positionCode: slots.positionOf(slotId),
      fromClockMs: atMs,
      toClockMs: null,
    });
    return true;
  };

  const concede = (atMs: number) => {
    goalsAgainst += 1;
    concededAt.push(atMs);
    for (const [memberId, entry] of pitch) {
      accrue(memberId, atMs);
      const player = playerOf(memberId);
      player.concededWhileOn += 1;
      entry.cleanSince = null;
      if (entry.gkSince !== null) {
        player.concededWhileGk += 1;
        entry.gkCleanSince = null;
      }
    }
  };

  const currentAssignments = (): SlotAssignment[] =>
    [...pitch]
      .filter(([, entry]) => entry.slotId !== null)
      .map(([memberId, entry]) => ({ memberId, slotId: entry.slotId as string }))
      .sort((a, b) => slots.sortOf(a.slotId) - slots.sortOf(b.slotId));

  const checkPitch = (event: MatchEventRecord, clockMs: number) => {
    if (pitch.size > FORMATION_SLOT_COUNT) {
      report(
        "too-many-on-pitch",
        `${pitch.size} players on the pitch, ${FORMATION_SLOT_COUNT} allowed`,
        event,
        clockMs,
        true,
      );
    }
    if (!slots.hasCatalogue) {
      if (pitch.size > 0) {
        report(
          "goalkeeper-unknown",
          "no formation slot catalogue supplied: goalkeeper and clean-sheet-in-goal minutes cannot be computed",
          null,
          null,
          true,
        );
      }
      return;
    }
    if (pitch.size >= FORMATION_SLOT_COUNT && ![...pitch.values()].some((e) => slots.isGoal(e.slotId))) {
      report("no-goalkeeper-on-pitch", "a full team with nobody in the GB slot", event, clockMs, true);
    }
  };

  for (const item of prepared) {
    const { event, clockMs } = item;
    const voided = voidedBy.has(event.id);
    const actors: TimelineActor[] = [];
    let scoreAfter: TimelineEntry["scoreAfter"] = null;
    let invalidPayload = false;

    const parsed = parseMatchEventPayload(event.type, event.payload);
    if (!parsed.ok) {
      invalidPayload = true;
      report(
        "invalid-payload",
        `${event.type}: ${parsed.issues.join(" · ")}`,
        event,
        clockMs,
      );
    }
    const payload = parsed.ok ? parsed.payload : null;

    const active = event.type !== "VOID" && !voided;

    if (active) {
      if (finalWhistleAt !== null && clockMs > finalWhistleAt) {
        report("event-after-final-whistle", `${event.type} after the final whistle`, event, clockMs);
      }

      switch (event.type) {
        case "KICKOFF": {
          if (!firstKickoffSeen) {
            firstKickoffSeen = true;
          }
          break;
        }

        case "GOAL_FOR":
        case "PENALTY_SCORED": {
          if (!firstKickoffSeen) {
            report("goal-before-kickoff", `${event.type} before any KICKOFF`, event, clockMs);
          }
          goalsFor += 1;
          scoredAt.push(clockMs);
          const scorerId =
            event.type === "GOAL_FOR"
              ? (payload as MatchEventPayloads["GOAL_FOR"] | null)?.scorerId
              : (payload as MatchEventPayloads["PENALTY_SCORED"] | null)?.scorerId;
          const assistId =
            event.type === "GOAL_FOR"
              ? (payload as MatchEventPayloads["GOAL_FOR"] | null)?.assistId
              : undefined;
          if (scorerId) {
            const scorer = playerOf(scorerId);
            scorer.goals += 1;
            if (event.type === "PENALTY_SCORED") scorer.penaltiesScored += 1;
            actors.push({ memberId: scorerId, role: event.type === "GOAL_FOR" ? "scorer" : "penalty" });
            if (!pitch.has(scorerId)) {
              report("scorer-off-pitch", `${scorerId} scored while off the pitch`, event, clockMs);
            }
          }
          if (assistId) {
            playerOf(assistId).assists += 1;
            actors.push({ memberId: assistId, role: "assist" });
          }
          scoreAfter = { goalsFor, goalsAgainst };
          break;
        }

        case "GOAL_AGAINST": {
          concede(clockMs);
          scoreAfter = { goalsFor, goalsAgainst };
          break;
        }

        case "OWN_GOAL": {
          concede(clockMs);
          const scorerId = (payload as MatchEventPayloads["OWN_GOAL"] | null)?.scorerId;
          if (scorerId) {
            playerOf(scorerId).ownGoals += 1;
            actors.push({ memberId: scorerId, role: "own-goal" });
          }
          scoreAfter = { goalsFor, goalsAgainst };
          break;
        }

        case "PENALTY_MISSED": {
          const scorerId = (payload as MatchEventPayloads["PENALTY_MISSED"] | null)?.scorerId;
          if (scorerId) {
            playerOf(scorerId).penaltiesMissed += 1;
            actors.push({ memberId: scorerId, role: "penalty" });
          }
          break;
        }

        case "FOUL": {
          const memberId = (payload as MatchEventPayloads["FOUL"] | null)?.memberId;
          if (memberId) {
            playerOf(memberId).fouls += 1;
            actors.push({ memberId, role: "foul" });
          }
          break;
        }

        case "INJURY": {
          const memberId = (payload as MatchEventPayloads["INJURY"] | null)?.memberId;
          if (memberId) {
            playerOf(memberId).injuries += 1;
            injuredInMatch.add(memberId);
            actors.push({ memberId, role: "injured" });
          }
          break;
        }

        case "SUBSTITUTION": {
          const sub = payload as MatchEventPayloads["SUBSTITUTION"] | null;
          if (sub) {
            const outSlot = pitch.get(sub.outId)?.slotId ?? null;
            const wentOff = leavePitch(sub.outId, clockMs);
            if (!wentOff) {
              report(
                "substitute-out-not-on",
                `${sub.outId} was substituted off while not on the pitch`,
                event,
                clockMs,
              );
            }
            const slotId = sub.slotId ?? outSlot;
            if (pitch.has(sub.inId)) {
              report(
                "substitute-in-already-on",
                `${sub.inId} came on while already on the pitch`,
                event,
                clockMs,
              );
              if (slotId) moveTo(sub.inId, slotId, clockMs);
            } else {
              enterPitch(sub.inId, slotId, clockMs);
            }
            actors.push({ memberId: sub.outId, role: "out" }, { memberId: sub.inId, role: "in" });
            checkPitch(event, clockMs);
          }
          break;
        }

        case "POSITION_CHANGE": {
          const change = payload as MatchEventPayloads["POSITION_CHANGE"] | null;
          if (change) {
            const moved = moveTo(change.memberId, change.toSlotId, clockMs);
            if (!moved) {
              report(
                "position-change-off-pitch",
                `${change.memberId} changed position while not on the pitch`,
                event,
                clockMs,
              );
            } else {
              actors.push({ memberId: change.memberId, role: "moved" });
            }
            checkPitch(event, clockMs);
          }
          break;
        }

        case "LINEUP_APPLIED": {
          const applied = payload as MatchEventPayloads["LINEUP_APPLIED"] | null;
          if (applied) {
            const diff = diffLineups(currentAssignments(), applied.slots, { slots: config.slots });
            for (const warning of diff.warnings) {
              if (warning.code === "duplicate-slot" || warning.code === "duplicate-member") {
                report(
                  "lineup-slot-conflict",
                  `LINEUP_APPLIED payload is self-inconsistent (${warning.detail})`,
                  event,
                  clockMs,
                );
              }
            }
            for (const memberId of diff.goingOff) leavePitch(memberId, clockMs);
            for (const change of diff.positionChanges) {
              moveTo(change.memberId, change.toSlotId, clockMs);
            }
            for (const memberId of diff.comingOn) {
              const slotId =
                applied.slots.find((assignment) => assignment.memberId === memberId)?.slotId ?? null;
              enterPitch(memberId, slotId, clockMs);
            }
            for (const memberId of diff.goingOff) actors.push({ memberId, role: "out" });
            for (const memberId of diff.comingOn) actors.push({ memberId, role: "in" });
            for (const change of diff.positionChanges) {
              actors.push({ memberId: change.memberId, role: "moved" });
            }
            if (applied.lineupId) appliedLineupIds.push(applied.lineupId);
            checkPitch(event, clockMs);
          }
          break;
        }

        default:
          break;
      }
    }

    // A COMMENT moves nothing: no score, no clock, no pitch, no minutes — both switches above let
    // it fall to their `default`, deliberately. Its whole content is its text, so it is read here,
    // outside them, which also means an annulled comment still shows what it said.
    let note: string | null = null;
    if (event.type === "COMMENT") {
      const comment = payload as MatchEventPayloads["COMMENT"] | null;
      note = comment?.note ?? null;
      if (comment?.memberId) actors.push({ memberId: comment.memberId, role: "commented" });
    }

    timeline.push({
      eventId: event.id,
      clientEventId: event.clientEventId ?? null,
      type: event.type,
      period: event.period,
      clockMs,
      minute: clockMsToMinute(clockMs),
      minuteLabel: formatMinuteLabelFr(clockMs, event.period, periods),
      labelFr: EVENT_LABELS_FR[event.type],
      voided,
      voidedByEventId: voidedBy.get(event.id) ?? null,
      voidsEventId: event.type === "VOID" ? (event.voidsEventId ?? null) : null,
      actors,
      note,
      scoreAfter,
      invalidPayload,
    });
  }

  /* ---- 4. Settle the players still on the pitch --------------------------- */

  for (const memberId of pitch.keys()) accrue(memberId, boundaryMs);

  /* ---- 5. Shape the state ------------------------------------------------- */

  const goalkeeperId =
    [...pitch].find(([, entry]) => slots.isGoal(entry.slotId))?.[0] ?? null;

  const playerStates: PlayerMatchState[] = [...players.values()]
    .map((player) => {
      const entry = pitch.get(player.memberId);
      const startedMatch = player.spells.length > 0 && player.spells[0].fromClockMs === 0;
      return {
        memberId: player.memberId,
        squadRole: player.squadRole,
        playedMs: player.playedMs,
        minutes: msToWholeMinutes(player.playedMs),
        gkMs: player.gkMs,
        gkMinutes: msToWholeMinutes(player.gkMs),
        cleanMs: player.cleanMs,
        cleanMinutes: msToWholeMinutes(player.cleanMs),
        gkCleanMs: player.gkCleanMs,
        gkCleanMinutes: msToWholeMinutes(player.gkCleanMs),
        concededWhileOn: player.concededWhileOn,
        concededWhileGk: player.concededWhileGk,
        goals: player.goals,
        assists: player.assists,
        ownGoals: player.ownGoals,
        penaltiesScored: player.penaltiesScored,
        penaltiesMissed: player.penaltiesMissed,
        fouls: player.fouls,
        injuries: player.injuries,
        onPitch: entry !== undefined,
        slotId: entry?.slotId ?? null,
        positionCode: slots.positionOf(entry?.slotId ?? null),
        startedMatch,
        playedMatch: player.spells.length > 0,
        wasGoalkeeper: player.wasGoalkeeper,
        spells: player.spells,
        positionSpells: player.positionSpells,
      };
    })
    // Deterministic: most minutes first, then by id so equal rows never swap between runs.
    .sort((a, b) => b.playedMs - a.playedMs || (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));

  const onPitch: OnPitchEntry[] = [...pitch]
    .map(([memberId, entry]) => ({
      memberId,
      slotId: entry.slotId,
      positionCode: slots.positionOf(entry.slotId),
      sinceClockMs: entry.sinceClockMs,
      isGoalkeeper: slots.isGoal(entry.slotId),
    }))
    .sort(
      (a, b) =>
        slots.sortOf(a.slotId) - slots.sortOf(b.slotId) ||
        (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0),
    );

  const bench = (config.squad ?? [])
    .filter((entry) => entry.role !== "supporter" && !pitch.has(entry.teamMemberId))
    .map((entry) => entry.teamMemberId);

  const currentMinute = clockMsToMinute(boundaryMs);
  const squadIds = new Set((config.squad ?? []).map((entry) => entry.teamMemberId));
  const appliedIds = new Set(appliedLineupIds);

  const plannedLineups: PlannedLineupState[] = [...lineups]
    .sort((a, b) => a.fromMinute - b.fromMinute || (a.id < b.id ? -1 : 1))
    .map((lineup) => {
      const applied = appliedIds.has(lineup.id) || Boolean(lineup.appliedEventId);
      const diff = diffLineups(currentAssignments(), lineup.slots, { slots: config.slots });
      const flags: PlannedLineupFlag[] = [];
      for (const { memberId } of lineup.slots) {
        if (injuredInMatch.has(memberId)) {
          flags.push({ memberId, reason: "injured" });
          continue;
        }
        if (!pitch.has(memberId) && everLeftPitch.has(memberId)) {
          flags.push({ memberId, reason: "already-off" });
          continue;
        }
        if (squadIds.size > 0 && !squadIds.has(memberId)) {
          flags.push({ memberId, reason: "not-in-squad" });
        }
      }
      return {
        lineupId: lineup.id,
        fromMinute: lineup.fromMinute,
        isInitial: Boolean(lineup.isInitial),
        applied,
        appliedEventId: lineup.appliedEventId ?? null,
        due: currentMinute >= lineup.fromMinute,
        diff,
        flags,
      };
    });

  const pendingLineup =
    plannedLineups.find((lineup) => lineup.due && !lineup.applied && !lineup.diff.isEmpty) ?? null;

  const finished = phase === "finished";

  return {
    periods,
    clock: anchor,
    reading: readClock(anchor, periods, nowMs),
    phase,
    started: periodsStarted > 0,
    finished,
    periodsStarted,
    goalsFor,
    goalsAgainst,
    scoreLabel: scoreLineFr(goalsFor, goalsAgainst),
    result: finished ? (goalsFor > goalsAgainst ? "win" : goalsFor < goalsAgainst ? "loss" : "draw") : null,
    onPitch,
    goalkeeperId,
    bench,
    players: playerStates,
    timeline,
    concededAt,
    scoredAt,
    playIntervals: intervals,
    plannedLineups,
    pendingLineup,
    appliedLineupIds,
    voidedEventIds: [...voidedBy.keys()],
    anomalies,
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function newPlayer(memberId: string, squadRole: SquadRole | null): PlayerAcc {
  return {
    memberId,
    squadRole,
    playedMs: 0,
    cleanMs: 0,
    gkMs: 0,
    gkCleanMs: 0,
    concededWhileOn: 0,
    concededWhileGk: 0,
    goals: 0,
    assists: 0,
    ownGoals: 0,
    penaltiesScored: 0,
    penaltiesMissed: 0,
    fouls: 0,
    injuries: 0,
    wasGoalkeeper: false,
    spells: [],
    positionSpells: [],
  };
}

function closeLast<T extends { toClockMs: number | null }>(list: T[], atMs: number): void {
  const last = list[list.length - 1];
  if (last && last.toClockMs === null) last.toClockMs = atMs;
}

/** One player's state by id, for a UI that has a member and wants his line. */
export function playerState(state: MatchState, memberId: string): PlayerMatchState | undefined {
  return state.players.find((player) => player.memberId === memberId);
}

/** The timeline oldest-first is how it is built; game mode shows the newest at the top. */
export function reverseTimeline(state: MatchState): readonly TimelineEntry[] {
  return [...state.timeline].reverse();
}

/**
 * Rows for `match_player_stats`, which is a cache of exactly this (`docs/DATA_MODEL.md`): the
 * final whistle freezes the reduction, and an amendment recomputes it from scratch. `matchId` is
 * the caller's to add — the reducer does not know which match it just read.
 *
 * `cleanMinutes` is the field-player stat of decision 011; `gkCleanMinutes` and `concededWhileGk`
 * are the same two figures restricted to time in goal, which is what a keeper's clean sheet means
 * (decision 018). All five are columns, so a season aggregate never re-reduces the log.
 */
export function toMatchPlayerStats(state: MatchState): Array<{
  teamMemberId: string;
  minutes: number;
  goals: number;
  assists: number;
  ownGoals: number;
  penaltiesScored: number;
  penaltiesMissed: number;
  fouls: number;
  gkMinutes: number;
  cleanMinutes: number;
  concededWhileOn: number;
  gkCleanMinutes: number;
  concededWhileGk: number;
  squadRole: SquadRole | null;
}> {
  return state.players.map((player) => ({
    teamMemberId: player.memberId,
    minutes: player.minutes,
    goals: player.goals,
    assists: player.assists,
    ownGoals: player.ownGoals,
    penaltiesScored: player.penaltiesScored,
    penaltiesMissed: player.penaltiesMissed,
    fouls: player.fouls,
    gkMinutes: player.gkMinutes,
    cleanMinutes: player.cleanMinutes,
    concededWhileOn: player.concededWhileOn,
    gkCleanMinutes: player.gkCleanMinutes,
    concededWhileGk: player.concededWhileGk,
    squadRole: player.squadRole,
  }));
}

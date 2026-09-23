/**
 * The game-mode view model: pure, French, and the only place that turns reducer output into
 * something the screen can render.
 *
 * Why this file exists at all. `reduceMatch` is deliberately ignorant of names, shirt numbers and
 * pitch coordinates, and deliberately never reads the clock. Game mode needs all four. Rather than
 * scatter that plumbing through `'use client'` components where nothing can be tested, every
 * decision that has a right answer lives here: which minute an action is stamped with, which disc
 * is a ghost, which line the timeline prints, whether a substitution is offered for a player who
 * is already off.
 *
 * Nothing here touches the database, `Date.now()` or React — `presenter.test.ts` covers it.
 */

import type { Competition, EntryMode, MatchStatus, SquadRole } from "@/db/schema";
import {
  MS_PER_MINUTE,
  clockMsToMinute,
  formatMinuteLabelFr,
  periodStartMs,
  periodsConfig,
  projectClockMs,
  type PeriodsConfig,
} from "./clock";
import { EVENT_LABELS_FR, canBeVoided, type MatchEventType } from "./events";
import { describeLineupDiffFr, type SlotInfo } from "./lineup";
import {
  reduceMatch,
  type MatchEventRecord,
  type MatchState,
  type PlannedLineup,
  type PlannedLineupFlag,
  type PlannedLineupFlagReason,
  type PlannedLineupState,
  type SquadEntry,
} from "./reducer";

/* -------------------------------------------------------------------------- */
/* The serialisable shapes game mode is handed                                */
/* -------------------------------------------------------------------------- */

/**
 * These live here rather than in `live.ts` because both sides of the RSC boundary need them and
 * `live.ts` is `server-only`: a client component — or a Vitest run — importing it would throw.
 */

export type LiveMatchRow = {
  id: string;
  teamId: string;
  /** ISO 8601. */
  kickoffAt: string;
  opponentName: string;
  isHome: boolean;
  venue: string | null;
  competition: Competition;
  periodsCount: number;
  periodMinutes: number;
  status: MatchStatus;
  operatorUserId: string | null;
  /**
   * How the log came to exist. Game mode prints the biggest minute in the app, and decision 048
   * stamps the minutes a coach could not remember, so the screen owes the reader the sentence
   * « saisi après le match » when that is what happened — `entryModeBadgeFr`.
   *
   * `getMatch` has always returned this and `getLiveMatch` has always passed the row straight
   * through; only the type left it out, which is why `getRetroView` used to re-query for a value it
   * was already holding.
   */
  entryMode: EntryMode;
};

/** One row of `match_events`. */
export type LiveEvent = {
  id: string;
  clientEventId: string;
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  /** ISO 8601 — captured on the operator's device, not on the server (decision 004). */
  occurredAt: string;
  payload: unknown;
  voidsEventId: string | null;
  seq: number;
};

/** One `formation_slots` row: what the slot is, and where it sits (0..1000 permille). */
export type LiveSlot = {
  id: string;
  formationId: string;
  positionCode: string;
  x: number;
  y: number;
  sort: number;
};

export type LiveFormation = {
  id: string;
  name: string;
  label: string;
  /** A built-in template (`formations.team_id is null`) rather than one the team drew. */
  isBuiltin: boolean;
  slots: readonly LiveSlot[];
};

/** A planned composition and the assignments its prompt proposes (decision 006). */
export type LiveLineup = {
  id: string;
  fromMinute: number;
  isInitial: boolean;
  /** Null until the coach confirms it in game mode — invariant 3. */
  appliedEventId: string | null;
  formationId: string;
  formationLabel: string;
  slots: readonly { slotId: string; memberId: string }[];
};

export type LivePlayer = {
  memberId: string;
  displayName: string;
  jerseyNumber: number | null;
  /** Flagged, never blocked (decision 011): an injured player may still be fielded. */
  isInjured: boolean;
  /** From `match_squad`; null when the match sheet says nothing about them. */
  squadRole: SquadRole | null;
  /** Position codes they asked for, primary first. */
  positionCodes: readonly string[];
  isPlayer: boolean;
};

export type LiveMatch = {
  match: LiveMatchRow;
  /** `teams.primary_color` / `secondary_color` — the only arbitrary hex in the UI (decision 014). */
  kit: { primaryColor: string; secondaryColor: string };
  events: readonly LiveEvent[];
  lineups: readonly LiveLineup[];
  /** Every slot of every formation the match could refer to, so the reducer can find the goal. */
  slots: readonly LiveSlot[];
  formations: readonly LiveFormation[];
  /** The formation the ad-hoc composer opens on. */
  defaultFormationId: string | null;
  players: readonly LivePlayer[];
  /** True when `match_squad` has rows. Without one, game mode works off the whole roster. */
  hasSquadSheet: boolean;
};

/* -------------------------------------------------------------------------- */
/* Feeding the reducer                                                        */
/* -------------------------------------------------------------------------- */

/** An action the device has produced but the server has not confirmed yet. */
export type PendingEvent = {
  clientEventId: string;
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  occurredAt: string;
  payload?: unknown;
  voidsEventId?: string | null;
};

/**
 * Merge the confirmed log with what is still in the outbox.
 *
 * The screen must show a goal the instant it is tapped, before any network round trip: game mode is
 * used in places with no signal (decision 004). A queued action therefore gets a provisional `id`
 * — its own `client_event_id`, which is unique and will never collide with a `match_events.id` —
 * and a `seq` continuing the confirmed log, so `compareMatchEvents` orders it after everything
 * already stored at the same match time.
 *
 * An action the server has since confirmed is dropped from the pending side: the confirmed row is
 * the same event, with its real id, and counting it twice would double the score.
 */
export function mergeEvents(
  confirmed: readonly LiveEvent[],
  pending: readonly PendingEvent[],
): LiveEvent[] {
  const known = new Set(confirmed.map((event) => event.clientEventId));
  const maxSeq = confirmed.reduce((max, event) => Math.max(max, event.seq), -1);

  const extra: LiveEvent[] = [];
  for (const event of pending) {
    if (known.has(event.clientEventId)) continue;
    known.add(event.clientEventId);
    extra.push({
      id: event.clientEventId,
      clientEventId: event.clientEventId,
      type: event.type,
      period: event.period,
      minute: event.minute,
      clockMs: event.clockMs,
      occurredAt: event.occurredAt,
      payload: event.payload ?? {},
      voidsEventId: event.voidsEventId ?? null,
      seq: maxSeq + 1 + extra.length,
    });
  }

  return [...confirmed, ...extra];
}

/** `matches.periods_count` / `periods_minutes`, coerced. 2 × 30 by default (decision 009). */
export function periodsOf(match: Pick<LiveMatchRow, "periodsCount" | "periodMinutes">): PeriodsConfig {
  return periodsConfig(match);
}

/**
 * Reduce the log as of `nowMs`.
 *
 * `nowMs` is the caller's: the page ticks it so the clock and the minutes of the players on the
 * pitch advance. On a finished match the reducer ignores it, which is why a frozen match renders
 * identically for ever.
 */
export function reduceLive(
  live: LiveMatch,
  pending: readonly PendingEvent[],
  nowMs: number | null,
): MatchState {
  const events: MatchEventRecord[] = mergeEvents(live.events, pending);
  const lineups: PlannedLineup[] = live.lineups.map((lineup) => ({
    id: lineup.id,
    fromMinute: lineup.fromMinute,
    isInitial: lineup.isInitial,
    appliedEventId: lineup.appliedEventId,
    formationId: lineup.formationId,
    slots: lineup.slots,
  }));
  const squad: SquadEntry[] = live.players
    .filter((player): player is LivePlayer & { squadRole: SquadRole } => player.squadRole !== null)
    .map((player) => ({ teamMemberId: player.memberId, role: player.squadRole }));

  return reduceMatch(events, lineups, {
    periodsCount: live.match.periodsCount,
    periodMinutes: live.match.periodMinutes,
    slots: live.slots as readonly SlotInfo[],
    squad,
    nowMs,
  });
}

/* -------------------------------------------------------------------------- */
/* Stamping an action on the device                                           */
/* -------------------------------------------------------------------------- */

export type EventStamp = {
  period: number;
  minute: number;
  clockMs: number;
};

/**
 * The match time to record an action at, decided on the device the moment the coach taps.
 *
 * Two subtleties, both of which the reducer would otherwise have to guess at:
 *
 * 1. **A kick-off belongs to the period it starts.** At half time the clock is stopped at, say,
 *    31′20″ and `periodsStarted` is 1; the second-half kick-off is period 2. Its `clock_ms` is the
 *    later of the stopped clock and the period's nominal start, so the log never goes *backwards*
 *    (`compareMatchEvents` sorts by `clock_ms`, so a kick-off timed before the period end it
 *    follows would replay in the wrong order) and a half that ended early still starts the next
 *    one at 30′ — continuous minutes, decision 009.
 * 2. **Everything else takes the clock as it reads.** Including a pause: the pause *is* the event
 *    that stops the clock, so it is stamped at the time it happens.
 */
export function nextEventStamp(
  state: MatchState,
  type: MatchEventType,
  nowMs: number,
): EventStamp {
  const projected = projectClockMs(state.clock, nowMs);

  if (type === "KICKOFF") {
    const period = Math.min(state.periodsStarted + 1, state.periods.periodsCount);
    const clockMs = Math.max(projected, periodStartMs(period, state.periods));
    return { period, minute: clockMsToMinute(clockMs), clockMs };
  }

  return {
    period: Math.min(Math.max(1, state.clock.period), state.periods.periodsCount),
    minute: clockMsToMinute(projected),
    clockMs: projected,
  };
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

export type PlayerIndex = {
  get: (memberId: string) => LivePlayer | undefined;
  /** Always returns something printable: an unknown id reads « Joueur inconnu ». */
  nameOf: (memberId: string) => string;
};

export function playerIndex(players: readonly LivePlayer[]): PlayerIndex {
  const byId = new Map(players.map((player) => [player.memberId, player]));
  return {
    get: (memberId) => byId.get(memberId),
    nameOf: (memberId) => byId.get(memberId)?.displayName ?? "Joueur inconnu",
  };
}

/** A slot catalogue keyed by id, for position codes and coordinates. */
export function slotIndex(slots: readonly LiveSlot[]): Map<string, LiveSlot> {
  return new Map(slots.map((slot) => [slot.id, slot]));
}

/* -------------------------------------------------------------------------- */
/* The pitch                                                                  */
/* -------------------------------------------------------------------------- */

/** Structurally the `PitchSlot` of `components/pitch`, kept independent so this file stays pure. */
export type GamePitchSlot = {
  id: string;
  x: number;
  y: number;
  positionCode: string;
  player?: {
    id: string;
    name: string;
    jerseyNumber?: number | null;
    variant?: "normal" | "selected" | "unavailable" | "ghost";
    statusLabel?: string;
  } | null;
};

export type PitchViewOptions = {
  /** Highlighted with an accent ring: the player the action sheet is currently about. */
  selectedMemberId?: string | null;
  /** Which formation's slots to draw. Defaults to the slots the players on the pitch occupy. */
  formationId?: string | null;
};

/**
 * The pitch as it is right now.
 *
 * Drawn from the slots the players actually occupy, so an ad-hoc reshuffle that mixes two
 * formations still renders every player. An injured player keeps their disc — decision 011 flags,
 * it does not remove — with « blessé » under it.
 */
export function pitchView(
  state: MatchState,
  slots: readonly LiveSlot[],
  players: PlayerIndex,
  options: PitchViewOptions = {},
): GamePitchSlot[] {
  const byId = slotIndex(slots);
  const occupied = new Set(
    state.onPitch.map((entry) => entry.slotId).filter((id): id is string => Boolean(id)),
  );

  const formationId =
    options.formationId ??
    [...occupied].map((id) => byId.get(id)?.formationId).find((id): id is string => Boolean(id)) ??
    null;

  const shown = slots.filter(
    (slot) => slot.formationId === formationId || occupied.has(slot.id),
  );

  const result: GamePitchSlot[] = shown
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((slot) => {
      const entry = state.onPitch.find((item) => item.slotId === slot.id);
      const player = entry ? players.get(entry.memberId) : undefined;
      return {
        id: slot.id,
        x: slot.x,
        y: slot.y,
        positionCode: slot.positionCode,
        player: entry
          ? {
              id: entry.memberId,
              name: player?.displayName ?? "Joueur inconnu",
              jerseyNumber: player?.jerseyNumber ?? null,
              variant: options.selectedMemberId === entry.memberId ? "selected" : "normal",
              statusLabel: player?.isInjured ? "blessé" : undefined,
            }
          : null,
      };
    });

  // A player on the pitch in no known slot (a log referring to a deleted formation) would
  // otherwise vanish from the screen. Better a disc with no position than a missing player.
  for (const entry of state.onPitch) {
    if (entry.slotId && byId.has(entry.slotId)) continue;
    const player = players.get(entry.memberId);
    result.push({
      id: entry.slotId ?? `orphan-${entry.memberId}`,
      x: 500,
      y: 500,
      positionCode: entry.positionCode ?? "?",
      player: {
        id: entry.memberId,
        name: player?.displayName ?? "Joueur inconnu",
        jerseyNumber: player?.jerseyNumber ?? null,
        variant: options.selectedMemberId === entry.memberId ? "selected" : "normal",
        statusLabel: "poste inconnu",
      },
    });
  }

  return result;
}

/**
 * The composition a prompt proposes, drawn as ghosts (decision 006): translucent discs for the
 * players who are not there yet, danger rings for the ones the reducer flagged.
 */
export function proposedPitchView(
  assignments: readonly { slotId: string; memberId: string }[],
  slots: readonly LiveSlot[],
  players: PlayerIndex,
  options: { onPitchMemberIds?: readonly string[]; flags?: readonly { memberId: string; reason: PlannedLineupFlagReason }[] } = {},
): GamePitchSlot[] {
  const byId = slotIndex(slots);
  const onPitch = new Set(options.onPitchMemberIds ?? []);
  const flagged = new Map((options.flags ?? []).map((flag) => [flag.memberId, flag.reason]));

  return assignments
    .map((assignment) => ({ assignment, slot: byId.get(assignment.slotId) }))
    .filter((entry): entry is { assignment: { slotId: string; memberId: string }; slot: LiveSlot } =>
      Boolean(entry.slot),
    )
    .sort((a, b) => a.slot.sort - b.slot.sort)
    .map(({ assignment, slot }) => {
      const player = players.get(assignment.memberId);
      const reason = flagged.get(assignment.memberId);
      return {
        id: slot.id,
        x: slot.x,
        y: slot.y,
        positionCode: slot.positionCode,
        player: {
          id: assignment.memberId,
          name: player?.displayName ?? "Joueur inconnu",
          jerseyNumber: player?.jerseyNumber ?? null,
          variant: reason ? "unavailable" : onPitch.has(assignment.memberId) ? "normal" : "ghost",
          statusLabel: reason ? flagLabelFr(reason) : undefined,
        },
      };
    });
}

/* -------------------------------------------------------------------------- */
/* Player pickers                                                             */
/* -------------------------------------------------------------------------- */

export type PlayerOption = {
  memberId: string;
  name: string;
  jerseyNumber: number | null;
  /** « MC · 34’ », « remplaçant », « blessé » — whatever helps the coach pick in one glance. */
  subtitle: string | null;
  /** Shown as a danger tint: injured, or already off and being offered again. */
  warn: boolean;
};

/** The players on the pitch, in formation order: who can be taken off, fouled, or moved. */
export function onPitchOptions(
  state: MatchState,
  slots: readonly LiveSlot[],
  players: PlayerIndex,
): PlayerOption[] {
  const byId = slotIndex(slots);

  return state.onPitch
    .slice()
    .sort((a, b) => {
      const left = a.slotId ? byId.get(a.slotId)?.sort ?? 999 : 999;
      const right = b.slotId ? byId.get(b.slotId)?.sort ?? 999 : 999;
      return left - right;
    })
    .map((entry) => {
      const player = players.get(entry.memberId);
      const state_ = stateOf(state, entry.memberId);
      const parts = [entry.positionCode, state_ ? `${state_.minutes}’` : null].filter(Boolean);
      return {
        memberId: entry.memberId,
        name: player?.displayName ?? "Joueur inconnu",
        jerseyNumber: player?.jerseyNumber ?? null,
        subtitle: parts.length > 0 ? parts.join(" · ") : null,
        warn: Boolean(player?.isInjured),
      };
    });
}

/**
 * Who can come on.
 *
 * Every squad member who is not on the pitch, **plus** everyone else on the roster: the match sheet
 * is M3's and may not exist yet, and a coach who is one player short at 20′ needs whoever turned
 * up, not a validation error. The order carries the recommendation instead — named substitutes
 * first, then the rest of the squad, then players the sheet does not mention — and the subtitle
 * says which is which, so nothing is hidden and nothing is silently equivalent.
 */
export function availableOptions(state: MatchState, players: readonly LivePlayer[]): PlayerOption[] {
  const onPitch = new Set(state.onPitch.map((entry) => entry.memberId));

  return players
    .filter((player) => player.isPlayer && !onPitch.has(player.memberId))
    .slice()
    .sort((a, b) => optionRank(a) - optionRank(b) || a.displayName.localeCompare(b.displayName, "fr"))
    .map((player) => {
      const playerState = stateOf(state, player.memberId);
      const bits: string[] = [player.squadRole ? squadRoleLabelFr(player.squadRole) : "hors feuille"];
      if (playerState?.playedMatch) bits.push(`déjà joué ${playerState.minutes}’`);
      if (player.isInjured) bits.push("blessé");

      return {
        memberId: player.memberId,
        name: player.displayName,
        jerseyNumber: player.jerseyNumber,
        subtitle: bits.join(" · "),
        warn: player.isInjured,
      };
    });
}

/** Named substitutes first, then the rest of the squad, then supporters and non-selected players. */
function optionRank(player: LivePlayer): number {
  if (player.squadRole === "substitute") return 0;
  if (player.squadRole === "starter") return 1;
  if (player.squadRole === "supporter") return 3;
  return 2;
}

function stateOf(state: MatchState, memberId: string) {
  return state.players.find((player) => player.memberId === memberId);
}

/* -------------------------------------------------------------------------- */
/* The timeline                                                               */
/* -------------------------------------------------------------------------- */

export type TimelineLine = {
  eventId: string;
  clientEventId: string | null;
  /** `58’`, or `30’+2`. */
  minuteLabel: string;
  /** « But », « Changement »… */
  title: string;
  /** « Julien (passe de Karim) », « Léo → Yanis » — empty when the event is about nobody. */
  detail: string | null;
  /** `2 - 1` on the events that changed the score. */
  scoreLabel: string | null;
  /** A `VOID` points at this: show it struck through (invariant 1 — nothing is deleted). */
  voided: boolean;
  /** Still in the outbox: no `match_events.id` yet, so it cannot be annulled. */
  pending: boolean;
  /** Offer « annuler »: a voidable type, not already voided, and confirmed by the server. */
  canVoid: boolean;
  /** The event a `VOID` entry annuls, for the « annulation de … » line. */
  voidsEventId: string | null;
};

/**
 * The log, newest first, in French.
 *
 * Names come from the reducer's `actors`, not from re-reading payloads: the reducer has already
 * decided who was the scorer and who assisted, and a second interpretation of the same payload is
 * exactly how two parts of an app start disagreeing.
 */
export function timelineLines(
  state: MatchState,
  players: PlayerIndex,
  options: { pendingClientEventIds?: readonly string[] } = {},
): TimelineLine[] {
  const pending = new Set(options.pendingClientEventIds ?? []);

  return state.timeline
    .slice()
    .reverse()
    .map((entry) => {
      const isPending = Boolean(entry.clientEventId && pending.has(entry.clientEventId));
      return {
        eventId: entry.eventId,
        clientEventId: entry.clientEventId,
        minuteLabel: entry.minuteLabel,
        title: entry.labelFr,
        detail: describeActorsFr(entry.type, entry.actors, players),
        scoreLabel: entry.scoreAfter
          ? `${entry.scoreAfter.goalsFor} - ${entry.scoreAfter.goalsAgainst}`
          : null,
        voided: entry.voided,
        pending: isPending,
        canVoid: canBeVoided(entry.type) && !entry.voided && !isPending,
        voidsEventId: entry.voidsEventId,
      };
    });
}

/** Who an event was about, phrased the way a coach reads it out. */
function describeActorsFr(
  type: MatchEventType,
  actors: readonly { memberId: string; role: string }[],
  players: PlayerIndex,
): string | null {
  const find = (role: string) => actors.find((actor) => actor.role === role);
  const name = (memberId: string | undefined) => (memberId ? players.nameOf(memberId) : null);

  if (type === "GOAL_FOR" || type === "PENALTY_SCORED") {
    const scorer = name(find("scorer")?.memberId ?? find("penalty")?.memberId);
    const assist = name(find("assist")?.memberId);
    if (!scorer) return null;
    return assist ? `${scorer} (passe de ${assist})` : scorer;
  }
  if (type === "SUBSTITUTION") {
    const out = name(find("out")?.memberId);
    const into = name(find("in")?.memberId);
    if (!out && !into) return null;
    return `${out ?? "?"} → ${into ?? "?"}`;
  }
  if (type === "LINEUP_APPLIED") {
    // A composition is the one event that is about several people at once — a TERRAIN change can be
    // two substitutions and a move. Falling through to the single-actor case below would print one
    // arbitrary name and hide the rest, which is exactly what the coach would check the log for.
    const all = (role: string) =>
      actors.filter((actor) => actor.role === role).map((actor) => players.nameOf(actor.memberId));
    const parts = [
      labelledFr("Sort", "Sortent", all("out")),
      labelledFr("Entre", "Entrent", all("in")),
      labelledFr("Change de poste", "Changent de poste", all("moved")),
    ].filter((part): part is string => part !== null);
    return parts.length > 0 ? parts.join(" · ") : null;
  }

  const single =
    find("scorer") ?? find("penalty") ?? find("own-goal") ?? find("moved") ?? find("foul") ?? find("injured");
  return single ? players.nameOf(single.memberId) : null;
}

/** « Entre : Yanis », « Entrent : Yanis, Momo » — null for an empty list, so it disappears. */
function labelledFr(singular: string, plural: string, names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return `${names.length > 1 ? plural : singular} : ${names.join(", ")}`;
}

/* -------------------------------------------------------------------------- */
/* The planned-composition prompt                                             */
/* -------------------------------------------------------------------------- */

export type PendingLineupView = {
  lineupId: string;
  /** « Composition prévue à la 45’ ». */
  title: string;
  /** One line per change, in the order a coach would carry them out. */
  changes: readonly string[];
  /** « Ali est blessé », « Momo est déjà sorti » — shown in danger, never blocking. */
  warnings: readonly string[];
  /** The same warnings keyed by player, so the ghost pitch can ring the right discs. */
  flags: readonly PlannedLineupFlag[];
  /** The composition as it would be, for the read-only pitch. */
  slots: readonly { slotId: string; memberId: string }[];
  /** Nothing would change: the prompt is pointless and is not raised. */
  isEmpty: boolean;
};

/**
 * The prompt for a planned composition that has come due.
 *
 * **Invariant 3**: this only ever describes. Applying it is a `LINEUP_APPLIED` event the coach
 * confirms; until then `lineups.applied_event_id` stays null and the pitch is unchanged.
 */
export function pendingLineupView(
  pending: PlannedLineupState | null,
  lineups: readonly LiveLineup[],
  players: PlayerIndex,
): PendingLineupView | null {
  if (!pending) return null;
  const lineup = lineups.find((row) => row.id === pending.lineupId);
  if (!lineup) return null;

  const flags = mergeLineupFlags(pending.flags, lineup.slots, players);

  return {
    lineupId: pending.lineupId,
    title: pending.isInitial
      ? "Composition de départ"
      : `Composition prévue à la ${pending.fromMinute}’`,
    /*
     * The starting composition is not a set of changes — it is the team sheet, and the ghost pitch
     * beside this list already shows it. Listing seven arrivals under « Composition de départ »
     * would be the « 7 changements » lie again. For every later plan the list is complete, unpaired
     * arrivals included: this diff is against the *pitch*, which may be down to six.
     */
    changes: pending.isInitial ? [] : describeLineupDiffFr(pending.diff, players.nameOf),
    warnings: flags.map((flag) => `${players.nameOf(flag.memberId)} est ${flagLabelFr(flag.reason)}`),
    flags,
    slots: lineup.slots,
    isEmpty: pending.diff.isEmpty,
  };
}

/**
 * The reducer's flags plus the ones only the roster knows about.
 *
 * `reduceMatch` flags a player injured when *this match's log* says so — it has no idea that
 * `team_members.is_injured` was ticked on Tuesday. Decision 011 says an injury is a flag and never a
 * block, so the prompt shows both kinds and lets the coach field the player anyway. The reducer's
 * reason wins when both apply: "déjà sorti" in this match is the more specific fact.
 */
function mergeLineupFlags(
  reducerFlags: readonly PlannedLineupFlag[],
  assignments: readonly { memberId: string }[],
  players: PlayerIndex,
): PlannedLineupFlag[] {
  const flags: PlannedLineupFlag[] = [...reducerFlags];
  const known = new Set(flags.map((flag) => flag.memberId));

  for (const { memberId } of assignments) {
    if (known.has(memberId)) continue;
    if (!players.get(memberId)?.isInjured) continue;
    known.add(memberId);
    flags.push({ memberId, reason: "injured" });
  }

  return flags;
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                     */
/* -------------------------------------------------------------------------- */

export function flagLabelFr(reason: PlannedLineupFlagReason): string {
  switch (reason) {
    case "injured":
      return "blessé";
    case "already-off":
      return "déjà sorti";
    case "not-in-squad":
      return "absent de la feuille de match";
  }
}

export function squadRoleLabelFr(role: SquadRole): string {
  switch (role) {
    case "starter":
      return "titulaire";
    case "substitute":
      return "remplaçant";
    case "supporter":
      return "supporter";
  }
}

/** The discreet badge: « 3 actions en attente ». */
export function pendingCountLabelFr(count: number): string {
  if (count <= 0) return "Tout est enregistré";
  return count === 1 ? "1 action en attente" : `${count} actions en attente`;
}

/** What the big button says, which is the whole of the coach's decision at that moment. */
export function clockActionFr(state: MatchState): {
  label: string;
  event: "KICKOFF" | "PERIOD_END" | "PAUSE" | "RESUME" | "FINAL_WHISTLE" | null;
} {
  const { phase } = state;

  if (phase === "finished") return { label: "Match terminé", event: null };
  if (phase === "before-kickoff") return { label: "Coup d’envoi", event: "KICKOFF" };
  if (phase === "paused") return { label: "Reprendre", event: "RESUME" };
  if (phase === "break") {
    return state.periodsStarted >= state.periods.periodsCount
      ? { label: "Coup de sifflet final", event: "FINAL_WHISTLE" }
      : { label: `Coup d’envoi ${ordinalPeriodFr(state.periodsStarted + 1)}`, event: "KICKOFF" };
  }
  // Running: the period has to be closed before anything else can happen.
  return { label: periodEndLabelFr(state), event: "PERIOD_END" };
}

function periodEndLabelFr(state: MatchState): string {
  const isLast = state.clock.period >= state.periods.periodsCount;
  if (isLast) return "Fin du match";
  return state.periods.periodsCount === 2 ? "Mi-temps" : `Fin de la ${ordinalPeriodFr(state.clock.period)}`;
}

function ordinalPeriodFr(period: number): string {
  switch (period) {
    case 1:
      return "1re période";
    case 2:
      return "2e période";
    default:
      return `${period}e période`;
  }
}

/** The state line under the clock: « 2e période », « Mi-temps », « Pause »… */
export function phaseLabelFr(state: MatchState): string {
  switch (state.phase) {
    case "before-kickoff":
      return "Avant le coup d’envoi";
    case "running":
      return ordinalPeriodFr(state.clock.period);
    case "paused":
      return "Jeu arrêté";
    case "break":
      return state.periodsStarted >= state.periods.periodsCount
        ? "Fin du temps réglementaire"
        : state.periods.periodsCount === 2
          ? "Mi-temps"
          : `Fin de la ${ordinalPeriodFr(state.clock.period)}`;
    case "finished":
      return "Match terminé";
  }
}

/** « 12’ » and « 30’+2 » for an arbitrary match time, for the prompt and the composer. */
export function minuteLabelFr(clockMs: number, period: number, periods: PeriodsConfig): string {
  return formatMinuteLabelFr(clockMs, period, periods);
}

/** French label of an event type, for the ACTION sheet. */
export function eventLabel(type: MatchEventType): string {
  return EVENT_LABELS_FR[type];
}

/** Whole minutes of a match time — the composer's « à partir de la 45’ ». */
export function wholeMinutes(clockMs: number): number {
  return Math.floor(Math.max(0, clockMs) / MS_PER_MINUTE);
}

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

import type { EntryMode, MatchStatus, SquadRole } from "@/db/schema";
import { scoreLineFr } from "@/lib/calendar/labels";
import {
  MS_PER_MINUTE,
  clockMsToMinute,
  formatMinuteLabelFr,
  periodStartMs,
  periodsConfig,
  projectClockMs,
  type PeriodsConfig,
} from "./clock";
import { EVENT_LABELS_FR, canBeVoided, remarkLabelFr, type MatchEventType } from "./events";
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
  type TimelineEntry,
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
  competitionId: string;
  /** The label the team gave it (decision 107), carried rather than looked up in a fixed map. */
  competitionLabel: string;
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
  /**
   * What the composer offers: the one formation (decision 157), or nothing on a database that never
   * loaded it. `slots` above stays the whole catalogue, for the log's sake.
   */
  formations: readonly LiveFormation[];
  /** The one formation's id — what the ad-hoc composer and an empty pitch are drawn on. */
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
export function periodsOf(
  match: Pick<LiveMatchRow, "periodsCount" | "periodMinutes">,
): PeriodsConfig {
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
export function nextEventStamp(state: MatchState, type: MatchEventType, nowMs: number): EventStamp {
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

  const shown = slots.filter((slot) => slot.formationId === formationId || occupied.has(slot.id));

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
  options: {
    onPitchMemberIds?: readonly string[];
    flags?: readonly { memberId: string; reason: PlannedLineupFlagReason }[];
  } = {},
): GamePitchSlot[] {
  const byId = slotIndex(slots);
  const onPitch = new Set(options.onPitchMemberIds ?? []);
  const flagged = new Map((options.flags ?? []).map((flag) => [flag.memberId, flag.reason]));

  return assignments
    .map((assignment) => ({ assignment, slot: byId.get(assignment.slotId) }))
    .filter(
      (entry): entry is { assignment: { slotId: string; memberId: string }; slot: LiveSlot } =>
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
      const left = a.slotId ? (byId.get(a.slotId)?.sort ?? 999) : 999;
      const right = b.slotId ? (byId.get(b.slotId)?.sort ?? 999) : 999;
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
export function availableOptions(
  state: MatchState,
  players: readonly LivePlayer[],
): PlayerOption[] {
  const onPitch = new Set(state.onPitch.map((entry) => entry.memberId));

  return players
    .filter((player) => player.isPlayer && !onPitch.has(player.memberId))
    .slice()
    .sort(
      (a, b) => optionRank(a) - optionRank(b) || a.displayName.localeCompare(b.displayName, "fr"),
    )
    .map((player) => {
      const playerState = stateOf(state, player.memberId);
      const bits: string[] = [
        player.squadRole ? squadRoleLabelFr(player.squadRole) : "hors feuille",
      ];
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

/*
 * `enterableCardFr` used to live here: the heading and hint of the list of everybody off the pitch,
 * « Qui peut entrer » for the operator and « En dehors du terrain » for a reader (decision 087).
 * Game mode no longer draws that list at all (decision 192), and `availableOptions` is now read only
 * by the pickers « Qui entre ? » asks with — which is where bringing a player on always happened.
 */

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
  /**
   * Offer « annuler »: a voidable type, not already voided, confirmed by the server, and not the
   * starting composition. Annulling the `LINEUP_APPLIED` that put the seven on an empty pitch left
   * game mode with no pitch at all (decision 150), so that one line has no « Annuler »; a later
   * composition or TERRAIN change keeps it, since one `VOID` there puts the pitch back as it was.
   * `appendMatchEvents` refuses the same `VOID` if it is crafted by hand.
   */
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
        title: pitchEventFr(entry, players.nameOf)?.title ?? entry.labelFr,
        detail: detailFr(entry, players),
        scoreLabel: entry.scoreAfter
          ? scoreLineFr(entry.scoreAfter.goalsFor, entry.scoreAfter.goalsAgainst)
          : null,
        voided: entry.voided,
        pending: isPending,
        canVoid: canBeVoided(entry.type) && !entry.voided && !isPending && !entry.startingLineup,
        voidsEventId: entry.voidsEventId,
      };
    });
}

/**
 * The detail line of an event that carries free text — today only a `COMMENT` (decision 114).
 *
 * **Shared with the recap** (`lib/rating/recap.ts`), which is why it is exported. The two timelines
 * in the app phrase everything *else* differently on purpose: the recap says « Julien Marchal, passe
 * de Karim Benali » and game mode says « Julien (passe de Karim) », because one is read afterwards
 * and the other at arm's length while the match is going on. A note is not one of those differences
 * — it is the coach's own 280 characters either way — and when each module had its own detail
 * builder only this one knew about `note` and the `commented` role, so a comment rendered in the
 * recap as « 14’ · Commentaire » with nothing under it: the one screen the note exists for was the
 * one screen that dropped it. One formatter, called by both, means the next event type that carries
 * text costs one branch rather than two that can disagree.
 *
 * It lives in this file rather than in a third one because `lib/rating` already depends on
 * `lib/match` and the reverse would invert that.
 *
 * A comment attached to nobody is its note alone; attached to a player it reads « Karim : trop haut
 * sur le côté », the same « name : text » idiom as `labelledFr`. Returns null for an entry with no
 * note — which is every other event — so the caller falls through to its own actor phrasing.
 */
export function noteDetailFr(
  entry: Pick<TimelineEntry, "note" | "actors">,
  nameOf: (memberId: string) => string,
): string | null {
  if (!entry.note) return null;
  const about = entry.actors.find((actor) => actor.role === "commented");
  return about ? `${nameOf(about.memberId)} : ${entry.note}` : entry.note;
}

/**
 * The detail line of a `REMARK`: « Bel effort — Karim ».
 *
 * The kind comes first because it is the news; the title above it only says « Remarque », so
 * without this line the entry would state nothing at all. **Shared with the recap** for the reason
 * `noteDetailFr` spells out: a remark is one of the things the shared match summary exists to show,
 * and a second formatter is how one screen ends up dropping it.
 *
 * Returns null for a remark whose kind this build does not know, so the caller falls through to its
 * own actor phrasing, which names the player alone: the reducer keeps the `remarked` actor of any
 * remark that parsed at all, precisely so that an unfamiliar word costs the word and not the name
 * (decision 122). « Remarque — Karim » says less than « Bel effort — Karim » and nothing untrue.
 *
 * The fallback to the label alone, for a kind with no actor beside it, is belt and braces: the
 * reducer never produces one, since a payload without a `memberId` does not parse and therefore has
 * no kind either. It is one branch rather than a judgement about what a hand-built entry may hold.
 */
export function remarkDetailFr(
  entry: Pick<TimelineEntry, "remarkKind" | "actors">,
  nameOf: (memberId: string) => string,
): string | null {
  if (!entry.remarkKind) return null;
  const about = entry.actors.find((actor) => actor.role === "remarked");
  const label = remarkLabelFr(entry.remarkKind);
  return about ? `${label} — ${nameOf(about.memberId)}` : label;
}

/** The line under the title: the free text the event carries, or who it was about. */
function detailFr(entry: TimelineEntry, players: PlayerIndex): string | null {
  const pitchEvent = pitchEventFr(entry, players.nameOf);
  if (pitchEvent) return pitchEvent.detail;
  return (
    noteDetailFr(entry, players.nameOf) ??
    remarkDetailFr(entry, players.nameOf) ??
    describeActorsFr(entry.type, entry.actors, players)
  );
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
  const single =
    find("scorer") ??
    find("penalty") ??
    find("own-goal") ??
    find("moved") ??
    find("foul") ??
    find("injured") ??
    find("commented") ??
    find("remarked");
  return single ? players.nameOf(single.memberId) : null;
}

/**
 * What a `LINEUP_APPLIED` is called and what it says, for game mode's timeline **and** the recap's
 * Déroulé — one helper, so the two screens cannot disagree about a change (decision 152). Null for
 * every other type, which keeps its own label and detail.
 *
 * A group change is one `LINEUP_APPLIED` (decision 147), so the event type says nothing about what
 * happened; the actors the reducer derived from the diff do:
 *
 * - it filled an empty pitch → « Composition de départ », and the seven who walked on, each with
 *   the post he takes;
 * - somebody went on or off → « Changement », « Entrent : Clément (AIL), Lucas (DC) — Sortent :
 *   Léo, Julien », with any position moves after them;
 * - only moves → « Changement de poste », « Postes : Karim → AT, Julien → MC »;
 * - only side swaps → « Changement de côté », no detail. See below.
 * - no actors at all → « Changement », no detail. That is an annulled change (the reducer derives
 *   nothing from a voided event, so the struck-through line still says what it was) or a
 *   re-confirmation of the pitch as it stood.
 *
 * **An arrival carries his post in parentheses** — the owner's own words: « we need to see the
 * positions of the players coming in ». The seven of a composition are not interchangeable and
 * « Clément entre » answered none of the question a reader actually has. Departures carry nothing:
 * the post a man takes is news, the post he vacated is already on the line above.
 *
 * **A side swap is not a position change** (decision 181). The two `AIL` slots are one position and
 * so are the two `DC` slots (decision 157, « ne pas faire de différence »), so a player crossing
 * between them changed slot, not post — and « Pierre → AIL » about a man who was an ailier a second
 * ago was the Déroulé inventing a change. The rule is the position **code**: a move is reported when
 * the code differs, and dropped when it does not. That is also why an event whose every move is a
 * side swap gets a title of its own rather than « Changement de poste » over an empty detail: the
 * coach did move people, and nothing he did changed anybody's post.
 *
 * In and out are listed unpaired, because that is how they were entered: « on s'en fiche de savoir
 * qui remplace qui ».
 */
export function pitchEventFr(
  entry: Pick<TimelineEntry, "type" | "actors" | "startingLineup">,
  nameOf: (memberId: string) => string,
): { title: string; detail: string | null } | null {
  if (entry.type !== "LINEUP_APPLIED") return null;

  const of = (role: string) => entry.actors.filter((actor) => actor.role === role);
  const names = (role: string) => of(role).map((actor) => nameOf(actor.memberId));
  // « Clément (AIL) ». No parentheses for a slot the catalogue does not know: an empty pair of them
  // would read as a post the app failed to print rather than as one it never had.
  const arrivals = of("in").map((actor) =>
    actor.positionCode ? `${nameOf(actor.memberId)} (${actor.positionCode})` : nameOf(actor.memberId),
  );
  const changedPost = of("moved").filter(
    (actor) => !actor.fromPositionCode || actor.fromPositionCode !== actor.positionCode,
  );
  const sideSwaps = of("moved").length - changedPost.length;
  const moves = changedPost.map((actor) =>
    actor.positionCode ? `${nameOf(actor.memberId)} → ${actor.positionCode}` : nameOf(actor.memberId),
  );

  const parts = [
    labelledFr("Entre", "Entrent", arrivals),
    labelledFr("Sort", "Sortent", names("out")),
    labelledFr("Poste", "Postes", moves),
  ].filter((part): part is string => part !== null);
  const detail = parts.length > 0 ? parts.join(" — ") : null;

  if (entry.startingLineup) return { title: "Composition de départ", detail };
  if (of("in").length > 0 || of("out").length > 0) return { title: "Changement", detail };
  if (moves.length > 0) return { title: "Changement de poste", detail };
  if (sideSwaps > 0) return { title: "Changement de côté", detail };
  return { title: "Changement", detail };
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
  return lineupViewOf(pending, lineups, players);
}

/** One plan described against the pitch as it stands. Null when `lineups` does not carry it. */
function lineupViewOf(
  plan: PlannedLineupState,
  lineups: readonly LiveLineup[],
  players: PlayerIndex,
): PendingLineupView | null {
  const lineup = lineups.find((row) => row.id === plan.lineupId);
  if (!lineup) return null;

  const flags = mergeLineupFlags(plan.flags, lineup.slots, players);

  return {
    lineupId: plan.lineupId,
    title: plan.isInitial ? "Composition de départ" : `Composition prévue à la ${plan.fromMinute}’`,
    /*
     * The starting composition is not a set of changes — it is the team sheet, and the ghost pitch
     * beside this list already shows it. Listing seven arrivals under « Composition de départ »
     * would be the « 7 changements » lie again. For every later plan the list is complete, unpaired
     * arrivals included: this diff is against the *pitch*, which may be down to six.
     */
    changes: plan.isInitial ? [] : describeLineupDiffFr(plan.diff, players.nameOf),
    warnings: flags.map(
      (flag) => `${players.nameOf(flag.memberId)} est ${flagLabelFr(flag.reason)}`,
    ),
    flags,
    slots: lineup.slots,
    isEmpty: plan.diff.isEmpty,
  };
}

/* -------------------------------------------------------------------------- */
/* Stepping through the plans                                                 */
/* -------------------------------------------------------------------------- */

/**
 * One planned composition as the browser shows it: the same description the prompt gives, plus what
 * the match has done with the plan so far.
 */
export type PlannedLineupCard = PendingLineupView & {
  /** The minute it was drawn *for*. Never rewritten: it is a plan, not a record (decision 193). */
  fromMinute: number;
  isInitial: boolean;
  /** The log has a standing `LINEUP_APPLIED` naming it, so it will not be proposed again. */
  applied: boolean;
  /** Its minute has come. */
  due: boolean;
  /** What the sheet says under the title — read `plannedLineupStatusFr`. */
  statusFr: string;
  /** The shape to draw, for an « Ajuster » that starts from this plan. */
  formationId: string | null;
};

/**
 * Every composition planned for this match, in minute order, each described against the pitch as it
 * stands right now (decision 193).
 *
 * The reducer has already done the work: `state.plannedLineups` carries one entry per plan with its
 * diff against the current pitch, its flags, whether its minute has come and whether the log has
 * applied it. This turns that list into French, and it is deliberately the **whole** list — a plan
 * already applied, and a plan whose minute is still half an hour away, are both things the coach
 * asked to be able to look at and apply.
 */
export function plannedLineupViews(
  plans: readonly PlannedLineupState[],
  lineups: readonly LiveLineup[],
  players: PlayerIndex,
  options: { canApply: boolean },
): PlannedLineupCard[] {
  const cards: PlannedLineupCard[] = [];
  for (const plan of plans) {
    const view = lineupViewOf(plan, lineups, players);
    if (!view) continue;
    cards.push({
      ...view,
      fromMinute: plan.fromMinute,
      isInitial: plan.isInitial,
      applied: plan.applied,
      due: plan.due,
      statusFr: plannedLineupStatusFr({
        applied: plan.applied,
        due: plan.due,
        fromMinute: plan.fromMinute,
        canApply: options.canApply,
      }),
      formationId: lineups.find((row) => row.id === plan.lineupId)?.formationId ?? null,
    });
  }
  return cards;
}

/**
 * What the browser says about one plan — the one sentence that has to stay true however the coach
 * uses it (decision 193).
 *
 * Three facts, and they are not the same fact: a plan the log has already applied will **not** be
 * proposed again when its minute comes round, because the reducer raises `pendingLineup` only for a
 * plan it has no standing application for; a plan whose minute has come and which nothing applied is
 * the prompt's own case; and a plan drawn for later can be applied now, in which case the event is
 * stamped at the confirmation and the plan's own `from_minute` is left alone.
 *
 * Here rather than in the component for the reason `emptyPitchFr` gives: Vitest runs in `node` and
 * cannot render a client component, so a sentence this easy to get backwards lives where a test can
 * read it.
 */
export function plannedLineupStatusFr(input: {
  applied: boolean;
  due: boolean;
  fromMinute: number;
  /** The viewer may operate the match, so applying is theirs to do. */
  canApply: boolean;
}): string {
  if (input.applied) return "Déjà appliquée : elle ne sera plus proposée.";
  if (input.due) {
    return input.canApply
      ? "Son heure est venue et rien n’a changé sur le terrain : rien ne bouge avant ta confirmation."
      : "Son heure est venue, pas encore appliquée.";
  }
  return input.canApply
    ? `Prévue à la ${input.fromMinute}’. Tu peux l’appliquer tout de suite : elle sera enregistrée à la minute de ta confirmation.`
    : `Prévue à la ${input.fromMinute}’, pas encore appliquée.`;
}

/** « 2 sur 5 » — where the browser is in the list. */
export function plannedLineupStepFr(index: number, total: number): string {
  return `${index + 1} sur ${total}`;
}

/** Either the ordered list of changes, or the one sentence that stands in for it. */
export type PendingLineupChanges =
  { kind: "list"; lines: readonly string[] } | { kind: "sentence"; text: string };

/**
 * What the prompt says about what would happen — and why « aucun changement » is not always it.
 *
 * `pendingLineupView` sends **no** change list for the starting composition on purpose: seven
 * arrivals are the team sheet, not seven substitutions, and the ghost pitch beside the list already
 * shows them. « 7 changements » for the starting seven was a real defect.
 *
 * But an empty list and *nothing would happen* are opposite things, and the card rendered both as
 * « Cette composition ne change rien sur le terrain. » — printed over a full starting seven waiting
 * to walk onto an empty pitch. The lie was fixed in one direction and reappeared in the other.
 *
 * So the two silences are told apart here, and by the diff rather than by the list: `isEmpty` is the
 * reducer's answer to « would applying this change anything ». It is a function and not an `if` in
 * the component because the component cannot be unit-tested (`environment: "node"`) and this sentence
 * has now been wrong twice.
 */
/**
 * What to say about a pitch with nobody on it.
 *
 * It said « Aucune composition enregistrée » on the strength of an empty pitch alone, which is a
 * different fact and often the wrong one: the screen that found this was showing a saved composition
 * *twenty pixels above*, proposed and waiting for a confirmation that invariant 3 requires. An empty
 * pitch before kick-off is the normal state of a match that has been prepared properly.
 *
 * Here rather than in the component for the same reason as `pendingLineupChangesFr`: Vitest runs in
 * `node` and cannot render a client component, so copy this easy to get backwards has to live where a
 * test can read it.
 */
export function emptyPitchFr(input: {
  /** Any composition saved for this match, applied or not. */
  hasLineups: boolean;
  /** One of them is on screen right now, proposed and unapplied. */
  isProposed: boolean;
  /** The viewer may operate the match, so the confirmation is theirs to give. */
  canOperate: boolean;
  /** A period has kicked off: game mode no longer applies the starting composition on its own. */
  started?: boolean;
}): { title: string; description: string } {
  if (!input.hasLineups) {
    return {
      title: "Aucune composition enregistrée.",
      description:
        "Sans composition, personne n’accumule de minutes. Renseigne-la avant le coup d’envoi.",
    };
  }
  if (input.isProposed) {
    return {
      title: "Personne n’est encore sur le terrain.",
      description: input.canOperate
        ? "La composition ci-dessus attend ta confirmation : c’est elle qui fait entrer les joueurs."
        : // Decision 153: before the kick-off the operator taps nothing for the starting seven,
          // opening game mode is enough — so that is what a viewer is told he is waiting for. After
          // it, game mode no longer applies anything on its own, and the operator has to confirm.
          input.started
          ? "La composition ci-dessus attend la confirmation de l’opérateur : c’est elle qui fait entrer les joueurs."
          : "La composition ci-dessus entre sur le terrain dès que l’opérateur ouvre le mode match.",
    };
  }
  return {
    title: "Personne n’est encore sur le terrain.",
    description: input.canOperate
      ? "La composition est enregistrée mais pas encore appliquée : ouvre-la pour faire entrer les joueurs."
      : "La composition est enregistrée mais pas encore appliquée.",
  };
}

export function pendingLineupChangesFr(view: PendingLineupView): PendingLineupChanges {
  if (view.changes.length > 0) return { kind: "list", lines: view.changes };
  if (view.isEmpty) {
    return { kind: "sentence", text: "Cette composition ne change rien sur le terrain." };
  }
  // The starting composition: every slot is an arrival, because the pitch is empty.
  const count = view.slots.length;
  return {
    kind: "sentence",
    text: count === 1 ? "1 joueur entre en jeu." : `${count} joueurs entrent en jeu.`,
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

/**
 * What the big button says, which is the whole of the coach's decision at that moment.
 *
 * `shortLabel` is the same decision in as few letters as it can be said: the game-mode bottom bar
 * gives this button a quarter of a 393 px screen, where « Coup de sifflet final » does not fit.
 * It stays in this function rather than a second one so that the labels of one action cannot drift
 * apart, and it was purely additive — every caller reading `label` was untouched.
 *
 * **Every pair has to satisfy WCAG 2.5.3 Label in Name**: game mode prints `shortLabel` and
 * announces `name` as the `aria-label`, so the visible text must appear in the accessible name as a
 * *whole word*, or « clique sur Début » activates nothing. The final whistle is where that was first
 * found: « Fin » occurs in « Coup de sifflet final » only inside *final*, and that is the button that
 * ends the match and freezes `match_player_stats`. There the **short** label changed, to « Sifflet ».
 *
 * `name` exists because the second failure could not be fixed that way. « Envoi » is a word a coach
 * has to translate — the button starts the match, and « Début » is what the thing is called — so the
 * short label of both kick-off branches is « Début », and « Début » is not a word of « Coup d’envoi ».
 * The football term is the right `label` and the visible word is the right `shortLabel`, so the
 * accessible name is the one that gives way: it carries both, « Début : coup d’envoi », and voice
 * control saying what it can read still hits the button. Everywhere else `name` *is* `label`, and it
 * stays in this function rather than being assembled at the call site so that the three strings of one
 * action cannot drift apart. `presenter.test.ts` walks every reachable phase and asserts the
 * containment against `name`.
 */
export function clockActionFr(state: MatchState): {
  label: string;
  shortLabel: string;
  /** What the button announces — `label`, unless the visible short label is not a word of it. */
  name: string;
  event: "KICKOFF" | "PERIOD_END" | "PAUSE" | "RESUME" | "FINAL_WHISTLE" | null;
} {
  const { phase } = state;

  if (phase === "finished") {
    return { label: "Match terminé", shortLabel: "Terminé", name: "Match terminé", event: null };
  }
  if (phase === "before-kickoff") {
    return {
      label: KICKOFF_FR,
      shortLabel: KICKOFF_SHORT_FR,
      name: kickoffNameFr(KICKOFF_FR),
      event: "KICKOFF",
    };
  }
  if (phase === "paused") {
    return { label: "Reprendre", shortLabel: "Reprendre", name: "Reprendre", event: "RESUME" };
  }
  if (phase === "break") {
    // Only a log written before decision 151 stops here: the last period used to be closed with
    // « Fin » and the match ended with a second tap. Such a match still needs its whistle.
    if (state.periodsStarted >= state.periods.periodsCount) return FINAL_WHISTLE_ACTION;
    const nextKickoff = `${KICKOFF_FR} ${ordinalPeriodFr(state.periodsStarted + 1)}`;
    return {
      label: nextKickoff,
      shortLabel: KICKOFF_SHORT_FR,
      name: kickoffNameFr(nextKickoff),
      event: "KICKOFF",
    };
  }
  // Running in the last period: one tap ends the match (decision 151). The confirmation sheet then
  // writes `finalWhistleEvents(state)` — the period's end and the whistle, in one batch.
  if (state.clock.period >= state.periods.periodsCount) return FINAL_WHISTLE_ACTION;
  // Running in any other period: it has to be closed before the next one can start.
  const periodEnd = periodEndLabelFr(state);
  return {
    label: periodEnd,
    // « Mi-temps » is already as short as it gets; « Fin de la 2e période » is not, and in a bar
    // where the clock is right there, « Fin » says the same thing.
    shortLabel: periodEnd === HALF_TIME_FR ? periodEnd : "Fin",
    name: periodEnd,
    event: "PERIOD_END",
  };
}

const FINAL_WHISTLE_FR = "Coup de sifflet final";

/** « Sifflet » is a word of « Coup de sifflet final », so the name can be the label (WCAG 2.5.3). */
const FINAL_WHISTLE_ACTION = {
  label: FINAL_WHISTLE_FR,
  shortLabel: "Sifflet",
  name: FINAL_WHISTLE_FR,
  event: "FINAL_WHISTLE",
} as const;

/**
 * What confirming « Coup de sifflet final » writes, in this order.
 *
 * From a running (or paused) last period it is the period's end **and** the whistle: the two taps
 * « Fin » then « Sifflet » that the coach used to make, as one (decision 151). Both events are
 * written, rather than the whistle alone, so the log reads exactly as it did when they were two taps
 * — every consumer of `PERIOD_END` (the clock, the play intervals, the recap) sees what it always
 * saw. They carry the same stamp and are queued together, so `seq` keeps them in this order.
 *
 * From a break — a log that stopped after the old « Fin » — the period is already closed, and a
 * second `PERIOD_END` would be an anomaly; only the whistle is written.
 */
export function finalWhistleEvents(state: MatchState): readonly ("PERIOD_END" | "FINAL_WHISTLE")[] {
  return state.phase === "running" || state.phase === "paused"
    ? ["PERIOD_END", "FINAL_WHISTLE"]
    : ["FINAL_WHISTLE"];
}

const KICKOFF_FR = "Coup d’envoi";

/**
 * The visible word on the button that starts a period. « Envoi » is half of a term; « Début » is what
 * a coach would say out loud, and it is four letters either way.
 */
const KICKOFF_SHORT_FR = "Début";

/** « Début : coup d’envoi 2e période » — the visible word first, so it is a word of the name. */
function kickoffNameFr(label: string): string {
  return `${KICKOFF_SHORT_FR} : ${label.toLocaleLowerCase("fr-FR")}`;
}

const HALF_TIME_FR = "Mi-temps";

/** The end of a period that is not the last one: the last one ends with the whistle. */
function periodEndLabelFr(state: MatchState): string {
  return state.periods.periodsCount === 2
    ? HALF_TIME_FR
    : `Fin de la ${ordinalPeriodFr(state.clock.period)}`;
}

/** « 1re période », « 2e période » — the one spelling, shared with game mode's header. */
export function ordinalPeriodFr(period: number): string {
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

/**
 * « 12’ » for an arbitrary match time, for the prompt and the composer.
 *
 * One argument since decision 213: a minute is counted from the kick-off of the match, so the label
 * does not depend on which period the moment falls in. It kept a `period` and the period's real start
 * while decision 209 mapped each half back onto its nominal one; both are gone, and so is « 30’+2 ».
 */
export function minuteLabelFr(clockMs: number): string {
  return formatMinuteLabelFr(clockMs);
}

/** French label of an event type, for the ACTION sheet. */
export function eventLabel(type: MatchEventType): string {
  return EVENT_LABELS_FR[type];
}

/** Whole minutes of a match time — the composer's « à partir de la 45’ ». */
export function wholeMinutes(clockMs: number): number {
  return Math.floor(Math.max(0, clockMs) / MS_PER_MINUTE);
}

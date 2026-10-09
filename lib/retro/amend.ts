/**
 * Correcting a match that is already finished.
 *
 * « Le but de la 27ᵉ, ce n'était pas Karim, c'était Momo. » The coach realises it on Monday, two
 * days after the final whistle, after twelve people have already given their ratings. The log is
 * append-only (invariant 1), so the correction is not an `UPDATE`: it is a `VOID` pointing at the
 * wrong goal, followed by the right one. Both stay in the timeline — decision 003 — and the recap
 * shows the first struck through, which is exactly how a paper scoresheet is corrected.
 *
 * Pure, and small on purpose: the interesting decision is the stamp.
 *
 * ## Where a correction sits in match time
 *
 * A corrected event keeps **the stamp of the event it replaces**, not the instant the coach typed
 * it. Two reasons, and both are bugs avoided rather than preferences:
 *
 * - stamping "now" would put the new goal after the `FINAL_WHISTLE`, which `reduceMatch` reports as
 *   `event-after-final-whistle` and which would make the goal arrive after everybody had left the
 *   pitch — so nobody would be credited with the clean minutes they actually played;
 * - the minute is part of what the coach is correcting only when he says so. If he changes it, the
 *   new minute is used and clamped to the final whistle; if he does not, the goal stays at 27′.
 *
 * The `VOID` itself carries the same stamp as its target, so the two lines sit next to each other in
 * the timeline instead of the annulment appearing at the end of the match.
 */

import {
  type PeriodsConfig,
  MS_PER_MINUTE,
  clockMsToMinute,
  minuteToClockMs,
  periodOfClockMs,
  periodsConfig,
  regulationMs,
} from "@/lib/match/clock";
import type { MatchEventInput, MatchEventType } from "@/lib/match/events";

import { type RetroFactType, isRetroFactType, retroEventId, retroFactPayload } from "./log";

/**
 * Which lines of a finished match may be corrected: the football facts, and the substitutions.
 *
 * Everything else is the **frame** of the match. `KICKOFF`, `PERIOD_END` and `FINAL_WHISTLE` are what
 * give every other event its minute; `LINEUP_APPLIED` is what puts seven players on the pitch.
 * Annulling one of those does not correct a mistake, it changes what the whole log means — a voided
 * second-half kick-off leaves a timeline whose clock nobody can read, and a voided composition leaves
 * goals scored by nobody. A match of the wrong *length* is edited on the match itself, not here.
 *
 * A `VOID` is not amendable either: an annulment that is itself annulled is a puzzle, not a
 * correction, and the honest move is to append the right action.
 *
 * Exported and pure because the rule has to hold in two places — the screen that decides whether to
 * show « Corriger », and the action that answers a crafted POST.
 */
export function isAmendableEventType(type: MatchEventType): boolean {
  return isRetroFactType(type) || type === "SUBSTITUTION";
}

/**
 * Whether one **line** of the timeline may be corrected — `isAmendableEventType`, plus the changes.
 *
 * A change is a `LINEUP_APPLIED` since decision 147, and one added after the match (decision 169) has
 * to be correctable like any other: annulled, then re-entered. So a `LINEUP_APPLIED` is amendable
 * **unless it is the starting composition** — the one that filled an empty pitch, which the reducer
 * marks `startingLineup` and which decision 150 forbids annulling (« a voided composition leaves goals
 * scored by nobody »). `isAmendableEventType` is left alone on purpose: it says which event *types* a
 * correction may *produce or replace with a fact*, and `RETRO_FACT_TYPES` must not grow a change.
 *
 * Asked of the line rather than of « `clockMs > 0` », because decision 150 settled that the starting
 * composition is recognised by what it does, not by when: a seven confirmed a second after a kick-off
 * tapped too early is still the one nobody may annul, and a second composition at 0′ is not.
 */
export function isAmendableEntry(entry: {
  type: MatchEventType;
  startingLineup?: boolean;
}): boolean {
  if (entry.type === "LINEUP_APPLIED") return entry.startingLineup !== true;
  return isAmendableEventType(entry.type);
}

/** The logged event a correction is aimed at. */
export type AmendTarget = {
  /** `match_events.id`. What `voids_event_id` will point at. */
  eventId: string;
  type: MatchEventType;
  period: number;
  clockMs: number;
};

/** The event that takes its place, or the one being added to a match that forgot it. */
export type AmendFact = {
  type: RetroFactType;
  memberId: string | null;
  assistId: string | null;
  /** Null keeps the annulled event's minute, or the middle of the match for a pure addition. */
  minute: number | null;
};

export type AmendInput = {
  /** One uuid per attempt, so a double tap appends one correction and not two (invariant 6). */
  submissionId: string;
  periods: { periodsCount?: number | null; periodMinutes?: number | null };
  /** Epoch milliseconds of the kick-off, for `occurred_at`. */
  kickoffAtMs: number;
  /**
   * The match time of the final whistle in the log being amended. Nothing may be stamped after it,
   * or the reducer will rightly say so.
   */
  finalWhistleMs: number;
  /** The event to annul. Null when something is simply being added. */
  target: AmendTarget | null;
  /** The event to append. Null when something is simply being annulled. */
  fact: AmendFact | null;
};

export type Amendment = {
  events: readonly MatchEventInput[];
};

/** A change added after the match: the whole pitch after it, at a minute (decision 147). */
export type AmendChange = {
  minute: number;
  slots: readonly { slotId: string; memberId: string }[];
};

/**
 * The one `LINEUP_APPLIED` « Ajouter un changement » appends.
 *
 * Stamped at the minute the coach named, clamped to the final whistle like every other correction —
 * and on the minute exactly, so it replays after the facts at that minute and before anything later
 * (decision 147). `lineupId: null`: it is nobody's planned composition. The slots go in store order
 * as the screen sent them; `retroEventId` keys it on the submission, so a double tap is one change.
 */
export function buildChangeAmendment(input: {
  submissionId: string;
  periods: { periodsCount?: number | null; periodMinutes?: number | null };
  kickoffAtMs: number;
  finalWhistleMs: number;
  change: AmendChange;
}): Amendment {
  const periods = periodsConfig(input.periods);
  const ceilingMs = input.finalWhistleMs > 0 ? input.finalWhistleMs : regulationMs(periods);
  const clockMs = Math.max(0, Math.min(minuteToClockMs(input.change.minute), ceilingMs));
  return {
    events: [
      {
        clientEventId: retroEventId(input.submissionId, 0),
        type: "LINEUP_APPLIED",
        period: periodOfClockMs(clockMs, periods),
        minute: clockMsToMinute(clockMs),
        clockMs,
        occurredAt: new Date(input.kickoffAtMs + clockMs),
        payload: {
          lineupId: null,
          slots: input.change.slots.map((assignment) => ({
            slotId: assignment.slotId,
            memberId: assignment.memberId,
          })),
        },
        voidsEventId: null,
      },
    ],
  };
}

/**
 * The one or two events a correction appends.
 *
 * - annul only: `[VOID]`
 * - add only: `[the new event]`
 * - correct: `[VOID, the corrected event]`, in that order, so the timeline reads as a replacement
 *   rather than as a duplicate followed by a deletion.
 */
export function buildAmendment(input: AmendInput): Amendment {
  const periods = periodsConfig(input.periods);
  // A log whose whistle is missing (an amendment to a match still in progress) still has a ceiling:
  // the end of regulation.
  const ceilingMs = input.finalWhistleMs > 0 ? input.finalWhistleMs : regulationMs(periods);

  const drafts: Array<{
    type: MatchEventType;
    period: number;
    clockMs: number;
    payload: Record<string, unknown>;
    voidsEventId: string | null;
  }> = [];

  if (input.target) {
    drafts.push({
      type: "VOID",
      period: input.target.period,
      clockMs: input.target.clockMs,
      payload: {},
      voidsEventId: input.target.eventId,
    });
  }

  if (input.fact) {
    const stamp = amendStamp(input.fact.minute, input.target, periods, ceilingMs);
    drafts.push({
      type: input.fact.type,
      period: stamp.period,
      clockMs: stamp.clockMs,
      payload: retroFactPayload(input.fact),
      voidsEventId: null,
    });
  }

  return {
    events: drafts.map((draft, index) => ({
      clientEventId: retroEventId(input.submissionId, index),
      type: draft.type,
      period: draft.period,
      minute: clockMsToMinute(draft.clockMs),
      clockMs: draft.clockMs,
      occurredAt: new Date(input.kickoffAtMs + draft.clockMs),
      payload: draft.payload,
      voidsEventId: draft.voidsEventId,
    })),
  };
}

function amendStamp(
  minute: number | null,
  target: AmendTarget | null,
  periods: PeriodsConfig,
  ceilingMs: number,
): { clockMs: number; period: number } {
  if (minute !== null) {
    const clockMs = Math.min(minuteToClockMs(minute), ceilingMs);
    return { clockMs, period: periodOfClockMs(clockMs, periods) };
  }
  // The period is copied, not recomputed: at exactly 30′ of a 2×30 only the log knows whether that
  // was the end of the first half or the start of the second (`formatMinuteLabelFr`).
  if (target) return { clockMs: target.clockMs, period: target.period };

  const middleMs = Math.min(ceilingMs, Math.round(ceilingMs / 2 / MS_PER_MINUTE) * MS_PER_MINUTE);
  return { clockMs: middleMs, period: periodOfClockMs(middleMs, periods) };
}


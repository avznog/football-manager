/**
 * The starting composition, applied as soon as game mode opens (decision 153).
 *
 * The cahier: « Par défaut la compo principale est appliquée. » The owner (Q9): as soon as game mode
 * opens, by whoever operates the match, never by a viewer. This supersedes invariant 3's « never
 * automatically » for the starting composition only; a plan for a later minute is still proposed and
 * waits for the coach.
 *
 * Pure: game mode asks it on every render and writes what it answers, once. The question is the whole
 * of the rule, so it is here where a test can read it rather than inside a `useEffect`.
 */

import { compareMatchEvents, isPitchEvent, type MatchEventType } from "./events";
import { deterministicUuid } from "./ids";
import type { MatchState } from "./reducer";

/** The `LINEUP_APPLIED` game mode should write now, or nothing. */
export type AutoLineup = {
  /** Derived from the match, the plan and its seven: the same version twice is one row. */
  clientEventId: string;
  lineupId: string;
  payload: { lineupId: string; slots: { slotId: string; memberId: string }[]; auto: true };
};

export type AutoLineupInput = {
  matchId: string;
  /** `can(actor, "match:operate", …)`, decided on the server. A viewer never writes. */
  canOperate: boolean;
  /** Only a match recorded live: a retro-entered one has its own starting seven. */
  entryMode: "live" | "retro";
  state: Pick<MatchState, "phase" | "onPitch">;
  /** The confirmed log and the device's pending actions, voided ones included. */
  events: readonly { type: MatchEventType; payload?: unknown }[];
  lineups: readonly {
    id: string;
    fromMinute: number;
    isInitial: boolean;
    slots: readonly { slotId: string; memberId: string }[];
  }[];
};

/**
 * What to apply, when all of these hold:
 *
 * - the viewer operates the match, and it is recorded live;
 * - nothing has kicked off yet. Once a period has started the pitch is the coach's, and a match that
 *   kicked off on another phone with nobody on the pitch keeps the prompt it always had;
 * - a starting composition exists (`isInitial`, else the one from minute 0);
 * - every pitch event in the log is one this function wrote. One the coach wrote himself — the
 *   composer, an « Ajuster », a change — wins for good, **annulled or not**: an annulment is still
 *   somebody's decision about the pitch, and re-applying over it would undo it;
 * - the pitch is not already exactly that composition. So an edit to the plan before the kick-off is
 *   picked up the next time game mode opens, as a new event: the seven are part of the id.
 */
export function autoLineupToApply(input: AutoLineupInput): AutoLineup | null {
  if (!input.canOperate || input.entryMode !== "live") return null;
  if (input.state.phase !== "before-kickoff") return null;

  const starting =
    input.lineups.find((lineup) => lineup.isInitial) ??
    input.lineups.find((lineup) => lineup.fromMinute === 0);
  if (!starting || starting.slots.length === 0) return null;

  const manual = input.events.some(
    (event) => isPitchEvent(event.type) && !isAutoLineupPayload(event.type, event.payload),
  );
  if (manual) return null;

  const plan = canonical(starting.slots);
  const pitch = canonical(
    input.state.onPitch
      .filter((entry) => entry.slotId !== null)
      .map((entry) => ({ slotId: entry.slotId as string, memberId: entry.memberId })),
  );
  if (seedOf(plan) === seedOf(pitch)) return null;

  return {
    clientEventId: deterministicUuid([
      "auto-lineup|",
      input.matchId,
      "|",
      starting.id,
      "|",
      seedOf(plan),
    ]),
    lineupId: starting.id,
    payload: { lineupId: starting.id, slots: plan, auto: true },
  };
}

/**
 * The composition the kick-off freezes: the last automatic application still standing.
 *
 * An automatic application does not set `lineups.applied_event_id` (`appendMatchEvents`), so the
 * composition stays editable until the match starts — opening game mode on Wednesday must not lock
 * Saturday's seven. The kick-off is when it becomes history, and this is what then gets the link
 * (decision 006: it records what happened). Annulled ones are skipped; the log is the stored one.
 */
export function autoLineupToLock(
  log: readonly {
    id: string;
    type: MatchEventType;
    clockMs: number;
    seq?: number | null;
    payload?: unknown;
    voidsEventId?: string | null;
  }[],
): { lineupId: string; eventId: string } | null {
  const voided = new Set(log.map((event) => event.voidsEventId).filter(Boolean));
  const candidates = log
    .filter((event) => isAutoLineupPayload(event.type, event.payload) && !voided.has(event.id))
    .sort((a, b) => compareMatchEvents(a, b));
  const last = candidates[candidates.length - 1];
  const lineupId = (last?.payload as { lineupId?: unknown } | undefined)?.lineupId;
  return last && typeof lineupId === "string" ? { lineupId, eventId: last.id } : null;
}

/** Was this event written by `autoLineupToApply`? */
export function isAutoLineupPayload(type: MatchEventType, payload: unknown): boolean {
  return (
    type === "LINEUP_APPLIED" &&
    typeof payload === "object" &&
    payload !== null &&
    (payload as { auto?: unknown }).auto === true
  );
}

function canonical(
  slots: readonly { slotId: string; memberId: string }[],
): { slotId: string; memberId: string }[] {
  return [...slots]
    .map(({ slotId, memberId }) => ({ slotId, memberId }))
    .sort((a, b) => (a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0));
}

function seedOf(slots: readonly { slotId: string; memberId: string }[]): string {
  return slots.map((slot) => `${slot.slotId}=${slot.memberId}`).join(",");
}

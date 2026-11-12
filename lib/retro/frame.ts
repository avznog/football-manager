/**
 * Moving a whistle so that a correction made after the match lands inside the football (decision 224).
 *
 * ## The case that made it necessary
 *
 * The owner closed the match of 2026-11-10 by tapping through game mode in eight seconds: the first
 * half's `PERIOD_END` is at 0′02″ and the final whistle at 30′02″. He then typed the match up as
 * corrections — a goal at 6′, changes at 14′ and 25′ — and two things went wrong. An action typed
 * after 30′02″ was **silently clamped** to the final whistle (`amendStamp` used to `Math.min` it), so a
 * goal he typed at 50′ would have been stored at 30′; and « Ajouter un changement » refused every
 * minute after the whistle outright, so its field was red above 30.
 *
 * Neither is a refusal the coach can act on: the minute he typed is true and the whistle is what is
 * wrong. So an action that lands after its period's whistle **moves the whistle**, and nothing it says
 * is moved instead.
 *
 * ## The rule the owner chose
 *
 * « To the normal end, or later. » The period's whistle moves to the latest of:
 *
 * - its **normal end** — that period's *actual* kick-off plus `periodMinutes`, not the match's nominal
 *   end, because a second half that kicked off at 32′ has had its thirty minutes at 62′ (decision 214);
 * - the action's own clock — a goal at 30+2 puts the first half's whistle at 32′;
 * - any action of the same period already stranded after the whistle, so that a second correction
 *   does not leave the first one outside the football it describes.
 *
 * His two examples are the tests: a whistle at 0′02″ and a goal at 6′ end the first half at 30′00″; a
 * whistle at 30′00″ and a goal at 30+2 end it at 32′00″.
 *
 * ## What moves with it
 *
 * - The events **at** the old whistle that came after it — a half-time composition is stamped on the
 *   whistle's clock — move to the new one, so they still happen at half-time and not two minutes into
 *   the added time.
 * - If the new whistle reaches the next period's kick-off, **that kick-off and everything after it
 *   shift by the same amount**: the next period starts when this one ended (`nextEventStamp`'s own
 *   rule), and because a television label is counted from the period's actual kick-off, shifting the
 *   kick-off and its events together leaves every label unchanged. A second-half goal that read 50′
 *   still reads 50′. Minutes played are what change, which is the point.
 * - In the last period, the `FINAL_WHISTLE` moves with the `PERIOD_END`.
 *
 * ## Append-only
 *
 * Nothing is updated (invariant 1). Every moved event is a `VOID` of the old one followed by a copy at
 * the new clock — same type, same period, same payload — and all of it is appended in the **same
 * amendment** as the action that caused it, so a double tap appends nothing twice (invariant 6). The
 * copies are appended in the original order, which is what keeps their replay order: the reducer sorts
 * by clock and then by `seq`, and a new `PERIOD_END` at 30′00″ must replay before the kick-off that
 * follows it at 30′00″ — which is why a kick-off exactly at the new whistle is re-appended even when
 * nothing needs to shift.
 *
 * The coach still cannot annul a whistle himself — `isAmendableEntry` refuses it, from the screen and
 * from a crafted POST alike. The frame moves only as a consequence this module computes.
 *
 * Pure: no database, no clock. `lib/retro/actions.ts` feeds it the log and appends what it returns.
 */

import { MS_PER_MINUTE, clockMsToMinute, type PeriodsConfig } from "@/lib/match/clock";
import type { MatchEventInput, MatchEventType } from "@/lib/match/events";

import { retroEventId } from "./log";

/** One logged event, as much of it as moving the frame needs. */
export type FrameEvent = {
  id: string;
  type: MatchEventType;
  period: number;
  clockMs: number;
  /** ISO 8601 or a Date: the device's instant, shifted along with the clock. */
  occurredAt: string | Date;
  payload: unknown;
  voidsEventId: string | null;
  seq: number;
};

/** One event to append, before it is given a client id. */
export type FrameDraft = {
  type: MatchEventType;
  period: number;
  minute: number;
  clockMs: number;
  occurredAt: Date;
  payload: Record<string, unknown>;
  voidsEventId: string | null;
  /** On a copy: the event it replaces. Lets the caller tell an old anomaly from a new one. */
  copyOf: string | null;
};

export type FrameMove = {
  /** Null when the action lands inside its period and nothing moves. */
  extended: { period: number; fromMs: number; toMs: number } | null;
  /** How far the next period and everything after it moved. 0 when nothing shifted. */
  shiftMs: number;
  /** `VOID`s and their copies, in the order they must be appended — after the action itself. */
  drafts: FrameDraft[];
};

const FRAME_TYPES: readonly MatchEventType[] = ["KICKOFF", "PERIOD_END", "FINAL_WHISTLE"];

const NO_MOVE: FrameMove = { extended: null, shiftMs: 0, drafts: [] };

/** The reducer's own replay order: clock, then the order the device produced the events in. */
const byReplay = (a: FrameEvent, b: FrameEvent) => a.clockMs - b.clockMs || a.seq - b.seq;

function asPayload(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function toDate(value: string | Date): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * What has to be appended, beyond the action itself, for an action placed at `placed` to land inside
 * its period. See the module comment for the rule and for why each piece moves.
 *
 * `excludeIds` are events this same amendment annuls — the line being corrected — which must neither
 * be moved nor counted as stranded.
 */
export function frameMoveFor(input: {
  events: readonly FrameEvent[];
  periods: PeriodsConfig;
  placed: { clockMs: number; period: number };
  excludeIds?: ReadonlySet<string>;
}): FrameMove {
  const { periods, placed } = input;
  const voided = new Set(
    input.events
      .filter((event) => event.type === "VOID" && event.voidsEventId)
      .map((event) => event.voidsEventId as string),
  );
  const active = input.events
    .filter(
      (event) =>
        event.type !== "VOID" && !voided.has(event.id) && !input.excludeIds?.has(event.id),
    )
    .sort(byReplay);

  const p = placed.period;
  const kickoff = active.find((event) => event.type === "KICKOFF" && event.period === p);
  const end = active.find((event) => event.type === "PERIOD_END" && event.period === p);
  // A period that never kicked off, or has not ended yet, has no whistle to move.
  if (!kickoff || !end) return NO_MOVE;
  if (placed.clockMs <= end.clockMs) return NO_MOVE;

  const nextKickoff = active.find((event) => event.type === "KICKOFF" && event.period === p + 1);
  const finalWhistle = nextKickoff
    ? undefined
    : active.find((event) => event.type === "FINAL_WHISTLE");

  // Actions of this period already stranded after its whistle: a second correction must not leave
  // the first one outside the football.
  // Not bounded by the next kick-off: an action filed in this period belongs to it wherever its clock
  // sits, and one past the next kick-off is exactly the kind a shift below must not carry away.
  const stranded = active.filter(
    (event) =>
      !FRAME_TYPES.includes(event.type) && event.period === p && event.clockMs > end.clockMs,
  );

  const normalEndMs = kickoff.clockMs + periods.periodMinutes * MS_PER_MINUTE;
  const newEndMs = Math.max(normalEndMs, placed.clockMs, ...stranded.map((event) => event.clockMs));

  const drafts: FrameDraft[] = [];
  const moved = new Set<string>([end.id]);
  const move = (event: FrameEvent, toMs: number) => {
    moved.add(event.id);
    drafts.push({
      type: "VOID",
      period: event.period,
      minute: clockMsToMinute(event.clockMs),
      clockMs: event.clockMs,
      occurredAt: toDate(event.occurredAt),
      payload: {},
      voidsEventId: event.id,
      copyOf: null,
    });
    drafts.push({
      type: event.type,
      period: event.period,
      minute: clockMsToMinute(toMs),
      clockMs: toMs,
      occurredAt: new Date(toDate(event.occurredAt).getTime() + (toMs - event.clockMs)),
      payload: asPayload(event.payload),
      voidsEventId: null,
      copyOf: event.id,
    });
  };

  // 1. The whistle itself.
  move(end, newEndMs);

  // 2. What happened at the whistle, after it: a half-time composition is stamped on its clock.
  const endIndex = active.indexOf(end);
  for (const event of active.slice(endIndex + 1)) {
    if (event.clockMs !== end.clockMs) break;
    if (event.period !== p || FRAME_TYPES.includes(event.type)) continue;
    move(event, newEndMs);
  }

  // 3. The last period: the final whistle goes with it.
  if (finalWhistle && finalWhistle.clockMs < newEndMs && !moved.has(finalWhistle.id)) {
    move(finalWhistle, newEndMs);
  }

  // 4. The next period, when the new whistle reaches its kick-off. At exactly its clock the copies
  //    still have to be re-appended, so that the new whistle replays before the kick-off rather than
  //    after it; past it, everything from the kick-off on shifts by the difference.
  let shiftMs = 0;
  if (nextKickoff && newEndMs >= nextKickoff.clockMs) {
    shiftMs = newEndMs - nextKickoff.clockMs;
    const fromIndex = active.indexOf(nextKickoff);
    for (const event of active.slice(fromIndex)) {
      if (moved.has(event.id)) continue;
      if (shiftMs === 0 && event.clockMs !== nextKickoff.clockMs) break;
      // This period's own stranded actions stay where they are: the new whistle was set to cover them.
      if (event.period === p && !FRAME_TYPES.includes(event.type)) continue;
      move(event, event.clockMs + shiftMs);
    }
  }

  return { extended: { period: p, fromMs: end.clockMs, toMs: newEndMs }, shiftMs, drafts };
}

/** The `matchEventBatchSchema` ceiling: a batch longer than this is refused before it is read. */
export const MAX_AMENDMENT_EVENTS = 200;

/**
 * An amendment, with the frame moves its action needs appended after it.
 *
 * The action is the amendment's last event that is not a `VOID` — the corrected fact, the added one,
 * or the change. An annulment alone has nothing to place, and comes back unchanged.
 *
 * The client ids continue the amendment's own numbering on the same submission, so the whole batch,
 * frame included, is one idempotent submission (invariant 6). `copies` maps each copy's client id to
 * the event it replaces, so the realism check can recognise an anomaly the log already had on the
 * original rather than refusing it as new.
 */
export function withFrameMove(
  amendment: { events: readonly MatchEventInput[] },
  input: {
    submissionId: string;
    events: readonly FrameEvent[];
    periods: PeriodsConfig;
    excludeIds?: ReadonlySet<string>;
  },
): { events: MatchEventInput[]; copies: Map<string, string>; move: FrameMove } {
  const action = [...amendment.events].reverse().find((event) => event.type !== "VOID");
  if (!action) return { events: [...amendment.events], copies: new Map(), move: NO_MOVE };

  const move = frameMoveFor({
    events: input.events,
    periods: input.periods,
    placed: { clockMs: action.clockMs, period: action.period },
    excludeIds: input.excludeIds,
  });

  const copies = new Map<string, string>();
  const appended = move.drafts.map((draft, index): MatchEventInput => {
    const clientEventId = retroEventId(input.submissionId, amendment.events.length + index);
    if (draft.copyOf) copies.set(clientEventId, draft.copyOf);
    return {
      clientEventId,
      type: draft.type,
      period: draft.period,
      minute: draft.minute,
      clockMs: draft.clockMs,
      occurredAt: draft.occurredAt,
      payload: draft.payload,
      voidsEventId: draft.voidsEventId,
    };
  });
  return { events: [...amendment.events, ...appended], copies, move };
}

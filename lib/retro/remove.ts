/**
 * Taking somebody off a finished match entirely — « Retirer du match » (decision 226).
 *
 * The owner: « Lucien has been on the pitch from 0′ but never showed up, so I remove him from the
 * match, as he should not even be a supporter. » The reverse of bringing somebody on from outside
 * the sheet (`./sheet.ts`), and it reuses that half: whoever really played in his place can be picked
 * from the sheet or from « Pas sur la feuille de match », or nobody — « on a joué à 6 ».
 *
 * ## What it does to the log
 *
 * Every whole-pitch `LINEUP_APPLIED` he appears in — the starting composition included — is annulled
 * and re-appended with his slot given to the replacement, or emptied. Append-only (invariant 1): a
 * `VOID` and a copy per snapshot, all in one batch on one submission id, so a double tap is one
 * removal (invariant 6). The start is replaced the way decision 223 replaces it, and the ingest guard
 * accepts it for the same reason: the batch carries the start's replacement at the start's own clock.
 *
 * ## What it refuses, rather than guesses
 *
 *  - an action that **names** him — a goal, an assist, a foul, a `SUBSTITUTION` — because nothing
 *    tells who really did it: « corrige ou annule cette action d'abord »;
 *  - a replacement who is **already on the pitch** in one of those snapshots;
 *  - **nobody** in his place when he was in goal: a pitch with no goalkeeper is not « on a joué à 6 ».
 *
 * Whatever else the change makes impossible is the reducer's to find, through the realism check every
 * correction goes through.
 *
 * Pure: the screen runs it to show the sentence before confirming, and the server runs it again to
 * write. The two cannot disagree about what will happen.
 */

import { z } from "zod";

import type { LiveEvent, LiveMatch } from "@/lib/match/presenter";
import { formatMinuteLabelFr, type PeriodsConfig } from "@/lib/match/clock";
import type { MatchEventInput } from "@/lib/match/events";
import type { MatchState } from "@/lib/match/reducer";

import type { Amendment } from "./amend";
import { retroEventId } from "./log";
import { sheetAdditionFr, sheetAdditions, type SheetAddition } from "./sheet";

/** « Personne ». Posted as the replacement when the coach says the team played one short. */
export const NOBODY = "personne";

export const amendRemoveSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  intent: z.literal("remove"),
  memberId: z.uuid("Cette personne n’est pas valide."),
  replacement: z.union([z.uuid(), z.literal(NOBODY)], {
    message: "Dis qui a joué à sa place, ou « personne ».",
  }),
});

export type RemovalPlan =
  | { ok: false; problemFr: string }
  | {
      ok: true;
      amendment: Amendment;
      /** Each copy's client id → the event it replaces, for the realism check's sake. */
      copies: Map<string, string>;
      /** What the confirm step says, in order. */
      linesFr: string[];
      /** What the sheet becomes for the replacement, if anything. */
      replacementRole: { memberId: string; role: "starter" | "substitute" } | null;
      /** The replacement's addition to the sheet, when he was not on it — for the sentence. */
      addition: SheetAddition | null;
    };

type Slot = { slotId: string; memberId: string };

function slotsOf(event: Pick<LiveEvent, "payload">): Slot[] | null {
  const payload = event.payload as { slots?: unknown } | null | undefined;
  if (!payload || !Array.isArray(payload.slots)) return null;
  return payload.slots.filter(
    (slot): slot is Slot =>
      typeof slot === "object" &&
      slot !== null &&
      typeof (slot as Slot).slotId === "string" &&
      typeof (slot as Slot).memberId === "string",
  );
}

/** The minute a clock reads on the screen, in the period that was being played at it. */
function labelAt(
  clockMs: number,
  state: Pick<MatchState, "playIntervals" | "periods">,
  periodStarts: ReadonlyMap<number, number>,
  side: "from" | "to",
): string {
  const intervals = state.playIntervals;
  const found =
    side === "from"
      ? [...intervals].reverse().find((interval) => interval.startMs <= clockMs)
      : intervals.find((interval) => (interval.endMs ?? Number.POSITIVE_INFINITY) >= clockMs);
  const period = found?.period ?? 1;
  return formatMinuteLabelFr(clockMs, period, state.periods, periodStarts.get(period));
}

export function planRemoval(input: {
  live: Pick<LiveMatch, "events" | "players" | "slots" | "hasSquadSheet">;
  state: Pick<MatchState, "timeline" | "players" | "playIntervals" | "periods">;
  periods: PeriodsConfig;
  periodStarts: ReadonlyMap<number, number>;
  memberId: string;
  /** Who really played in his place, or `null` for nobody. */
  replacementId: string | null;
  submissionId: string;
  kickoffAtMs: number;
}): RemovalPlan {
  const { live, state, memberId, replacementId } = input;
  const nameOf = (id: string) =>
    live.players.find((player) => player.memberId === id)?.displayName ?? "Ce joueur";
  const name = nameOf(memberId);

  if (replacementId === memberId) {
    return { ok: false, problemFr: `${name} ne peut pas se remplacer lui-même.` };
  }
  if (replacementId !== null) {
    const replacement = live.players.find((player) => player.memberId === replacementId);
    if (!replacement || !replacement.isPlayer || replacement.hasLeft) {
      return { ok: false, problemFr: "Ce remplaçant ne peut pas être placé sur le terrain." };
    }
  }

  // 1. An action that names him. Nothing tells who really did it, so the coach says so first.
  for (const entry of state.timeline) {
    if (entry.voided || entry.type === "VOID" || entry.type === "LINEUP_APPLIED") continue;
    if (!entry.actors.some((actor) => actor.memberId === memberId)) continue;
    return {
      ok: false,
      problemFr: `${name} est nommé dans « ${entry.labelFr} » à la ${entry.minuteLabel} : corrige ou annule cette action d’abord.`,
    };
  }

  // 2. Every live whole-pitch snapshot he is in, in replay order.
  const voided = new Set(state.timeline.filter((entry) => entry.voided).map((entry) => entry.eventId));
  const labels = new Map(state.timeline.map((entry) => [entry.eventId, entry.minuteLabel]));
  const goalSlots = new Set(
    live.slots.filter((slot) => slot.positionCode === "GB").map((slot) => slot.id),
  );
  const startId = state.timeline.find((entry) => entry.startingLineup && !entry.voided)?.eventId;

  const affected = live.events
    .filter((event): event is LiveEvent & { id: string } => typeof event.id === "string")
    .filter((event) => event.type === "LINEUP_APPLIED" && !voided.has(event.id))
    .map((event) => ({ event, slots: slotsOf(event) }))
    .filter(
      (entry): entry is { event: LiveEvent & { id: string }; slots: Slot[] } =>
        entry.slots !== null && entry.slots.some((slot) => slot.memberId === memberId),
    )
    .sort((a, b) => a.event.clockMs - b.event.clockMs || (a.event.seq ?? 0) - (b.event.seq ?? 0));

  const events: MatchEventInput[] = [];
  const copies = new Map<string, string>();
  let inStart = false;
  for (const { event, slots } of affected) {
    const label = labels.get(event.id) ?? "";
    const his = slots.find((slot) => slot.memberId === memberId)!;
    if (replacementId === null && goalSlots.has(his.slotId)) {
      return {
        ok: false,
        problemFr: `${name} était dans les buts à la ${label} : il faut quelqu’un à sa place.`,
      };
    }
    if (replacementId !== null && slots.some((slot) => slot.memberId === replacementId)) {
      return {
        ok: false,
        problemFr: `${nameOf(replacementId)} était déjà sur le terrain à la ${label} : choisis quelqu’un d’autre.`,
      };
    }
    if (event.id === startId) inStart = true;

    const at = {
      period: event.period,
      minute: event.minute,
      clockMs: event.clockMs,
      occurredAt: new Date(event.occurredAt),
    };
    events.push({
      clientEventId: retroEventId(input.submissionId, events.length),
      type: "VOID",
      ...at,
      payload: {},
      voidsEventId: event.id,
    });
    const nextSlots =
      replacementId === null
        ? slots.filter((slot) => slot.memberId !== memberId)
        : slots.map((slot) =>
            slot.memberId === memberId ? { slotId: slot.slotId, memberId: replacementId } : slot,
          );
    const copyId = retroEventId(input.submissionId, events.length);
    copies.set(copyId, event.id);
    events.push({
      clientEventId: copyId,
      type: "LINEUP_APPLIED",
      ...at,
      payload: { ...(event.payload as Record<string, unknown>), slots: nextSlots },
      voidsEventId: null,
    });
  }

  // 3. What the confirm step says.
  const linesFr = [`${name} sera retiré du match.`];
  const player = state.players.find((entry) => entry.memberId === memberId);
  const lastMs = Math.max(0, ...state.playIntervals.map((interval) => interval.endMs ?? interval.startMs));
  for (const spell of player?.positionSpells ?? []) {
    const toMs = spell.toClockMs ?? lastMs;
    if (toMs <= spell.fromClockMs) continue;
    const from = labelAt(spell.fromClockMs, state, input.periodStarts, "from");
    const to = labelAt(toMs, state, input.periodStarts, "to");
    linesFr.push(
      replacementId === null
        ? `Personne ne le remplace : l’équipe joue à 6 de ${from} à ${to}.`
        : `${nameOf(replacementId)} prend sa place${spell.positionCode ? ` en ${spell.positionCode}` : ""} de ${from} à ${to}.`,
    );
  }

  let replacementRole: { memberId: string; role: "starter" | "substitute" } | null = null;
  let addition: SheetAddition | null = null;
  if (replacementId !== null && affected.length > 0 && live.hasSquadSheet) {
    const current = live.players.find((entry) => entry.memberId === replacementId)?.squadRole ?? null;
    const role = inStart ? "starter" : current === "starter" ? "starter" : "substitute";
    if (current !== role) replacementRole = { memberId: replacementId, role };
    addition = sheetAdditions(live, [replacementId], role)[0] ?? null;
    if (addition) linesFr.push(sheetAdditionFr(addition));
    else if (replacementRole && role === "starter") {
      linesFr.push(`${nameOf(replacementId)} devient titulaire.`);
    }
  }

  return { ok: true, amendment: { events }, copies, linesFr, replacementRole, addition };
}

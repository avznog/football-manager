/**
 * Adding a change to a match that is over — « Ajouter un changement » (decision 169).
 *
 * The cahier: « Il doit être possible de rajouter des actions à la fin d'un match, comme des
 * changements, mais il faut que ce soit réaliste. Ex : si Lucas est déjà sur le terrain, je ne peux
 * pas dire "changement, Lucas rentre" ». So the screen asks the same two questions game mode asks
 * (« Qui sort ? », « Qui entre ? ») — but about the pitch **as it stood at the minute the coach names**,
 * not as it stands at the final whistle — and the server asks them again before anything is written.
 *
 * A change is one `LINEUP_APPLIED { lineupId: null, slots }`, exactly what game mode writes
 * (decision 147); `buildChangeAmendment` in `amend.ts` stamps it.
 *
 * Pure: no database, no clock, no React. The screen and `submitAmendment` both call it.
 */

import type { LiveEvent, LiveMatch } from "@/lib/match/presenter";
import { reduceLive } from "@/lib/match/presenter";
import { FORMATION_SLOT_COUNT } from "@/db/reference";
import type { MatchState } from "@/lib/match/reducer";
import type { SlotAssignment } from "@/lib/match/lineup";

/* -------------------------------------------------------------------------- */
/* The pitch at a minute                                                      */
/* -------------------------------------------------------------------------- */

/**
 * The part of a log that had happened by `clockMs`: every event stamped at or before it, **and every
 * `VOID` whatever its stamp**.
 *
 * The `VOID`s have to be kept regardless of time because a live annulment is stamped when the coach
 * tapped « Annuler », later than the event it annuls — drop it and a goal annulled at 40′ for a
 * mistake made at 12′ would be counted again in the pitch at 20′. A `VOID` whose target is after
 * `clockMs` is harmless: its target is not in the slice, and the reducer only reports it.
 *
 * « At or before »: an event at exactly `clockMs` is included. With `orderMatchEvents` (decision 147)
 * that is precisely the pitch a change added at that reading will be applied to — it is appended
 * last, so it replays after the facts at that reading and after any change already stored there.
 */
export function eventsUpTo<T extends Pick<LiveEvent, "type" | "clockMs">>(
  events: readonly T[],
  clockMs: number,
): T[] {
  return events.filter((event) => event.type === "VOID" || event.clockMs <= clockMs);
}

/** The match reduced as it stood at `clockMs` — who was on, where, and who had played. */
export function stateAtClock(live: LiveMatch, clockMs: number): MatchState {
  return reduceLive({ ...live, events: eventsUpTo(live.events, clockMs) }, [], null);
}

/* -------------------------------------------------------------------------- */
/* Who may come on                                                            */
/* -------------------------------------------------------------------------- */

/**
 * The players who may be named as coming on at that minute: off the pitch then, and either named on
 * the match sheet as a starter or a substitute, or seen on the pitch at some point of this match.
 *
 * Narrower than game mode's `availableOptions`, deliberately: during the match a coach one man short
 * needs whoever turned up, but after it the sheet is what happened. A supporter did not play, and
 * neither did somebody the sheet never mentions — unless the log says he did, which is the « having
 * played » half. A match with **no sheet at all** has nothing to narrow by, so every player is offered.
 */
export function changeCandidateIds(
  live: Pick<LiveMatch, "players" | "hasSquadSheet">,
  atClock: Pick<MatchState, "onPitch">,
  wholeMatch: Pick<MatchState, "players">,
): string[] {
  const onAtClock = new Set(atClock.onPitch.map((entry) => entry.memberId));
  const played = new Set(
    wholeMatch.players.filter((player) => player.playedMatch).map((player) => player.memberId),
  );
  return live.players
    .filter((player) => player.isPlayer && !onAtClock.has(player.memberId))
    .filter(
      (player) =>
        !live.hasSquadSheet ||
        player.squadRole === "starter" ||
        player.squadRole === "substitute" ||
        played.has(player.memberId),
    )
    .map((player) => player.memberId);
}

/* -------------------------------------------------------------------------- */
/* The server's own check                                                     */
/* -------------------------------------------------------------------------- */

export type ChangeSubmission = {
  outIds: readonly string[];
  inIds: readonly string[];
  slots: readonly SlotAssignment[];
};

/**
 * What is wrong with a posted change, in French, or `null` when it holds — asked of the pitch at the
 * change's minute, which the server recomputes rather than trusting the lists the screen showed.
 *
 * The posted `outIds` / `inIds` are what the coach answered; the slots are what he confirmed on the
 * pitch. They must agree: the slots are exactly the players who were on, minus those going out, plus
 * those coming in — a crafted form cannot slip a twelfth man into a snapshot while claiming a 1-for-1.
 */
export function changeProblemFr(
  submission: ChangeSubmission,
  context: {
    atClock: Pick<MatchState, "onPitch">;
    candidateIds: readonly string[];
    /** `formation_slots` the match can refer to: the slot ids must exist, and one must be `GB`. */
    slots: readonly { id: string; positionCode: string }[];
    nameOf: (memberId: string) => string;
    /** « 23’ » — the minute as the timeline prints it. */
    minuteLabel: string;
  },
): string | null {
  const { atClock, nameOf, minuteLabel } = context;
  const on = new Set(atClock.onPitch.map((entry) => entry.memberId));
  const candidates = new Set(context.candidateIds);

  for (const memberId of submission.outIds) {
    if (!on.has(memberId)) {
      return `${nameOf(memberId)} n’était pas sur le terrain à la ${minuteLabel} : il ne peut pas sortir.`;
    }
  }
  for (const memberId of submission.inIds) {
    if (on.has(memberId)) {
      return `${nameOf(memberId)} était déjà sur le terrain à la ${minuteLabel}.`;
    }
    if (!candidates.has(memberId)) {
      return `${nameOf(memberId)} n’était ni titulaire ni remplaçant sur la feuille de ce match.`;
    }
  }
  if (new Set(submission.inIds).size !== submission.inIds.length) {
    return "Un joueur est nommé deux fois parmi ceux qui entrent.";
  }

  const members = submission.slots.map((assignment) => assignment.memberId);
  const slotIds = submission.slots.map((assignment) => assignment.slotId);
  if (new Set(members).size !== members.length) return "Un joueur est placé à deux postes.";
  if (new Set(slotIds).size !== slotIds.length) return "Deux joueurs sont placés au même poste.";
  if (submission.slots.length > FORMATION_SLOT_COUNT) {
    return `Il n’y a que ${FORMATION_SLOT_COUNT} postes sur le terrain.`;
  }

  const known = new Map(context.slots.map((slot) => [slot.id, slot.positionCode]));
  if (slotIds.some((slotId) => !known.has(slotId))) {
    return "Un des postes n’appartient à aucune formation de ce match.";
  }
  if (!slotIds.some((slotId) => known.get(slotId) === "GB")) {
    return "Personne n’est dans les buts après ce changement.";
  }

  const leaving = new Set(submission.outIds);
  const expected = new Set([
    ...[...on].filter((memberId) => !leaving.has(memberId)),
    ...submission.inIds,
  ]);
  const placed = new Set(members);
  const missing = [...expected].filter((memberId) => !placed.has(memberId));
  const extra = [...placed].filter((memberId) => !expected.has(memberId));
  if (missing.length > 0) {
    return submission.inIds.includes(missing[0])
      ? `${nameOf(missing[0])} entre, mais il n’est placé à aucun poste.`
      : `${nameOf(missing[0])} n’est ni sorti ni placé sur le terrain : place-le, ou fais-le sortir.`;
  }
  if (extra.length > 0) {
    return `${nameOf(extra[0])} est sur le terrain sans être entré : ajoute-le à ceux qui entrent.`;
  }

  return null;
}

/**
 * The idempotency seed of a change (invariant 6): the same change, posted twice, is one change. The
 * slots are sorted so the order the discs were dragged in does not make two changes of one.
 */
export function changeSeed(matchId: string, minute: number, slots: readonly SlotAssignment[]): string[] {
  return [
    matchId,
    "change",
    String(minute),
    ...slots.map((assignment) => `${assignment.slotId}:${assignment.memberId}`).sort(),
  ];
}

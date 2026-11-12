/**
 * Correcting the starting composition of a finished match (decision 223).
 *
 * The owner, after a Tuesday whose real seven was not the one typed into the app: « I need to be able
 * to edit the starting composition, post match ». Asked what the correction should do to the rest of
 * the match, he chose **« change the start only »**: the starting seven changes and **nothing else
 * does**. Every later change stays exactly as recorded.
 *
 * ## What « stays as recorded » means here, which is gentler than it sounds
 *
 * Since decision 147 a change is a `LINEUP_APPLIED` — a snapshot of the **whole** seven, not « A off,
 * B on ». So a later change does not say « Rémi comes on »; it says « from 14′ the pitch is these
 * seven ». Correct the start to put Rémi in for Lucas, and the 14′ snapshot that has Lucas in it now
 * reads, by diff, as « Lucas comes on » — the reducer derives who came and went from the pitch before
 * and after, so the later snapshots never become impossible, they only describe different movements.
 * Nothing is rewritten to get there: the snapshot is the record, and the record did not change.
 *
 * What **can** become impossible is everything that names a person relative to the pitch:
 *
 *  - a `SUBSTITUTION` (older logs and the retro sheet still write them) bringing on somebody who now
 *    started — « substitute-in-already-on »;
 *  - a goal scored, or a substitution taking off, somebody who is now on the bench.
 *
 * Those are found by the reducer and refused by `realismRefusalFr` — the same check every correction
 * goes through — naming who and when, so the coach fixes that later line himself with the tools that
 * already exist. This module does not decide any of it; it only builds the two events and says what
 * the squad sheet becomes.
 *
 * ## The two events
 *
 * A `VOID` on the current start and the corrected `LINEUP_APPLIED`, stamped at the **same clock and
 * period** as the start it replaces, in one batch. Decision 150 forbade annulling the start because
 * that leaves the pitch empty and nothing in the log can refill it; a batch that carries the
 * replacement does not, and `voidsStartingLineup` (lib/match/ingest.ts) now asks exactly that of the
 * reducer instead of refusing every annulment of the start.
 *
 * The replacement is appended, so its `seq` is the highest in the log and at clock 0 it replays
 * **after** the `KICKOFF` it shares that reading with. That is harmless and is pinned by a test: the
 * voided original is skipped, the pitch is empty for no time at all, the replacement fills it at
 * 0′00″, and the reducer marks it `startingLineup` because it is the event that filled an empty pitch.
 */

import { z } from "zod";

import { clockMsToMinute } from "@/lib/match/clock";
import type { SlotAssignment } from "@/lib/match/terrain";

import type { Amendment } from "./amend";
import { retroEventId } from "./log";

/** What « Corriger la composition de départ » posts: the match, and the seven as `slotId:memberId`. */
export const amendStartSchema = z.object({
  teamId: z.uuid(),
  matchId: z.uuid(),
  intent: z.literal("start"),
  slots: z
    .array(z.object({ slotId: z.uuid(), memberId: z.uuid() }))
    .min(1, "Il faut au moins un joueur dans la composition de départ.")
    .max(11, "Cette composition a trop de joueurs."),
});

/** The start as the timeline knows it: what the `VOID` points at, and where it sits. */
export type StartTarget = { eventId: string; period: number; clockMs: number };

/** Who may be put in a starting seven, as the action knows them. */
export type StartCandidate = {
  memberId: string;
  displayName: string;
  isPlayer: boolean;
  squadRole: "starter" | "substitute" | "supporter" | null;
};

/** `slotId:memberId`, sorted — the shape both sides compare and the submission id is seeded from. */
export function startSignature(slots: readonly SlotAssignment[]): string[] {
  return slots.map((slot) => `${slot.slotId}:${slot.memberId}`).sort();
}

/**
 * Why this seven cannot be written, in French, or null.
 *
 * Only what is wrong with the seven **itself**. Whether the rest of the match still holds with it is
 * the reducer's question, asked afterwards by the action through the realism check.
 */
export function startProblemFr(input: {
  current: readonly SlotAssignment[];
  proposed: readonly SlotAssignment[];
  knownSlotIds: ReadonlySet<string>;
  candidates: readonly StartCandidate[];
}): string | null {
  const { current, proposed, knownSlotIds, candidates } = input;
  if (proposed.length === 0) return "Il faut au moins un joueur dans la composition de départ.";

  const slots = new Set(proposed.map((slot) => slot.slotId));
  const members = new Set(proposed.map((slot) => slot.memberId));
  if (slots.size !== proposed.length || members.size !== proposed.length) {
    return "Un poste ou un joueur apparaît deux fois dans cette composition.";
  }
  if (proposed.some((slot) => !knownSlotIds.has(slot.slotId))) {
    return "Un de ces postes n’existe pas dans la formation de ce match.";
  }

  const byId = new Map(candidates.map((candidate) => [candidate.memberId, candidate]));
  for (const slot of proposed) {
    const candidate = byId.get(slot.memberId);
    if (!candidate) return "Un de ces joueurs n’est pas dans cette équipe.";
    // Decision 096: somebody who does not play can be a supporter, never on the pitch.
    if (!candidate.isPlayer) {
      return `${candidate.displayName} ne joue pas : il peut être supporter, pas sur le terrain.`;
    }
    // A supporter is on the sheet to rate, by the coach's own choice (decision 211). Turning him into
    // a starter here would quietly undo that choice; it is undone where it was made.
    if (candidate.squadRole === "supporter") {
      return `${candidate.displayName} est supporter de ce match : retire-le des supporters avant de le faire démarrer.`;
    }
  }

  const before = startSignature(current).join("|");
  if (before === startSignature(proposed).join("|")) {
    return "C’est déjà la composition de départ de ce match.";
  }
  return null;
}

/** The `VOID` and the corrected start, in that order, in one batch. */
export function buildStartAmendment(input: {
  submissionId: string;
  kickoffAtMs: number;
  start: StartTarget;
  slots: readonly SlotAssignment[];
}): Amendment {
  const { start } = input;
  const at = {
    period: start.period,
    minute: clockMsToMinute(start.clockMs),
    clockMs: start.clockMs,
    occurredAt: new Date(input.kickoffAtMs + start.clockMs),
  };
  return {
    events: [
      {
        clientEventId: retroEventId(input.submissionId, 0),
        type: "VOID",
        ...at,
        payload: {},
        voidsEventId: start.eventId,
      },
      {
        clientEventId: retroEventId(input.submissionId, 1),
        type: "LINEUP_APPLIED",
        ...at,
        payload: {
          lineupId: null,
          slots: input.slots.map((slot) => ({ slotId: slot.slotId, memberId: slot.memberId })),
        },
        voidsEventId: null,
      },
    ],
  };
}

/**
 * What the squad sheet becomes: who now starts is a `starter`, who no longer does is a `substitute`.
 *
 * Only for a match **with** a sheet. A match with none has no rows to correct, and writing some here
 * would switch every screen that reads « no sheet » as « anybody may be offered » over to the sheet's
 * narrower rules (`changeCandidateIds`) on the strength of seven rows nobody chose. Supporters are
 * never touched: they cannot be in a start (`startProblemFr`), so they cannot leave one either.
 */
export function squadAfterStart(input: {
  hasSquadSheet: boolean;
  before: readonly SlotAssignment[];
  after: readonly SlotAssignment[];
  roles: ReadonlyMap<string, StartCandidate["squadRole"]>;
}): { memberId: string; role: "starter" | "substitute" }[] {
  if (!input.hasSquadSheet) return [];
  const was = new Set(input.before.map((slot) => slot.memberId));
  const now = new Set(input.after.map((slot) => slot.memberId));
  const changes: { memberId: string; role: "starter" | "substitute" }[] = [];
  for (const memberId of now) {
    if (input.roles.get(memberId) !== "starter") changes.push({ memberId, role: "starter" });
  }
  for (const memberId of was) {
    if (now.has(memberId)) continue;
    if (input.roles.get(memberId) === "supporter") continue;
    if (input.roles.get(memberId) !== "substitute") changes.push({ memberId, role: "substitute" });
  }
  return changes;
}

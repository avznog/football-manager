/**
 * TERRAIN: the fast multi-player change, as pure functions.
 *
 * Game mode's ACTION flows change one thing at a time — one substitution, one position change, one
 * confirmation each. At 70′ a coach who wants to swap two players *and* push a third up front has to
 * walk three flows and answer three questions he has already answered on the touchline. TERRAIN is
 * the answer `docs/PLAN.md` asks for (screen 5): arrange the whole pitch, read what it implies, and
 * confirm **once**.
 *
 * Two things make that safe, and both live here rather than in the component:
 *
 * 1. **Nothing is decided by a gesture.** Arranging is local state; `terrainReview` turns the
 *    arrangement into the French list of changes the coach reads before anything is written, and
 *    `terrainPayload` is the only thing that becomes an event.
 * 2. **One event, not a sequence.** The confirmation emits a single `LINEUP_APPLIED`, whose payload
 *    supersedes the on-pitch state wholesale; `reduceMatch` derives the substitutions, the position
 *    changes and their order from it with `diffLineups` (invariant 2). One `client_event_id` means a
 *    retried POST cannot land half a reshuffle (invariant 6), and one `VOID` puts the pitch back
 *    exactly as it was (invariant 1). See `lib/match/events.ts`, which already describes a
 *    `LINEUP_APPLIED` with no `lineupId` as "an ad-hoc TERRAIN change".
 *
 * Everything below composes the modules that already know these things — `lib/match/lineup.ts` for
 * the diff, `lib/composition/editor.ts` for the placement rules, `lib/pitch/geometry.ts` and
 * `lib/formation/shape.ts` for the snapping — and adds only what is specific to changing a team
 * that is already playing.
 */

import { FORMATION_SLOT_COUNT } from "@/db/reference";
import { SNAP_DISTANCE } from "@/lib/formation/shape";
import { memberInSlot, placeInSlot, removeMember } from "@/lib/composition/editor";
import { pitchDistance, type PitchPoint } from "@/lib/pitch/geometry";
import {
  describeLineupDiffFr,
  diffLineups,
  unpairedMovements,
  type LineupDiff,
  type SlotAssignment,
} from "./lineup";
import { slotIndex, type GamePitchSlot, type LiveSlot, type PlayerIndex, type PlayerOption } from "./presenter";

export type { SlotAssignment };

/* -------------------------------------------------------------------------- */
/* What the screen was opened with                                            */
/* -------------------------------------------------------------------------- */

/**
 * Where the arrangement came from, which is the whole of the difference invariant 3 cares about.
 *
 * `pitch` is the coach pressing TERRAIN: the arrangement starts as what is on the grass and the
 * resulting event carries no `lineupId`. `plan` is the coach pressing « Ajuster » on a planned
 * composition: the arrangement starts pre-filled with the plan, and confirming it carries the
 * plan's id so `lineups.applied_event_id` records that *this* is what was applied. Neither is
 * automatic — both wait for « Valider ».
 */
export type TerrainOrigin =
  | { kind: "pitch" }
  | { kind: "plan"; lineupId: string; title: string };

/** The `lineupId` a confirmation from this origin must carry. */
export function terrainLineupId(origin: TerrainOrigin): string | null {
  return origin.kind === "plan" ? origin.lineupId : null;
}

/* -------------------------------------------------------------------------- */
/* Drop targets                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The slots a disc can be dropped on: the chosen formation's, plus any slot somebody actually
 * occupies right now or in the arrangement.
 *
 * The union matters. An earlier ad-hoc change may have left a player in a slot belonging to another
 * formation, and drawing only the current formation's slots would make that player disappear from
 * the screen — the one thing a fast-change screen must never do.
 *
 * `LiveSlot.positionCode` is a plain `string` (it comes straight from `formation_slots`), which is
 * why this is not `ShapeSlot`: narrowing it would silently drop a slot whose code the app does not
 * recognise, and a missing drop target is a control that does nothing for no visible reason.
 */
export function terrainTargets(
  slots: readonly LiveSlot[],
  options: {
    formationId?: string | null;
    occupiedSlotIds?: readonly string[];
  } = {},
): LiveSlot[] {
  const occupied = new Set(options.occupiedSlotIds ?? []);
  return slots
    .filter((slot) => slot.formationId === options.formationId || occupied.has(slot.id))
    .slice()
    .sort((a, b) => a.sort - b.sort || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * The slot a drop at `point` lands on, or `null` for a drop on empty grass.
 *
 * Mirrors `nearestSlot` from `lib/formation/shape.ts` — same `SNAP_DISTANCE`, same forgiveness for a
 * finger that hides its own target — over `formation_slots` rows rather than an editable shape.
 */
export function nearestTerrainTarget(
  targets: readonly LiveSlot[],
  point: PitchPoint,
  maxDistance: number = SNAP_DISTANCE,
): LiveSlot | null {
  let best: LiveSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const target of targets) {
    const distance = pitchDistance(target, point);
    if (distance < bestDistance) {
      best = target;
      bestDistance = distance;
    }
  }
  return best !== null && bestDistance <= maxDistance ? best : null;
}

/**
 * A drop of `memberId` at `point`.
 *
 * **A drop on empty grass changes nothing.** M3's editor benches a player dropped outside a slot,
 * which is right when composing a team on the sofa and wrong at 70′: a slipped thumb would take a
 * player off the pitch, and taking a player off is the one thing that must be said out loud. Here it
 * is a no-op, and coming off is an explicit control (`terrainRemove`).
 *
 * Landing on an occupied slot swaps the two players — `placeInSlot`'s rule, unchanged, because that
 * is what a coach dragging one midfielder onto another means.
 */
export function terrainDrop(
  arranged: readonly SlotAssignment[],
  targets: readonly LiveSlot[],
  memberId: string,
  point: PitchPoint,
): SlotAssignment[] {
  const target = nearestTerrainTarget(targets, point);
  if (!target) return [...arranged];
  return placeInSlot(arranged, target.id, memberId);
}

/** Tap-then-tap, and the keyboard path: put `memberId` in `slotId`, swapping if it is taken. */
export function terrainPlace(
  arranged: readonly SlotAssignment[],
  slotId: string,
  memberId: string,
): SlotAssignment[] {
  return placeInSlot(arranged, slotId, memberId);
}

/** Take a player off the arrangement. Never the result of a gesture — always of a labelled button. */
export function terrainRemove(
  arranged: readonly SlotAssignment[],
  memberId: string,
): SlotAssignment[] {
  return removeMember(arranged, memberId);
}

/* -------------------------------------------------------------------------- */
/* « Changement »: who goes out, who comes in, then the pitch                 */
/* -------------------------------------------------------------------------- */

/**
 * The pitch « Changement » opens on, once the coach has said who goes off and who comes on.
 *
 * « On s'en fiche de savoir qui remplace qui » (the cahier, decision 147): the coach names the
 * players going out and the players coming in, unpaired and in any number, and this lays the
 * arrival on the pitch for the drag & drop to correct. Pure, and nothing it returns is written until
 * « Valider ».
 *
 * - the players staying keep their slots;
 * - the players coming in take the **vacated** slots first, in slot order (the goalkeeper's first),
 *   in the order the coach picked them;
 * - any extra arrivals then take the formation's **empty** slots, in slot order;
 * - an arrival with no slot left is returned in `unplaced`, and the sheet keeps him on its bench;
 * - fewer in than out simply leaves slots empty — a team down to six is a legal pitch (decision 028).
 *
 * `formationSlots` is the formation being played; a slot outside it that somebody leaves still counts
 * as vacated, because that is where the man coming on was meant to stand. Ids that are not on the
 * pitch are ignored on the « out » side, and ids already on it on the « in » side.
 */
export function changeArrangement(
  onPitch: readonly SlotAssignment[],
  outIds: readonly string[],
  inIds: readonly string[],
  formationSlots: readonly { id: string; sort: number }[],
): { assignments: SlotAssignment[]; unplaced: string[] } {
  const sortOf = new Map(formationSlots.map((slot) => [slot.id, slot.sort]));
  const bySort = (a: string, b: string) =>
    (sortOf.get(a) ?? Number.MAX_SAFE_INTEGER) - (sortOf.get(b) ?? Number.MAX_SAFE_INTEGER) ||
    (a < b ? -1 : a > b ? 1 : 0);

  const leaving = new Set(outIds);
  const staying = onPitch.filter((assignment) => !leaving.has(assignment.memberId));
  const vacated = onPitch
    .filter((assignment) => leaving.has(assignment.memberId))
    .map((assignment) => assignment.slotId)
    .sort(bySort);
  const taken = new Set([...staying.map((assignment) => assignment.slotId), ...vacated]);
  const empty = formationSlots
    .map((slot) => slot.id)
    .filter((slotId) => !taken.has(slotId))
    .sort(bySort);

  const free = [...vacated, ...empty];
  const alreadyOn = new Set(onPitch.map((assignment) => assignment.memberId));
  const arriving = [...new Set(inIds)].filter((memberId) => !alreadyOn.has(memberId));

  const assignments: SlotAssignment[] = [...staying];
  const unplaced: string[] = [];
  for (const memberId of arriving) {
    const slotId = free.shift();
    if (slotId === undefined) unplaced.push(memberId);
    else assignments.push({ slotId, memberId });
  }

  assignments.sort((a, b) => bySort(a.slotId, b.slotId));
  return { assignments, unplaced };
}

/* -------------------------------------------------------------------------- */
/* The pitch being arranged                                                   */
/* -------------------------------------------------------------------------- */

export type TerrainPitchOptions = {
  /** What is on the grass right now: it decides which discs read « entre ». */
  base: readonly SlotAssignment[];
  formationId?: string | null;
  /** The disc the coach has picked up, or tapped first in the tap-then-tap path. */
  selectedMemberId?: string | null;
};

/**
 * The arrangement as discs, in the shape `components/pitch` draws.
 *
 * A player who is not on the pitch yet is a **ghost** with « entre » under it, the same visual
 * language decision 006 gave the planned-composition prompt: translucent means "not yet true". A
 * flagged player (injured, not on the sheet) keeps his disc and gets the danger ring — decision 011
 * flags, it never removes.
 */
export function terrainPitchSlots(
  arranged: readonly SlotAssignment[],
  slots: readonly LiveSlot[],
  players: PlayerIndex,
  options: TerrainPitchOptions,
): GamePitchSlot[] {
  const occupied = [
    ...options.base.map((assignment) => assignment.slotId),
    ...arranged.map((assignment) => assignment.slotId),
  ];
  const targets = terrainTargets(slots, { formationId: options.formationId, occupiedSlotIds: occupied });
  const onPitch = new Set(options.base.map((assignment) => assignment.memberId));

  const drawn: GamePitchSlot[] = targets.map((slot) => {
    const memberId = memberInSlot(arranged, slot.id);
    if (memberId === null) {
      return { id: slot.id, x: slot.x, y: slot.y, positionCode: slot.positionCode, player: null };
    }
    const player = players.get(memberId);
    const flag = terrainFlagFr(memberId, players);
    const coming = !onPitch.has(memberId);
    return {
      id: slot.id,
      x: slot.x,
      y: slot.y,
      positionCode: slot.positionCode,
      player: {
        id: memberId,
        name: player?.displayName ?? "Joueur inconnu",
        jerseyNumber: player?.jerseyNumber ?? null,
        variant:
          options.selectedMemberId === memberId
            ? "selected"
            : flag
              ? "unavailable"
              : coming
                ? "ghost"
                : "normal",
        statusLabel: flag ?? (coming ? "entre" : undefined),
      },
    };
  });

  // A slot id in the arrangement that belongs to no known formation would otherwise take its player
  // off the screen. Better a disc with no position than a lost player.
  const known = slotIndex(slots);
  for (const assignment of arranged) {
    if (known.has(assignment.slotId)) continue;
    const player = players.get(assignment.memberId);
    drawn.push({
      id: assignment.slotId,
      x: 500,
      y: 500,
      positionCode: "?",
      player: {
        id: assignment.memberId,
        name: player?.displayName ?? "Joueur inconnu",
        jerseyNumber: player?.jerseyNumber ?? null,
        variant: options.selectedMemberId === assignment.memberId ? "selected" : "normal",
        statusLabel: "poste inconnu",
      },
    });
  }

  return drawn;
}

/* -------------------------------------------------------------------------- */
/* The bench strip                                                            */
/* -------------------------------------------------------------------------- */

export type TerrainBenchEntry = PlayerOption & {
  /** On the pitch now, but not in the arrangement: this player is on his way off. */
  comingOff: boolean;
};

/**
 * Everybody who is not placed, with the ones the arrangement is taking off first.
 *
 * Putting them first is deliberate: a player the coach has just pulled out of the arrangement is the
 * thing most likely to be a mistake, so he is the first thing under the pitch, labelled « sort du
 * terrain », one tap from going back on.
 */
export function terrainBench(
  arranged: readonly SlotAssignment[],
  options: {
    /** Everyone selectable: the players on the pitch plus the bench (`onPitchOptions` + `availableOptions`). */
    candidates: readonly PlayerOption[];
    base: readonly SlotAssignment[];
  },
): TerrainBenchEntry[] {
  const placed = new Set(arranged.map((assignment) => assignment.memberId));
  const onPitch = new Set(options.base.map((assignment) => assignment.memberId));

  const entries = options.candidates
    .filter((candidate) => !placed.has(candidate.memberId))
    .map((candidate) => {
      const comingOff = onPitch.has(candidate.memberId);
      return {
        ...candidate,
        subtitle: comingOff ? "sort du terrain" : candidate.subtitle,
        comingOff,
      };
    });

  // Stable: the candidate order is already the recommendation (substitutes first), and only the
  // "coming off" group is lifted above it.
  return [...entries.filter((entry) => entry.comingOff), ...entries.filter((entry) => !entry.comingOff)];
}

/* -------------------------------------------------------------------------- */
/* What the coach reads before confirming                                     */
/* -------------------------------------------------------------------------- */

export type TerrainProblemCode =
  /** More players placed than a 7-a-side team has. */
  | "too-many"
  /** Nobody in a `GB` slot. */
  | "no-goalkeeper"
  /** Nobody placed at all. */
  | "empty";

export type TerrainProblem = {
  code: TerrainProblemCode;
  /** French, ready to print: this one is read by the coach, not by a developer. */
  message: string;
};

export type TerrainReview = {
  /** One French line per change, in the order the coach would carry them out. */
  changes: readonly string[];
  /** « 2 changements et 1 repositionnement » — the sentence under the button. */
  summary: string;
  /** How many changes one confirmation would make, for the button's badge. */
  count: number;
  /** Refusals. Non-empty means « Valider » is disabled. */
  problems: readonly TerrainProblem[];
  /** Things worth knowing that are not refusals (decision 028's spirit, in game mode). */
  warnings: readonly string[];
  /** The arrangement is what is already on the pitch: there is nothing to confirm. */
  isEmpty: boolean;
  canConfirm: boolean;
  /** The diff itself, for callers that want the substitutions rather than their French. */
  diff: LineupDiff;
};

export type TerrainReviewOptions = {
  slots: readonly LiveSlot[];
  players: PlayerIndex;
  /** Players who have already come off in this match, from the reducer. */
  leftPitchMemberIds?: readonly string[];
};

/**
 * The whole answer to "what will this one confirmation do?".
 *
 * The blocking rules are the reducer's own anomalies, checked *before* the event exists rather than
 * reported after it: `checkPitch` reports `too-many-on-pitch` past seven players and
 * `no-goalkeeper-on-pitch` for a full team with nobody in goal, and a screen that can produce a
 * state the reducer calls an anomaly is a screen that lies. Fielding **six** is not one of them —
 * an amateur side with an injury and no substitute does exactly that — so it is a warning.
 */
export function terrainReview(
  base: readonly SlotAssignment[],
  arranged: readonly SlotAssignment[],
  options: TerrainReviewOptions,
): TerrainReview {
  const { slots, players } = options;
  const diff = diffLineups(base, arranged, { slots: slots.map(toSlotInfo) });
  const changes = describeLineupDiffFr(diff, players.nameOf);

  const problems: TerrainProblem[] = [];
  if (arranged.length === 0) {
    problems.push({ code: "empty", message: "Aucun joueur sur le terrain." });
  } else {
    if (arranged.length > FORMATION_SLOT_COUNT) {
      problems.push({
        code: "too-many",
        message: `${arranged.length} joueurs placés : il n’en faut que ${FORMATION_SLOT_COUNT}.`,
      });
    }
    if (!hasGoalkeeper(arranged, slots)) {
      problems.push({ code: "no-goalkeeper", message: "Personne dans les buts." });
    }
  }

  const warnings: string[] = [];
  if (arranged.length > 0 && arranged.length < FORMATION_SLOT_COUNT) {
    const missing = FORMATION_SLOT_COUNT - arranged.length;
    warnings.push(
      `${arranged.length} joueurs sur le terrain : il en manque ${missing}.`,
    );
  }
  const leftPitch = new Set(options.leftPitchMemberIds ?? []);
  for (const memberId of diff.comingOn) {
    const flag = terrainFlagFr(memberId, players);
    const name = players.nameOf(memberId);
    if (flag) warnings.push(`${name} est ${flag}.`);
    else if (leftPitch.has(memberId)) warnings.push(`${name} est déjà sorti.`);
  }

  return {
    changes,
    summary: terrainSummaryFr(diff),
    count: changes.length,
    problems,
    warnings,
    isEmpty: diff.isEmpty,
    canConfirm: problems.length === 0 && !diff.isEmpty,
    diff,
  };
}

/** « 2 changements et 1 repositionnement », « 7 joueurs entrent », « Aucun changement ». */
export function terrainSummaryFr(diff: LineupDiff): string {
  const moves = diff.positionChanges.length;
  const unpaired = unpairedMovements(diff);
  const swaps =
    diff.substitutions.length + unpaired.goingOff.length + unpaired.comingOn.length;

  // Nobody leaves and nobody moves: the pitch was empty or short-handed, and the commonest case is
  // the starting seven being placed before the kick-off. « 7 changements » under that sheet reads as
  // seven substitutions in the first second — the same lie the recap refuses to tell about a
  // `LINEUP_APPLIED` at 0’ (`lib/rating/recap.ts`).
  if (diff.substitutions.length === 0 && diff.goingOff.length === 0 && moves === 0) {
    const arrivals = diff.comingOn.length;
    if (arrivals > 0) return `${arrivals} joueur${arrivals > 1 ? "s entrent" : " entre"}`;
  }

  const parts: string[] = [];
  if (swaps > 0) parts.push(`${swaps} changement${swaps > 1 ? "s" : ""}`);
  if (moves > 0) parts.push(`${moves} repositionnement${moves > 1 ? "s" : ""}`);
  if (parts.length === 0) return "Aucun changement";
  return parts.join(" et ");
}

/** « blessé », « hors feuille », « supporter » — or null when there is nothing to flag. */
export function terrainFlagFr(memberId: string, players: PlayerIndex): string | null {
  const player = players.get(memberId);
  if (!player) return null;
  if (player.isInjured) return "blessé";
  if (player.squadRole === "supporter") return "supporter";
  if (player.squadRole === null) return "hors feuille";
  return null;
}

/* -------------------------------------------------------------------------- */
/* The one event                                                              */
/* -------------------------------------------------------------------------- */

/**
 * The `LINEUP_APPLIED` payload one confirmation produces.
 *
 * Slots come out in store order — goalkeeper first, then back to front — so the payload of a given
 * arrangement is the same whichever order the coach dragged the discs in. That is not cosmetic: it
 * is what makes two devices that arranged the same team produce comparable events, and what makes a
 * fixture in a test readable.
 */
export function terrainPayload(
  arranged: readonly SlotAssignment[],
  options: { slots: readonly LiveSlot[]; origin: TerrainOrigin },
): { lineupId: string | null; slots: SlotAssignment[] } {
  const rank = new Map(options.slots.map((slot) => [slot.id, slot.sort]));
  const slots = [...arranged].sort((a, b) => {
    const left = rank.get(a.slotId) ?? Number.MAX_SAFE_INTEGER;
    const right = rank.get(b.slotId) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) return left - right;
    return a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0;
  });

  return { lineupId: terrainLineupId(options.origin), slots };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toSlotInfo(slot: LiveSlot): { id: string; positionCode: string; sort: number } {
  return { id: slot.id, positionCode: slot.positionCode, sort: slot.sort };
}

function hasGoalkeeper(
  arranged: readonly SlotAssignment[],
  slots: readonly LiveSlot[],
): boolean {
  const byId = slotIndex(slots);
  return arranged.some((assignment) => byId.get(assignment.slotId)?.positionCode === "GB");
}

/**
 * Diffing two compositions into the changes a coach must actually make.
 *
 * A coach does not think in terms of "seven slots, seven names". He prepares a composition for the
 * 30th minute and expects the app to tell him what to *do*: one substitution and a couple of
 * players swapping roles. Decision 006 makes this the only way a planned composition ever reaches
 * the pitch — it is proposed, deduced, and applied on confirmation, never automatically.
 *
 * ## The chained case, which is the whole reason this file exists
 *
 * From the owner's notes: *« l'attaquant passe milieu, le remplaçant passe attaquant, le milieu
 * passe goal et le goal sort »*. Four sentences, but **not** four substitutions: one player
 * leaves, one arrives, and two continuing players change role. Getting that wrong would credit
 * three players with a substitution they never made and destroy their minutes.
 *
 * There is a second trap, and it is the one that bites: those changes cannot be applied in any
 * order. The midfielder cannot take the goalkeeper's slot before the goalkeeper has left it, and
 * the striker cannot take the midfielder's slot before the midfielder has left his. `steps` is the
 * diff put in an order where **no slot is ever occupied twice**, with a substitution deliberately
 * split into its two halves — the outgoing player leaves first, freeing the slot the chain needs,
 * and the incoming player is the last to walk on.
 *
 * Pure: no database, no framework, no clock. `reduceMatch` uses it to describe what a
 * `LINEUP_APPLIED` event did, and the composition editor uses it to show the diff before saving.
 */

import { positionLabelFr } from "@/db/reference";

/* -------------------------------------------------------------------------- */
/* Inputs                                                                     */
/* -------------------------------------------------------------------------- */

/** One row of `lineup_slots`, or one entry of a `LINEUP_APPLIED` payload. */
export type SlotAssignment = {
  slotId: string;
  memberId: string;
};

/** As much of a `formation_slots` row as the diff needs: what the slot is, and where to show it. */
export type SlotInfo = {
  id: string;
  positionCode?: string | null;
  sort?: number | null;
};

export type LineupDiffOptions = {
  /** The slot catalogue of the formations involved, for position labels and stable ordering. */
  slots?: readonly SlotInfo[] | null;
};

/* -------------------------------------------------------------------------- */
/* Outputs                                                                    */
/* -------------------------------------------------------------------------- */

export type Substitution = {
  /** The player leaving the pitch. */
  outId: string;
  /** The player coming on. */
  inId: string;
  /** Where the incoming player goes — which is **not** necessarily where the other one was. */
  slotId: string;
  positionCode: string | null;
};

export type PositionChange = {
  memberId: string;
  fromSlotId: string;
  toSlotId: string;
  fromPositionCode: string | null;
  toPositionCode: string | null;
};

/**
 * One atomic operation, in an order that is always applicable. A `rotation` is the honest answer
 * to a cycle — two players exchanging slots cannot be expressed as two independent moves without
 * one of them standing in an occupied slot, so it is reported as the single exchange it is.
 */
export type LineupStep =
  | { kind: "out"; memberId: string; slotId: string }
  | { kind: "in"; memberId: string; slotId: string }
  | { kind: "move"; memberId: string; fromSlotId: string; toSlotId: string }
  | { kind: "rotation"; memberIds: readonly string[]; slotIds: readonly string[] };

export type LineupDiffWarningCode =
  /** The same player appears in two slots of one composition. */
  | "duplicate-member"
  /** Two players in the same slot. */
  | "duplicate-slot"
  /** A slot id that is in no known formation. */
  | "unknown-slot"
  /** The two compositions do not field the same number of players. */
  | "size-changed"
  /** The target composition has nobody in a `GB` slot. */
  | "no-goalkeeper";

export type LineupDiffWarning = {
  code: LineupDiffWarningCode;
  /** English: this is a diagnostic for the developer, not a message for the coach. */
  detail: string;
};

export type LineupDiff = {
  substitutions: readonly Substitution[];
  positionChanges: readonly PositionChange[];
  /** The same changes, ordered and atomised so they can be applied one at a time. */
  steps: readonly LineupStep[];
  /** Members in the target composition and not in the current one. */
  comingOn: readonly string[];
  /** Members in the current composition and not in the target one. */
  goingOff: readonly string[];
  /** Members who stay in exactly the same slot. */
  unchanged: readonly string[];
  /** Nothing to do at all. */
  isEmpty: boolean;
  warnings: readonly LineupDiffWarning[];
};

/* -------------------------------------------------------------------------- */
/* Diffing                                                                    */
/* -------------------------------------------------------------------------- */

type SlotIndex = {
  positionOf: (slotId: string) => string | null;
  sortOf: (slotId: string) => number;
  known: (slotId: string) => boolean;
  hasCatalogue: boolean;
};

function indexSlots(slots: readonly SlotInfo[] | null | undefined): SlotIndex {
  const map = new Map<string, SlotInfo>();
  for (const slot of slots ?? []) map.set(slot.id, slot);
  return {
    positionOf: (slotId) => map.get(slotId)?.positionCode ?? null,
    // Unknown slots sort last but keep a stable order among themselves via the id tie-break.
    sortOf: (slotId) => map.get(slotId)?.sort ?? Number.MAX_SAFE_INTEGER,
    known: (slotId) => map.has(slotId),
    hasCatalogue: map.size > 0,
  };
}

/**
 * Drop the impossible from a composition: one player in two slots, or two players in one slot.
 * `lineup_slots` has unique constraints for both, so this only ever fires on a hand-built payload
 * — but the reducer must not be the thing that throws when it does.
 */
function normalise(
  assignments: readonly SlotAssignment[],
  label: string,
  warnings: LineupDiffWarning[],
): { bySlot: Map<string, string>; byMember: Map<string, string> } {
  const bySlot = new Map<string, string>();
  const byMember = new Map<string, string>();
  for (const { slotId, memberId } of assignments) {
    if (byMember.has(memberId)) {
      warnings.push({
        code: "duplicate-member",
        detail: `${label}: member ${memberId} appears in more than one slot`,
      });
      continue;
    }
    if (bySlot.has(slotId)) {
      warnings.push({
        code: "duplicate-slot",
        detail: `${label}: slot ${slotId} is assigned to more than one member`,
      });
      continue;
    }
    bySlot.set(slotId, memberId);
    byMember.set(memberId, slotId);
  }
  return { bySlot, byMember };
}

/**
 * The changes that turn `from` into `to`.
 *
 * `from` is the composition on the pitch right now (from the reducer) or the previous planned one;
 * `to` is the target. Both are slot→member assignments; neither has to be complete.
 */
export function diffLineups(
  from: readonly SlotAssignment[],
  to: readonly SlotAssignment[],
  options: LineupDiffOptions = {},
): LineupDiff {
  const warnings: LineupDiffWarning[] = [];
  const slots = indexSlots(options.slots);

  const current = normalise(from, "current", warnings);
  const target = normalise(to, "target", warnings);

  if (slots.hasCatalogue) {
    for (const slotId of new Set([...current.bySlot.keys(), ...target.bySlot.keys()])) {
      if (!slots.known(slotId)) {
        warnings.push({ code: "unknown-slot", detail: `slot ${slotId} is in no known formation` });
      }
    }
    if (target.bySlot.size > 0 && ![...target.bySlot.keys()].some((s) => slots.positionOf(s) === "GB")) {
      warnings.push({ code: "no-goalkeeper", detail: "the target composition has no GB slot" });
    }
  }
  if (current.bySlot.size > 0 && target.bySlot.size > 0 && current.bySlot.size !== target.bySlot.size) {
    warnings.push({
      code: "size-changed",
      detail: `${current.bySlot.size} players on the pitch, ${target.bySlot.size} in the target`,
    });
  }

  /** Ordering used everywhere below, so two runs on the same data give the same list. */
  const bySlotThenMember = (slotOf: (m: string) => string) => (a: string, b: string) => {
    const sa = slots.sortOf(slotOf(a));
    const sb = slots.sortOf(slotOf(b));
    if (sa !== sb) return sa - sb;
    const ia = slotOf(a);
    const ib = slotOf(b);
    if (ia !== ib) return ia < ib ? -1 : 1;
    return a < b ? -1 : a > b ? 1 : 0;
  };

  const leaving = [...current.byMember.keys()]
    .filter((memberId) => !target.byMember.has(memberId))
    .sort(bySlotThenMember((m) => current.byMember.get(m)!));
  const arriving = [...target.byMember.keys()]
    .filter((memberId) => !current.byMember.has(memberId))
    .sort(bySlotThenMember((m) => target.byMember.get(m)!));

  /*
   * Pairing an arrival with a departure. First choice: the player who currently holds the slot the
   * newcomer is taking, if he is on his way off — "Yanis comes on for Léo in central midfield" is
   * one substitution with one slot, and that is by far the common case. Otherwise the newcomer is
   * joining a chain, and the departure he replaces is simply the next one available: in the owner's
   * example the substitute walks into the striker's slot, but the man who leaves is the keeper.
   */
  const unpairedLeaving = new Set(leaving);
  const substitutions: Substitution[] = [];
  const deferred: string[] = [];

  for (const inId of arriving) {
    const slotId = target.byMember.get(inId)!;
    const holder = current.bySlot.get(slotId);
    if (holder !== undefined && unpairedLeaving.has(holder)) {
      unpairedLeaving.delete(holder);
      substitutions.push({
        outId: holder,
        inId,
        slotId,
        positionCode: slots.positionOf(slotId),
      });
    } else {
      deferred.push(inId);
    }
  }
  for (const inId of deferred) {
    const slotId = target.byMember.get(inId)!;
    const outId = leaving.find((memberId) => unpairedLeaving.has(memberId));
    if (outId === undefined) continue; // more arrivals than departures — reported as a step below.
    unpairedLeaving.delete(outId);
    substitutions.push({ outId, inId, slotId, positionCode: slots.positionOf(slotId) });
  }

  const positionChanges: PositionChange[] = [];
  const unchanged: string[] = [];
  for (const [memberId, fromSlotId] of current.byMember) {
    const toSlotId = target.byMember.get(memberId);
    if (toSlotId === undefined) continue;
    if (toSlotId === fromSlotId) {
      unchanged.push(memberId);
      continue;
    }
    positionChanges.push({
      memberId,
      fromSlotId,
      toSlotId,
      fromPositionCode: slots.positionOf(fromSlotId),
      toPositionCode: slots.positionOf(toSlotId),
    });
  }
  // Ordered by the slot they end up in, so the list reads back to front like a team sheet.
  positionChanges.sort((a, b) => {
    const sa = slots.sortOf(a.toSlotId);
    const sb = slots.sortOf(b.toSlotId);
    if (sa !== sb) return sa - sb;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
  unchanged.sort(bySlotThenMember((m) => current.byMember.get(m)!));

  const pairedIn = new Set(substitutions.map((s) => s.inId));
  const extraArriving = arriving.filter((memberId) => !pairedIn.has(memberId));

  const steps = orderSteps({
    currentBySlot: current.bySlot,
    substitutions,
    positionChanges,
    stillLeaving: leaving.filter((memberId) => unpairedLeaving.has(memberId)),
    extraArriving,
    targetByMember: target.byMember,
  });

  return {
    substitutions,
    positionChanges,
    steps,
    comingOn: arriving,
    goingOff: leaving,
    unchanged,
    isEmpty: substitutions.length === 0 && positionChanges.length === 0 && steps.length === 0,
    warnings,
  };
}

/* -------------------------------------------------------------------------- */
/* Ordering the steps                                                         */
/* -------------------------------------------------------------------------- */

function orderSteps(input: {
  currentBySlot: Map<string, string>;
  substitutions: readonly Substitution[];
  positionChanges: readonly PositionChange[];
  stillLeaving: readonly string[];
  extraArriving: readonly string[];
  targetByMember: Map<string, string>;
}): LineupStep[] {
  const steps: LineupStep[] = [];
  /** Who stands where as the steps are applied, so we can check a slot is free before using it. */
  const occupancy = new Map(input.currentBySlot);
  const slotOf = new Map<string, string>();
  for (const [slotId, memberId] of occupancy) slotOf.set(memberId, slotId);

  const vacate = (memberId: string) => {
    const slotId = slotOf.get(memberId);
    if (slotId === undefined) return null;
    occupancy.delete(slotId);
    slotOf.delete(memberId);
    return slotId;
  };
  const occupy = (memberId: string, slotId: string) => {
    occupancy.set(slotId, memberId);
    slotOf.set(memberId, slotId);
  };

  // 1. Everybody who is leaving goes first: that is what frees the slots the chain needs.
  for (const memberId of [...input.substitutions.map((s) => s.outId), ...input.stillLeaving]) {
    const slotId = vacate(memberId);
    steps.push({ kind: "out", memberId, slotId: slotId ?? "" });
  }

  // 2. Continuing players move, always into a slot that is free by then.
  const pending = [...input.positionChanges];
  while (pending.length > 0) {
    const index = pending.findIndex((change) => !occupancy.has(change.toSlotId));
    if (index >= 0) {
      const [change] = pending.splice(index, 1);
      vacate(change.memberId);
      occupy(change.memberId, change.toSlotId);
      steps.push({
        kind: "move",
        memberId: change.memberId,
        fromSlotId: change.fromSlotId,
        toSlotId: change.toSlotId,
      });
      continue;
    }

    // Everything left is blocked by another mover: a cycle. Two players exchanging slots is the
    // everyday case; a three-way rotation is rare but has to be expressible.
    const ring = extractCycle(pending);
    for (const change of ring) {
      const at = pending.indexOf(change);
      if (at >= 0) pending.splice(at, 1);
    }
    for (const change of ring) vacate(change.memberId);
    for (const change of ring) occupy(change.memberId, change.toSlotId);
    steps.push({
      kind: "rotation",
      memberIds: ring.map((change) => change.memberId),
      slotIds: ring.map((change) => change.toSlotId),
    });
  }

  // 3. Newcomers walk on last, into the slots the chain has now emptied.
  for (const substitution of input.substitutions) {
    occupy(substitution.inId, substitution.slotId);
    steps.push({ kind: "in", memberId: substitution.inId, slotId: substitution.slotId });
  }
  for (const memberId of input.extraArriving) {
    const slotId = input.targetByMember.get(memberId);
    if (slotId === undefined) continue;
    occupy(memberId, slotId);
    steps.push({ kind: "in", memberId, slotId });
  }

  return steps;
}

/**
 * Walk the "who is blocking whom" chain until it closes on itself. Every pending change is blocked
 * by another pending change (that is why we are here), so the walk always closes; the guard is
 * belt and braces against a malformed diff.
 */
function extractCycle(pending: readonly PositionChange[]): PositionChange[] {
  const bySourceSlot = new Map(pending.map((change) => [change.fromSlotId, change]));
  const ring: PositionChange[] = [];
  const seen = new Set<PositionChange>();
  let cursor: PositionChange | undefined = pending[0];
  while (cursor && !seen.has(cursor)) {
    seen.add(cursor);
    ring.push(cursor);
    cursor = bySourceSlot.get(cursor.toSlotId);
  }
  // Trim any tail that led into the cycle without being part of it.
  if (cursor) {
    const start = ring.indexOf(cursor);
    return start > 0 ? ring.slice(start) : ring;
  }
  return ring;
}

/* -------------------------------------------------------------------------- */
/* Applying                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Replay `steps` over a composition. The reducer does not need this — it replays the log itself —
 * but the tests do: applying the steps one at a time and checking that no slot is ever occupied
 * twice is the only honest proof that the ordering is right.
 */
export function applyLineupSteps(
  from: readonly SlotAssignment[],
  steps: readonly LineupStep[],
  onState?: (assignments: readonly SlotAssignment[], step: LineupStep) => void,
): SlotAssignment[] {
  const bySlot = new Map<string, string>();
  for (const { slotId, memberId } of from) bySlot.set(slotId, memberId);

  const slotOf = (memberId: string): string | undefined => {
    for (const [slotId, occupant] of bySlot) if (occupant === memberId) return slotId;
    return undefined;
  };

  for (const step of steps) {
    switch (step.kind) {
      case "out": {
        const slotId = slotOf(step.memberId);
        if (slotId !== undefined) bySlot.delete(slotId);
        break;
      }
      case "in": {
        bySlot.set(step.slotId, step.memberId);
        break;
      }
      case "move": {
        const slotId = slotOf(step.memberId);
        if (slotId !== undefined) bySlot.delete(slotId);
        bySlot.set(step.toSlotId, step.memberId);
        break;
      }
      case "rotation": {
        for (const memberId of step.memberIds) {
          const slotId = slotOf(memberId);
          if (slotId !== undefined) bySlot.delete(slotId);
        }
        step.memberIds.forEach((memberId, index) => {
          bySlot.set(step.slotIds[index], memberId);
        });
        break;
      }
    }
    onState?.(toAssignments(bySlot), step);
  }

  return toAssignments(bySlot);
}

function toAssignments(bySlot: Map<string, string>): SlotAssignment[] {
  return [...bySlot].map(([slotId, memberId]) => ({ slotId, memberId }));
}

/** True when two players share a slot — the state the step ordering exists to avoid. */
export function hasSlotConflict(assignments: readonly SlotAssignment[]): boolean {
  const slots = new Set<string>();
  for (const { slotId } of assignments) {
    if (slots.has(slotId)) return true;
    slots.add(slotId);
  }
  return false;
}

/* -------------------------------------------------------------------------- */
/* French summaries                                                           */
/* -------------------------------------------------------------------------- */

/** How the composition editor reads out a substitution: « Léo → Yanis ». */
export function describeSubstitutionFr(
  substitution: Substitution,
  nameOf: (memberId: string) => string,
): string {
  return `${nameOf(substitution.outId)} → ${nameOf(substitution.inId)}`;
}

/** « Karim passe MC → AT », or « Karim change de poste » when the slots are not known. */
export function describePositionChangeFr(
  change: PositionChange,
  nameOf: (memberId: string) => string,
  options: { long?: boolean } = {},
): string {
  const name = nameOf(change.memberId);
  const { fromPositionCode: from, toPositionCode: to } = change;
  if (!from || !to) return `${name} change de poste`;
  const label = options.long
    ? `${positionLabelFr(from)} → ${positionLabelFr(to)}`
    : `${from} → ${to}`;
  return `${name} passe ${label}`;
}

/** One French line per change, in the order a coach would carry them out. */
export function describeLineupDiffFr(
  diff: LineupDiff,
  nameOf: (memberId: string) => string,
  options: { long?: boolean } = {},
): string[] {
  return [
    ...diff.substitutions.map((substitution) => describeSubstitutionFr(substitution, nameOf)),
    ...diff.positionChanges.map((change) => describePositionChangeFr(change, nameOf, options)),
  ];
}

/** The same thing on one line, as the planned-composition card shows it. */
export function summariseLineupDiffFr(
  diff: LineupDiff,
  nameOf: (memberId: string) => string,
  options: { long?: boolean } = {},
): string {
  const parts = describeLineupDiffFr(diff, nameOf, options);
  return parts.length === 0 ? "Aucun changement" : parts.join(", ");
}

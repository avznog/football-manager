/**
 * The composition editor's state machine: which player stands in which slot.
 *
 * Pure, and deliberately unaware of pointers, React and the database — the drag-and-drop layer
 * turns a gesture into one of these calls and re-renders whatever comes back. That is what makes
 * "dropping a player on an occupied slot swaps them" (`docs/PLAN.md`, screen 4) a property proved
 * by a unit test rather than by dragging a disc around by hand.
 *
 * A composition is a set of `(slot, player)` pairs, which is exactly what `lineup_slots` stores,
 * and the two uniqueness rules of that table are the invariants upheld here: **one player per
 * slot, one slot per player**. Everything else — who is on the bench, whether the sheet is full —
 * is derived from the pairs, never stored beside them.
 */

import type { SlotAssignment } from "@/lib/match/lineup";

import { orderShape, type ShapeSlot } from "@/lib/formation/shape";

export type { SlotAssignment };

/** The player standing in a slot, or null. */
export function memberInSlot(
  assignments: readonly SlotAssignment[],
  slotId: string,
): string | null {
  return assignments.find((assignment) => assignment.slotId === slotId)?.memberId ?? null;
}

/** The slot a player stands in, or null when they are on the bench. */
export function slotOfMember(
  assignments: readonly SlotAssignment[],
  memberId: string,
): string | null {
  return assignments.find((assignment) => assignment.memberId === memberId)?.slotId ?? null;
}

export function isOnPitch(assignments: readonly SlotAssignment[], memberId: string): boolean {
  return slotOfMember(assignments, memberId) !== null;
}

/**
 * Puts `memberId` in `slotId`, and does whatever that implies for the player who was there.
 *
 * - the slot is free, the player was on the bench → he comes on;
 * - the slot is free, the player was elsewhere on the pitch → he moves, leaving his slot empty;
 * - the slot is taken, the player was elsewhere on the pitch → **they swap**;
 * - the slot is taken, the player was on the bench → the occupant goes back to the bench.
 *
 * The swap is the important one: a coach rearranging a midfield drags one player onto another and
 * expects a trade, not the second player vanishing. Nothing here ever drops a player by accident —
 * the occupant either lands in the mover's old slot or is unassigned, and both are visible.
 */
export function placeInSlot(
  assignments: readonly SlotAssignment[],
  slotId: string,
  memberId: string,
): SlotAssignment[] {
  const occupant = memberInSlot(assignments, slotId);
  if (occupant === memberId) return [...assignments];

  const previousSlot = slotOfMember(assignments, memberId);

  // A Map keyed on the slot keeps the original order (an existing key stays put, a new one is
  // appended), so the result is stable and diffable between renders.
  const bySlot = new Map(assignments.map((assignment) => [assignment.slotId, assignment.memberId]));
  bySlot.set(slotId, memberId);

  if (previousSlot !== null) {
    if (occupant !== null) bySlot.set(previousSlot, occupant);
    else bySlot.delete(previousSlot);
  }

  return fromMap(bySlot);
}

/** Empties a slot: whoever was in it goes back to the bench. */
export function clearSlot(
  assignments: readonly SlotAssignment[],
  slotId: string,
): SlotAssignment[] {
  return assignments.filter((assignment) => assignment.slotId !== slotId);
}

/** Takes a player off the pitch, wherever he was. */
export function removeMember(
  assignments: readonly SlotAssignment[],
  memberId: string,
): SlotAssignment[] {
  return assignments.filter((assignment) => assignment.memberId !== memberId);
}

/** Drops every pair whose slot is not in `slotIds` — used when the shape changes underfoot. */
export function restrictToSlots(
  assignments: readonly SlotAssignment[],
  slotIds: readonly string[],
): SlotAssignment[] {
  const known = new Set(slotIds);
  return assignments.filter((assignment) => known.has(assignment.slotId));
}

/** Drops every pair whose player is not in `memberIds` — used when the match sheet changes. */
export function restrictToMembers(
  assignments: readonly SlotAssignment[],
  memberIds: readonly string[],
): SlotAssignment[] {
  const known = new Set(memberIds);
  return assignments.filter((assignment) => known.has(assignment.memberId));
}

/**
 * Carries a composition over to another formation, slot by slot in store order (goalkeeper first,
 * then back to front).
 *
 * Switching from a 1-3-2-1 to a 1-2-3-1 half way through picking a team should not throw the work
 * away: the keeper stays the keeper, the defenders stay at the back, and the coach only fixes what
 * actually changed. Slots that have no counterpart in the new shape lose their player to the
 * bench — which is honest, since the position no longer exists.
 */
export function remapToShape(
  assignments: readonly SlotAssignment[],
  fromSlots: readonly ShapeSlot[],
  toSlots: readonly ShapeSlot[],
): SlotAssignment[] {
  const source = orderShape(fromSlots);
  const target = orderShape(toSlots);

  const result: SlotAssignment[] = [];
  const taken = new Set<string>();

  target.forEach((slot, index) => {
    const from = source[index];
    if (!from) return;
    const memberId = memberInSlot(assignments, from.key);
    if (memberId === null || taken.has(memberId)) return;
    taken.add(memberId);
    result.push({ slotId: slot.key, memberId });
  });

  return result;
}

/** Store order, so what is saved and what is compared do not depend on the order of the gestures. */
export function sortAssignments(
  assignments: readonly SlotAssignment[],
  slots: readonly ShapeSlot[],
): SlotAssignment[] {
  const rank = new Map(orderShape(slots).map((slot, index) => [slot.key, index]));
  return [...assignments].sort((a, b) => {
    const rankA = rank.get(a.slotId) ?? Number.MAX_SAFE_INTEGER;
    const rankB = rank.get(b.slotId) ?? Number.MAX_SAFE_INTEGER;
    if (rankA !== rankB) return rankA - rankB;
    return a.slotId < b.slotId ? -1 : a.slotId > b.slotId ? 1 : 0;
  });
}

/** Everyone available who is not on the pitch, in the order given. */
export function benchOf<T extends { membershipId: string }>(
  members: readonly T[],
  assignments: readonly SlotAssignment[],
): T[] {
  const placed = new Set(assignments.map((assignment) => assignment.memberId));
  return members.filter((member) => !placed.has(member.membershipId));
}

/** How many slots are still empty. */
export function emptySlotCount(
  assignments: readonly SlotAssignment[],
  slots: readonly ShapeSlot[],
): number {
  return slots.filter((slot) => memberInSlot(assignments, slot.key) === null).length;
}

/**
 * A stable string for a set of assignments, order-independent. Used to tell "the coach has changed
 * something" from "React re-rendered", which is what drives the « Modifications non
 * enregistrées » warning.
 */
export function assignmentsSignature(assignments: readonly SlotAssignment[]): string {
  return [...assignments]
    .map((assignment) => `${assignment.slotId}:${assignment.memberId}`)
    .sort()
    .join("|");
}

function fromMap(bySlot: Map<string, string>): SlotAssignment[] {
  return [...bySlot].map(([slotId, memberId]) => ({ slotId, memberId }));
}

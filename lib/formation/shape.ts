/**
 * A formation's **shape**: seven slots at seven points on the pitch.
 *
 * Pure — no database, no React, no clock. Since decision 157 there is one shape and the coach no
 * longer drags its slots, so what is left here is how the editor and TERRAIN *read* a shape: store
 * order, the label, and which slot a drop lands on.
 */

import {
  LINE_ORDER,
  POSITION_BY_CODE,
  type PositionCode,
  formationLabelOf,
  isPositionCode,
} from "@/db/reference";
import { type PitchPoint, pitchDistance } from "@/lib/pitch/geometry";

/** One slot, keyed on its `formation_slots.id`. */
export type ShapeSlot = {
  key: string;
  positionCode: PositionCode;
  /** 0..1000, left touchline to right touchline. */
  x: number;
  /** 0..1000, our own goal line to the opponent's. */
  y: number;
};

/**
 * Store order: the goalkeeper first, then line by line from the back, left to right inside a line —
 * which is what `formation_slots.sort` means, and exactly how the built-in template in
 * `db/reference.ts` numbers itself.
 *
 * `x` before `y`: two slots in the same line are read left to right even when one of them is a few
 * units deeper, which is how the formation orders its `AIL`, `MC`, `AIL`.
 */
export function orderShape(slots: readonly ShapeSlot[]): ShapeSlot[] {
  return [...slots].sort((a, b) => {
    const lineA = POSITION_BY_CODE[a.positionCode]?.sort ?? Number.MAX_SAFE_INTEGER;
    const lineB = POSITION_BY_CODE[b.positionCode]?.sort ?? Number.MAX_SAFE_INTEGER;
    const lineRankA = LINE_ORDER.indexOf(POSITION_BY_CODE[a.positionCode]?.line ?? "ATT");
    const lineRankB = LINE_ORDER.indexOf(POSITION_BY_CODE[b.positionCode]?.line ?? "ATT");
    if (lineRankA !== lineRankB) return lineRankA - lineRankB;
    if (a.x !== b.x) return a.x - b.x;
    if (a.y !== b.y) return a.y - b.y;
    if (lineA !== lineB) return lineA - lineB;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });
}

/** The `1-2-3-1` style label of a shape, counted from its slots (see `formationLabelOf`). */
export function shapeLabel(slots: readonly ShapeSlot[]): string {
  return formationLabelOf(slots);
}

/**
 * How far from a slot a drop still counts as a drop **on** it, in pitch-width units.
 *
 * Deliberately generous — a shade over two disc widths — because the gesture this serves is a thumb
 * on a 320 px screen, where the finger hides the target it is aiming at. Anything further away is
 * treated as a drop on empty grass and changes nothing, so the forgiveness never becomes a surprise.
 */
export const SNAP_DISTANCE = 340;

/** The slot a drop at `point` lands on, or `null` for a drop on empty grass. */
export function nearestSlot(
  slots: readonly ShapeSlot[],
  point: PitchPoint,
  maxDistance: number = SNAP_DISTANCE,
): ShapeSlot | null {
  let best: ShapeSlot | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const slot of slots) {
    const distance = pitchDistance(slot, point);
    if (distance < bestDistance) {
      best = slot;
      bestDistance = distance;
    }
  }
  return best !== null && bestDistance <= maxDistance ? best : null;
}

/** `formation_slots` rows → a shape, keyed on the row ids. A code this app does not know is dropped. */
export function shapeFromRows(
  rows: readonly { id: string; positionCode: string; x: number; y: number }[],
): ShapeSlot[] {
  return rows
    .filter((row): row is { id: string; positionCode: PositionCode; x: number; y: number } =>
      isPositionCode(row.positionCode),
    )
    .map((row) => ({ key: row.id, positionCode: row.positionCode, x: row.x, y: row.y }));
}

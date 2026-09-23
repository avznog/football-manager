/**
 * A formation's **shape**: seven slots at seven points on the pitch.
 *
 * This is what the coach edits when they drag the empty slots themselves rather than the players
 * (decision 005). Pure — no database, no React, no clock — because the whole point is that the
 * rules below are checked identically in the editor, in the Server Action and in a unit test.
 *
 * ## A dragged slot is retyped, not just moved
 *
 * `formations.label` is derived from the `line` of each slot's `position_code`
 * (`formationLabelOf`), so moving a `DC` marker up to the halfway line without touching its code
 * would give a `1-3-2-1` whose defence is standing in midfield. A slot therefore **takes the
 * position it lands nearest to**: drag a centre-back up and he becomes a centre midfielder, and
 * the label the coach sees turns into `1-2-3-1` on its own. That is the only behaviour that keeps
 * the label, the minutes-by-position statistics and a player's preferences all telling the truth.
 *
 * The goalkeeper is the exception: his slot keeps `GB` wherever it is dragged, and `GB` is never a
 * candidate for anybody else. A formation with no keeper, or with two, is not a formation
 * (`docs/DATA_MODEL.md`), and making the code immovable is cheaper than validating the mistake
 * afterwards.
 */

import {
  FORMATION_SLOT_COUNT,
  LINE_ORDER,
  POSITIONS,
  POSITION_BY_CODE,
  type PositionCode,
  formationLabelOf,
  isPositionCode,
  positionLabelFr,
} from "@/db/reference";
import {
  MIN_MARKER_DISTANCE,
  type PitchPoint,
  clampToPitch,
  isValidPitchPoint,
  pitchDistance,
} from "@/lib/pitch/geometry";

/**
 * One slot being edited. `key` is a `formation_slots.id` for a saved formation, or a throwaway
 * local id while the coach is still dragging a new shape around.
 */
export type ShapeSlot = {
  key: string;
  positionCode: PositionCode;
  /** 0..1000, left touchline to right touchline. */
  x: number;
  /** 0..1000, our own goal line to the opponent's. */
  y: number;
};

/** The ten outfield positions: everything a dragged slot may become. */
export const OUTFIELD_POSITIONS = POSITIONS.filter((position) => position.line !== "GB");

/**
 * The outfield position whose canonical spot is closest to `point`.
 *
 * `pitchDistance` rather than raw Euclidean distance: the pitch is 1.5 times longer than it is
 * wide, so the nearest position must be the one that looks nearest. Ties go to the lower `sort`,
 * so the answer never depends on the order of `POSITIONS`.
 */
export function nearestOutfieldPositionCode(point: PitchPoint): PositionCode {
  let best = OUTFIELD_POSITIONS[0];
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const position of OUTFIELD_POSITIONS) {
    const distance = pitchDistance(point, { x: position.defaultX, y: position.defaultY });
    if (distance < bestDistance || (distance === bestDistance && position.sort < best.sort)) {
      best = position;
      bestDistance = distance;
    }
  }
  return best.code;
}

/** True for the slot the goalkeeper stands in — the one slot whose code never changes. */
export function isGoalkeeperSlot(slot: ShapeSlot): boolean {
  return slot.positionCode === "GB";
}

/** Move one slot, clamped onto the pitch, and retype it from where it landed. */
export function moveShapeSlot(
  slots: readonly ShapeSlot[],
  key: string,
  point: PitchPoint,
): ShapeSlot[] {
  const target = clampToPitch(point);
  return slots.map((slot) =>
    slot.key === key
      ? {
          ...slot,
          x: target.x,
          y: target.y,
          positionCode: isGoalkeeperSlot(slot)
            ? slot.positionCode
            : nearestOutfieldPositionCode(target),
        }
      : slot,
  );
}

/**
 * Store order: the goalkeeper first, then line by line from the back, left to right inside a line —
 * which is what `formation_slots.sort` means, and exactly how the built-in templates in
 * `db/reference.ts` number themselves. Derived rather than remembered, so a shape the coach has
 * dragged into a different arrangement still numbers its slots the way the rest of the app expects.
 *
 * `x` before `y`: two slots in the same line are read left to right even when one of them is a few
 * units deeper, which is how the built-ins order `MG`, `MOC`, `MD`.
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

/** The `1-3-2-1` style label of a shape, counted from its slots (see `formationLabelOf`). */
export function shapeLabel(slots: readonly ShapeSlot[]): string {
  return formationLabelOf(slots);
}

/** The French name a formation the coach drew gets in the picker. */
export function customFormationNameFr(label: string): string {
  return `Perso ${label}`;
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

/** Pairs of slots whose discs would overlap on a 320 px screen (`MIN_MARKER_DISTANCE`). */
export function shapeCollisions(slots: readonly ShapeSlot[]): { a: ShapeSlot; b: ShapeSlot }[] {
  const pairs: { a: ShapeSlot; b: ShapeSlot }[] = [];
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (pitchDistance(slots[i], slots[j]) < MIN_MARKER_DISTANCE) {
        pairs.push({ a: slots[i], b: slots[j] });
      }
    }
  }
  return pairs;
}

/**
 * Everything wrong with a shape, in French, ready to print. An empty array means it can be saved.
 *
 * Collisions are a refusal, not a warning: two discs on top of each other cannot be told apart or
 * tapped, so a formation that has them would be unusable for the very job it exists for.
 */
export function shapeProblemsFr(slots: readonly ShapeSlot[]): string[] {
  const problems: string[] = [];

  if (slots.length !== FORMATION_SLOT_COUNT) {
    problems.push(`Une formation à 7 compte ${FORMATION_SLOT_COUNT} postes, pas ${slots.length}.`);
  }

  const keepers = slots.filter(isGoalkeeperSlot);
  if (keepers.length === 0) problems.push("Il faut un poste de gardien.");
  if (keepers.length > 1) problems.push("Il ne peut y avoir qu’un seul poste de gardien.");

  if (new Set(slots.map((slot) => slot.key)).size !== slots.length) {
    problems.push("Deux postes portent le même identifiant.");
  }

  for (const slot of slots) {
    if (!isValidPitchPoint(slot)) {
      problems.push(`Le poste ${slot.positionCode} est en dehors du terrain.`);
    }
  }

  for (const { a, b } of shapeCollisions(slots)) {
    problems.push(
      `Les postes ${positionLabelFr(a.positionCode)} et ${positionLabelFr(b.positionCode)} sont trop proches : écarte-les.`,
    );
  }

  return problems;
}

/** True when two shapes place the same positions at the same points — keys are ignored. */
export function sameShape(a: readonly ShapeSlot[], b: readonly ShapeSlot[]): boolean {
  if (a.length !== b.length) return false;
  const signature = (slots: readonly ShapeSlot[]) =>
    orderShape(slots)
      .map((slot) => `${slot.positionCode}@${slot.x},${slot.y}`)
      .join("|");
  return signature(a) === signature(b);
}

/**
 * Pairs a hand-drawn shape with the slots of an existing formation, or `null` if they are not the
 * same shape.
 *
 * This is what lets the app **reuse** a formation instead of inserting a near-duplicate every time
 * the coach saves: if the shape they drew is already the team's « Perso 1-2-3-1 », or even one of
 * the built-ins, the composition points at that formation and the local slot keys are translated to
 * its real `formation_slots.id`s. Both sides are put in store order first, and `sameShape`
 * guarantees the pairing is exact.
 */
export function mapShapeToSlots(
  shape: readonly ShapeSlot[],
  slots: readonly { id: string; positionCode: string; x: number; y: number }[],
): Map<string, string> | null {
  const candidate = shapeFromRows(slots);
  if (candidate.length !== slots.length) return null;
  if (!sameShape(shape, candidate)) return null;

  const from = orderShape(shape);
  const to = orderShape(candidate);
  return new Map(from.map((slot, index) => [slot.key, to[index].key]));
}

/** `formation_slots` rows → an editable shape, keyed on the row ids. */
export function shapeFromRows(
  rows: readonly { id: string; positionCode: string; x: number; y: number }[],
): ShapeSlot[] {
  return rows
    .filter((row): row is { id: string; positionCode: PositionCode; x: number; y: number } =>
      isPositionCode(row.positionCode),
    )
    .map((row) => ({ key: row.id, positionCode: row.positionCode, x: row.x, y: row.y }));
}

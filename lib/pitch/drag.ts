/**
 * The pointer-drag state machine for the two screens that drag on the turf: the composition editor
 * and TERRAIN (decision 045). Pure, so the rules a thumb in the rain depends on are testable without
 * a browser; the React side of it is `components/pitch/use-pitch-drag.ts`.
 *
 * Three rules live here, and all three exist because of the same finger:
 *
 * 1. **A gesture that goes nowhere is a tap.** Below {@link TAP_SLOP} of travel the sequence is
 *    reported as a tap, which is what makes tap-then-tap a complete alternative to dragging — a
 *    requirement of decision 045, not a nicety.
 * 2. **The turf has a margin.** A drop {@link PITCH_MARGIN_PX} outside the box still counts as a drop
 *    on the pitch, because the goalkeeper's slot sits against the goal line and a thumb aiming at it
 *    lands half off the graphic.
 * 3. **Off the turf is a distinct answer**, not a clamped point. `fromClientPoint` clamps, so without
 *    the `inside` flag a drop on the bench would read as a drop on the nearest touchline slot. What
 *    each screen then does with "outside" differs — the editor benches the player, TERRAIN refuses to
 *    move him — and that difference is deliberate (decision 045 again), so it stays in the callers.
 */

import { fromClientPoint, type Box, type PitchPoint } from "./geometry";

/** Pixels of travel below which a pointer sequence is a tap, not a drag. */
export const TAP_SLOP = 8;

/** How far outside the pitch box a drop still counts as a drop on the pitch. */
export const PITCH_MARGIN_PX = 12;

/** A point on the screen, in the units `PointerEvent` reports. */
export type ClientPoint = { x: number; y: number };

/**
 * One drag in flight. `S` is whatever the screen needs to know about what is being carried — a player
 * id, a formation slot, or a pair of the two.
 */
export type PitchDrag<S> = {
  /** The pointer that started it. A second finger on the screen is ignored, not merged in. */
  pointerId: number;
  subject: S;
  /** Where the finger went down, in screen coordinates: how a tap is told from a drag. */
  origin: ClientPoint;
  /** Where the finger is now, in pitch coordinates, or `null` once it has left the turf. */
  point: PitchPoint | null;
  /** True once the finger has travelled further than {@link TAP_SLOP}. */
  moved: boolean;
};

/** Where a pointer is, in pitch coordinates, and whether it is still over the turf. */
export type Located = { point: PitchPoint; inside: boolean };

/**
 * Screen point → pitch point, plus the `inside` flag.
 *
 * `null` for a box that is not on screen yet (zero width, or a ref that has not attached): the caller
 * cannot place anything then, and guessing a point would place it at a corner.
 */
export function locate(client: ClientPoint, box: Box | null): Located | null {
  if (!box || box.width <= 0 || box.height <= 0) return null;
  const inside =
    client.x >= box.left - PITCH_MARGIN_PX &&
    client.x <= box.left + box.width + PITCH_MARGIN_PX &&
    client.y >= box.top - PITCH_MARGIN_PX &&
    client.y <= box.top + box.height + PITCH_MARGIN_PX;
  return { point: fromClientPoint(client, box), inside };
}

/** The pitch point under a pointer, or `null` if it is off the turf. */
export function pointOf(client: ClientPoint, box: Box | null): PitchPoint | null {
  const located = locate(client, box);
  return located?.inside ? located.point : null;
}

/** A pointer going down on `subject`. */
export function startDrag<S>(
  options: { pointerId: number; subject: S; client: ClientPoint; box: Box | null },
): PitchDrag<S> {
  return {
    pointerId: options.pointerId,
    subject: options.subject,
    origin: options.client,
    point: pointOf(options.client, options.box),
    moved: false,
  };
}

/**
 * The same drag, one pointer move later. `moved` latches: a finger that wanders 20 px and comes back
 * to where it started has dragged, and must not turn back into a tap.
 *
 * Travel is measured as Manhattan distance — cheaper than a hypotenuse and, for a threshold meant to
 * separate "did not move" from "moved", equivalent in every way that matters.
 */
export function advanceDrag<S>(
  drag: PitchDrag<S>,
  options: { client: ClientPoint; box: Box | null },
): PitchDrag<S> {
  const travelled =
    Math.abs(options.client.x - drag.origin.x) + Math.abs(options.client.y - drag.origin.y);
  return {
    ...drag,
    moved: drag.moved || travelled > TAP_SLOP,
    point: pointOf(options.client, options.box),
  };
}

/** The rectangle of a pitch element, as plain numbers. `null` when it is not on screen. */
export function boxOf(element: { getBoundingClientRect: () => DOMRect } | null): Box | null {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

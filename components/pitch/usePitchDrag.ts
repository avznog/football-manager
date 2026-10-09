"use client";

import { useCallback, useState, type RefObject } from "react";

import {
  advanceDrag,
  boxOf,
  pointOf,
  startDrag,
  type ClientPoint,
  type PitchDrag,
} from "@/lib/pitch/drag";
import type { PitchPoint } from "@/lib/pitch/geometry";

/**
 * Dragging something across the turf, for the two screens that do it: the composition editor and
 * TERRAIN (decision 045, which named this hook as the debt it was leaving behind).
 *
 * The hook owns the part that was identical in both — pointer capture, the one-pointer rule, telling a
 * tap from a drag, and converting screen coordinates to pitch coordinates — and nothing else. Every
 * decision that differs between the two screens is a callback, because those differences are the point:
 * a drop on empty grass benches a player in the editor and is deliberately a **no-op** in TERRAIN,
 * where the same slip at 70′ would cost the coach a player.
 *
 * ```tsx
 * const pitchRef = useRef<HTMLDivElement | null>(null);
 * const gesture = usePitchDrag<string>({
 *   pitchRef,
 *   onTap: (memberId) => select(memberId),
 *   onDrop: (memberId, point) => (point ? place(nearestSlot(point), memberId) : bench(memberId)),
 * });
 * ```
 *
 * Both `onDrop` and `onMove` are also handed the raw **client** point, because a pitch point cannot
 * answer « is the finger over that other element ». The composition editor needs exactly that: its
 * bench is a `sticky z-20` dock drawn *in front of* the bottom of the turf, so a finger on the bench
 * is still inside the pitch's rectangle and `point` alone would place the player on the nearest
 * defender. A screen with something in front of the pitch tests the client point first.
 *
 * ```tsx
 *
 * <div ref={pitchRef}>…</div>
 * <button onPointerDown={(event) => gesture.begin(event, memberId)} {...gesture.handlers} />
 * ```
 *
 * `S` is whatever the screen needs to know about what is being carried: a player id, a formation slot
 * key, or a pair of them.
 *
 * The ref is the caller's rather than the hook's on purpose: a hook that returned one would make
 * everything else it returns a ref value in the eyes of `react-hooks/refs`, and `gesture.drag` — read
 * on every render to draw the lifted disc — is ordinary state that must stay readable there.
 */
export function usePitchDrag<S>({
  pitchRef,
  onTap,
  onDrop,
  onMove,
}: {
  /** The element wrapping the pitch graphic, whose box turns a finger into a pitch point. */
  pitchRef: RefObject<HTMLDivElement | null>;
  /** The gesture went nowhere: it was a tap on `subject`. */
  onTap: (subject: S) => void;
  /**
   * The gesture ended. `point` is `null` when the finger was off the turf — an answer, not a failure
   * — and `client` is where the finger actually was, for hit-testing anything drawn over the pitch.
   */
  onDrop: (subject: S, point: PitchPoint | null, client: ClientPoint) => void;
  /**
   * Called on every move once the gesture counts as a drag, whether or not the finger is over the
   * turf: a screen with a drop target beside the pitch has to be able to light it up, and a `point`
   * of `null` is the only news a finger that has left the turf carries.
   *
   * The composition editor uses it to ring its docked bench while a player is carried over it.
   */
  onMove?: (subject: S, point: PitchPoint | null, client: ClientPoint) => void;
}) {
  const [drag, setDrag] = useState<PitchDrag<S> | null>(null);

  /** The live rectangle of the turf. Read on every event: the sheet animates, and it scrolls. */
  const box = useCallback(() => boxOf(pitchRef.current), [pitchRef]);

  const begin = useCallback(
    (event: React.PointerEvent<HTMLElement>, subject: S) => {
      // Mouse: left button only. Touch and pen have no buttons to speak of.
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDrag(
        startDrag({
          pointerId: event.pointerId,
          subject,
          client: { x: event.clientX, y: event.clientY },
          box: box(),
        }),
      );
    },
    [box],
  );

  const move = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const client = { x: event.clientX, y: event.clientY };
      const next = advanceDrag(drag, { client, box: box() });
      setDrag(next);
      if (next.moved) onMove?.(next.subject, next.point, client);
    },
    [box, drag, onMove],
  );

  const end = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const client = { x: event.clientX, y: event.clientY };
      const point = pointOf(client, box());
      setDrag(null);
      if (drag.moved) onDrop(drag.subject, point, client);
      else onTap(drag.subject);
    },
    [box, drag, onDrop, onTap],
  );

  /** The pointer was taken away — the browser scrolled, the finger left the screen. Write nothing. */
  const cancel = useCallback(() => setDrag(null), []);

  return {
    /** The gesture in flight, for rendering the lifted disc and the hovered slot. */
    drag,
    begin,
    /** Spread onto anything draggable, alongside an `onPointerDown` that calls `begin`. */
    handlers: {
      onPointerMove: move,
      onPointerUp: end,
      onPointerCancel: cancel,
    },
  };
}

export type PitchDragHandle<S> = ReturnType<typeof usePitchDrag<S>>;

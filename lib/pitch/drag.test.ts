import { describe, expect, it } from "vitest";

import {
  advanceDrag,
  locate,
  PITCH_MARGIN_PX,
  pointOf,
  startDrag,
  TAP_SLOP,
  type PitchDrag,
} from "./drag";
import type { Box } from "./geometry";

/** A 300×450 pitch graphic at the top left of the screen — the shape of it on a 390 px phone. */
const BOX: Box = { left: 40, top: 100, width: 300, height: 450 };

const CENTRE = { x: BOX.left + BOX.width / 2, y: BOX.top + BOX.height / 2 };

describe("locate", () => {
  it("answers nothing at all for a pitch that is not on screen yet", () => {
    // A ref that has not attached, or a sheet mid-animation. Guessing a point would place a player
    // in a corner, so the callers treat null as « cannot place anything ».
    expect(locate(CENTRE, null)).toBeNull();
    expect(locate(CENTRE, { ...BOX, width: 0 })).toBeNull();
    expect(locate(CENTRE, { ...BOX, height: 0 })).toBeNull();
  });

  it("puts the middle of the box in the middle of the pitch", () => {
    const located = locate(CENTRE, BOX);
    expect(located?.inside).toBe(true);
    expect(located?.point).toEqual({ x: 500, y: 500 });
  });

  /**
   * The goalkeeper's slot sits against the goal line, at the very edge of the graphic, and a thumb
   * aiming at it lands half off it. The margin is what makes that drop land in goal instead of on the
   * bench.
   */
  it("counts a drop just outside the box as a drop on the pitch", () => {
    const justOutside = { x: BOX.left - PITCH_MARGIN_PX + 1, y: CENTRE.y };
    expect(locate(justOutside, BOX)?.inside).toBe(true);

    const clearlyOutside = { x: BOX.left - PITCH_MARGIN_PX - 1, y: CENTRE.y };
    expect(locate(clearlyOutside, BOX)?.inside).toBe(false);
  });

  it("still reports a point when the finger is outside, and the caller ignores it", () => {
    // `fromClientPoint` clamps, so the point of a drop on the bench is a touchline point. That is
    // exactly why `inside` exists: without it, dropping a player on the bench would place him wide
    // left instead of taking him off.
    const onTheBench = { x: CENTRE.x, y: BOX.top + BOX.height + 200 };
    expect(locate(onTheBench, BOX)?.point).toEqual({ x: 500, y: 0 });
    expect(locate(onTheBench, BOX)?.inside).toBe(false);
    expect(pointOf(onTheBench, BOX)).toBeNull();
  });
});

describe("a drag in flight", () => {
  function dragFrom(client: { x: number; y: number }): PitchDrag<string> {
    return startDrag({ pointerId: 1, subject: "karim", client, box: BOX });
  }

  it("starts as a tap, not a drag", () => {
    const drag = dragFrom(CENTRE);
    expect(drag.moved).toBe(false);
    expect(drag.origin).toEqual(CENTRE);
    expect(drag.point).toEqual({ x: 500, y: 500 });
  });

  it("knows it is off the turf from the first moment, if that is where it started", () => {
    // A player picked up from the bench strip: the pointer goes down well below the pitch.
    const drag = dragFrom({ x: CENTRE.x, y: BOX.top + BOX.height + 60 });
    expect(drag.point).toBeNull();
  });

  it("is still a tap after a wobble, and a drag one pixel later", () => {
    const drag = dragFrom(CENTRE);
    const wobbled = advanceDrag(drag, {
      client: { x: CENTRE.x + TAP_SLOP, y: CENTRE.y },
      box: BOX,
    });
    expect(wobbled.moved).toBe(false);

    const dragged = advanceDrag(drag, {
      client: { x: CENTRE.x + TAP_SLOP + 1, y: CENTRE.y },
      box: BOX,
    });
    expect(dragged.moved).toBe(true);
  });

  /**
   * Coming back to the starting point must not turn a drag back into a tap: the tap path and the drop
   * path do different things, and a coach who has dragged a player around the pitch and let go where
   * he picked him up has not asked to select him.
   */
  it("stays a drag once it has been one", () => {
    let drag = dragFrom(CENTRE);
    drag = advanceDrag(drag, { client: { x: CENTRE.x + 40, y: CENTRE.y + 40 }, box: BOX });
    drag = advanceDrag(drag, { client: CENTRE, box: BOX });
    expect(drag.moved).toBe(true);
  });

  it("measures travel across both axes, so a diagonal wobble is not a drag", () => {
    const drag = advanceDrag(dragFrom(CENTRE), {
      client: { x: CENTRE.x + 3, y: CENTRE.y + 3 },
      box: BOX,
    });
    expect(drag.moved).toBe(false);
  });

  it("carries its subject through untouched", () => {
    const slot = { kind: "slot", key: "GB" } as const;
    const drag = startDrag({ pointerId: 7, subject: slot, client: CENTRE, box: BOX });
    expect(advanceDrag(drag, { client: CENTRE, box: BOX }).subject).toBe(slot);
    expect(drag.pointerId).toBe(7);
  });

  it("loses its point when the finger leaves the turf, and finds it again on the way back", () => {
    let drag = dragFrom(CENTRE);
    drag = advanceDrag(drag, { client: { x: CENTRE.x, y: BOX.top + BOX.height + 80 }, box: BOX });
    expect(drag.point).toBeNull();
    drag = advanceDrag(drag, { client: CENTRE, box: BOX });
    expect(drag.point).toEqual({ x: 500, y: 500 });
  });

  it("keeps working when the pitch is measured differently mid-gesture", () => {
    // The TERRAIN sheet animates in, so the box the gesture started against is not the box it ends
    // against. Every step measures again rather than caching.
    const drag = advanceDrag(dragFrom(CENTRE), {
      client: CENTRE,
      box: { ...BOX, top: BOX.top + 450 },
    });
    expect(drag.point).toBeNull();
  });
});

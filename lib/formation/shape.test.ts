import { describe, expect, it } from "vitest";

import { THE_FORMATION } from "@/db/reference";

import { nearestSlot, orderShape, shapeFromRows, shapeLabel, type ShapeSlot } from "./shape";

/** The formation as the editor sees it, keyed like the `formation_slots` rows would be. */
function theShape(): ShapeSlot[] {
  return shapeFromRows(
    THE_FORMATION.slots.map((slot) => ({
      id: `slot-${slot.sort}`,
      positionCode: slot.positionCode,
      x: slot.x,
      y: slot.y,
    })),
  );
}

describe("shapeLabel", () => {
  it("reads 1-2-3-1 off the formation's own slots, the two wingers counted in midfield", () => {
    expect(shapeLabel(theShape())).toBe("1-2-3-1");
  });
});

describe("orderShape", () => {
  it("reproduces the store order of the formation", () => {
    expect(orderShape(theShape()).map((slot) => slot.key)).toEqual(
      THE_FORMATION.slots.map((slot) => `slot-${slot.sort}`),
    );
  });

  it("reads the midfield line left to right: winger, centre, winger", () => {
    const midfield = orderShape(theShape()).filter(
      (slot) => slot.positionCode === "AIL" || slot.positionCode === "MC",
    );
    expect(midfield.map((slot) => slot.positionCode)).toEqual(["AIL", "MC", "AIL"]);
  });

  it("does not depend on the order it is given", () => {
    const shape = theShape();
    expect(orderShape([...shape].reverse())).toEqual(orderShape(shape));
  });
});

describe("nearestSlot", () => {
  const shape = theShape();

  it("finds the slot under the finger", () => {
    const striker = shape.find((slot) => slot.positionCode === "AT")!;
    expect(nearestSlot(shape, { x: striker.x + 10, y: striker.y - 10 })?.key).toBe(striker.key);
  });

  it("tells the two wingers apart by where the finger is", () => {
    const [left, right] = shape
      .filter((slot) => slot.positionCode === "AIL")
      .sort((a, b) => a.x - b.x);
    expect(nearestSlot(shape, { x: 120, y: 540 })?.key).toBe(left.key);
    expect(nearestSlot(shape, { x: 880, y: 540 })?.key).toBe(right.key);
  });

  it("forgives a thumb that lands a disc-width off target", () => {
    const keeper = shape.find((slot) => slot.positionCode === "GB")!;
    // Roughly 150 units to the side: the finger covered the disc it was aiming at.
    expect(nearestSlot(shape, { x: keeper.x + 150, y: keeper.y })?.key).toBe(keeper.key);
  });

  it("answers null for a drop on empty grass", () => {
    // The opponent's left corner is genuinely empty: nobody stands there.
    expect(nearestSlot(shape, { x: 20, y: 980 }, 100)).toBeNull();
  });

  it("never answers for an empty shape", () => {
    expect(nearestSlot([], { x: 500, y: 500 })).toBeNull();
  });
});

describe("shapeFromRows", () => {
  it("keys every slot on its row id", () => {
    expect(theShape().map((slot) => slot.key)).toEqual(
      THE_FORMATION.slots.map((slot) => `slot-${slot.sort}`),
    );
  });

  it("drops a slot on a retired position code rather than mistyping it", () => {
    // A retired formation's `MG` slot: `positions` still has the row, the vocabulary does not.
    expect(shapeFromRows([{ id: "old", positionCode: "MG", x: 160, y: 520 }])).toEqual([]);
  });
});

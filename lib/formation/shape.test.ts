import { describe, expect, it } from "vitest";

import { BUILTIN_FORMATIONS, POSITIONS, formationByLabel } from "@/db/reference";
import { MIN_MARKER_DISTANCE } from "@/lib/pitch/geometry";

import {
  customFormationNameFr,
  mapShapeToSlots,
  moveShapeSlot,
  nearestOutfieldPositionCode,
  nearestSlot,
  orderShape,
  sameShape,
  shapeCollisions,
  shapeFromRows,
  shapeLabel,
  shapeProblemsFr,
  type ShapeSlot,
} from "./shape";

/** A built-in template as the editor sees it, keyed like the `formation_slots` rows would be. */
function shapeOf(label: string): ShapeSlot[] {
  const template = formationByLabel(label);
  if (!template) throw new Error(`unknown formation ${label}`);
  return shapeFromRows(
    template.slots.map((slot) => ({
      id: `slot-${slot.sort}`,
      positionCode: slot.positionCode,
      x: slot.x,
      y: slot.y,
    })),
  );
}

function codeAt(slots: readonly ShapeSlot[], key: string): string | undefined {
  return slots.find((slot) => slot.key === key)?.positionCode;
}

describe("nearestOutfieldPositionCode", () => {
  it("gives every outfield position back at its own canonical spot", () => {
    for (const position of POSITIONS) {
      if (position.line === "GB") continue;
      expect(
        nearestOutfieldPositionCode({ x: position.defaultX, y: position.defaultY }),
      ).toBe(position.code);
    }
  });

  it("never answers GB, even on the goal line", () => {
    expect(nearestOutfieldPositionCode({ x: 500, y: 0 })).not.toBe("GB");
    expect(nearestOutfieldPositionCode({ x: 500, y: 60 })).toBe("DC");
  });

  it("tells the wings apart", () => {
    expect(nearestOutfieldPositionCode({ x: 120, y: 260 })).toBe("DG");
    expect(nearestOutfieldPositionCode({ x: 880, y: 260 })).toBe("DD");
  });
});

describe("moveShapeSlot", () => {
  it("relabels the formation when the coach drags a defender into midfield", () => {
    // The coach's actual gesture: pull the middle centre-back of the 1-3-2-1 up the pitch.
    const before = shapeOf("1-3-2-1");
    expect(shapeLabel(before)).toBe("1-3-2-1");

    const after = moveShapeSlot(before, "slot-3", { x: 500, y: 620 });

    expect(codeAt(after, "slot-3")).toBe("MOC");
    expect(shapeLabel(after)).toBe("1-2-3-1");
    expect(shapeProblemsFr(after)).toEqual([]);
  });

  it("keeps the goalkeeper a goalkeeper wherever he is dragged", () => {
    const after = moveShapeSlot(shapeOf("1-3-2-1"), "slot-1", { x: 500, y: 700 });
    expect(codeAt(after, "slot-1")).toBe("GB");
    expect(shapeLabel(after)).toBe("1-3-2-1");
  });

  it("clamps a drop outside the touchline back onto the pitch", () => {
    const after = moveShapeSlot(shapeOf("1-3-2-1"), "slot-2", { x: -400, y: 1600 });
    const moved = after.find((slot) => slot.key === "slot-2");
    expect(moved).toMatchObject({ x: 0, y: 1000 });
  });

  it("leaves every other slot untouched", () => {
    const before = shapeOf("1-2-3-1");
    const after = moveShapeSlot(before, "slot-5", { x: 420, y: 480 });
    for (const slot of before) {
      if (slot.key === "slot-5") continue;
      expect(after.find((candidate) => candidate.key === slot.key)).toEqual(slot);
    }
  });

  it("ignores a key that is not in the shape", () => {
    const before = shapeOf("1-3-2-1");
    expect(moveShapeSlot(before, "nope", { x: 500, y: 500 })).toEqual(before);
  });
});

describe("orderShape", () => {
  it("reproduces the store order of every built-in formation", () => {
    for (const template of BUILTIN_FORMATIONS) {
      const ordered = orderShape(shapeOf(template.label));
      expect(ordered.map((slot) => slot.key)).toEqual(
        template.slots.map((slot) => `slot-${slot.sort}`),
      );
    }
  });

  it("does not depend on the order it is given", () => {
    const shape = shapeOf("1-3-2-1");
    const shuffled = [...shape].reverse();
    expect(orderShape(shuffled)).toEqual(orderShape(shape));
  });
});

describe("nearestSlot", () => {
  const shape = shapeOf("1-3-2-1");

  it("finds the slot under the finger", () => {
    const striker = shape.find((slot) => slot.positionCode === "AT")!;
    expect(nearestSlot(shape, { x: striker.x + 10, y: striker.y - 10 })?.key).toBe(striker.key);
  });

  it("forgives a thumb that lands a disc-width off target", () => {
    const keeper = shape.find((slot) => slot.positionCode === "GB")!;
    // Roughly 150 units to the side: the finger covered the disc it was aiming at.
    expect(nearestSlot(shape, { x: keeper.x + 150, y: keeper.y })?.key).toBe(keeper.key);
  });

  it("answers null for a drop on empty grass", () => {
    // The centre circle of a 1-3-2-1 is genuinely empty: nobody stands there.
    expect(nearestSlot(shape, { x: 20, y: 980 }, 100)).toBeNull();
  });

  it("never answers for an empty shape", () => {
    expect(nearestSlot([], { x: 500, y: 500 })).toBeNull();
  });
});

describe("shapeProblemsFr", () => {
  it("accepts every built-in formation", () => {
    for (const template of BUILTIN_FORMATIONS) {
      expect(shapeProblemsFr(shapeOf(template.label))).toEqual([]);
    }
  });

  it("refuses two slots a thumb could not tell apart", () => {
    const shape = shapeOf("1-3-2-1");
    // Drag one pivot on top of the other.
    const collided = moveShapeSlot(shape, "slot-5", { x: 660, y: 520 });
    expect(shapeCollisions(collided)).toHaveLength(1);
    expect(shapeProblemsFr(collided).join(" ")).toContain("trop proches");
  });

  it("refuses a shape without a goalkeeper", () => {
    const shape = shapeOf("1-3-2-1").filter((slot) => slot.positionCode !== "GB");
    expect(shapeProblemsFr(shape)).toContain("Il faut un poste de gardien.");
  });

  it("refuses anything other than seven slots", () => {
    const shape = shapeOf("1-3-2-1").slice(0, 6);
    expect(shapeProblemsFr(shape).join(" ")).toContain("7 postes");
  });

  it("is happy with slots exactly MIN_MARKER_DISTANCE apart", () => {
    const shape: ShapeSlot[] = [
      { key: "a", positionCode: "GB", x: 500, y: 60 },
      { key: "b", positionCode: "DG", x: 500 - MIN_MARKER_DISTANCE, y: 400 },
      { key: "c", positionCode: "DD", x: 500, y: 400 },
    ];
    expect(shapeCollisions(shape)).toEqual([]);
  });
});

describe("sameShape", () => {
  it("ignores order and keys", () => {
    const shape = shapeOf("1-3-2-1");
    const renamed = [...shape].reverse().map((slot, index) => ({ ...slot, key: `other-${index}` }));
    expect(sameShape(shape, renamed)).toBe(true);
  });

  it("sees a slot the coach moved", () => {
    const shape = shapeOf("1-3-2-1");
    expect(sameShape(shape, moveShapeSlot(shape, "slot-7", { x: 400, y: 800 }))).toBe(false);
  });
});

describe("mapShapeToSlots", () => {
  const rows = formationByLabel("1-3-2-1")!.slots.map((slot) => ({
    id: `db-${slot.sort}`,
    positionCode: slot.positionCode,
    x: slot.x,
    y: slot.y,
  }));

  it("recognises a shape the team already has and translates the keys", () => {
    const mapping = mapShapeToSlots(shapeOf("1-3-2-1"), rows);
    expect(mapping).not.toBeNull();
    expect(mapping?.get("slot-1")).toBe("db-1");
    expect(mapping?.get("slot-7")).toBe("db-7");
  });

  it("refuses a shape the coach has changed", () => {
    const moved = moveShapeSlot(shapeOf("1-3-2-1"), "slot-3", { x: 500, y: 620 });
    expect(mapShapeToSlots(moved, rows)).toBeNull();
  });

  it("refuses a formation with a different number of slots", () => {
    expect(mapShapeToSlots(shapeOf("1-3-2-1"), rows.slice(0, 6))).toBeNull();
  });
});

describe("customFormationNameFr", () => {
  it("names a hand-drawn formation after its label", () => {
    expect(customFormationNameFr("1-2-3-1")).toBe("Perso 1-2-3-1");
  });
});

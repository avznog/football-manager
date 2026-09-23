import { describe, expect, it } from "vitest";

import { formationByLabel } from "@/db/reference";
import { shapeFromRows, type ShapeSlot } from "@/lib/formation/shape";

import {
  assignmentsSignature,
  benchOf,
  clearSlot,
  emptySlotCount,
  isOnPitch,
  memberInSlot,
  placeInSlot,
  remapToShape,
  removeMember,
  restrictToMembers,
  restrictToSlots,
  slotOfMember,
  sortAssignments,
  type SlotAssignment,
} from "./editor";

function shapeOf(label: string): ShapeSlot[] {
  const template = formationByLabel(label);
  if (!template) throw new Error(`unknown formation ${label}`);
  return shapeFromRows(
    template.slots.map((slot) => ({
      id: `${label}/${slot.sort}`,
      positionCode: slot.positionCode,
      x: slot.x,
      y: slot.y,
    })),
  );
}

const SHAPE = shapeOf("1-3-2-1");
const [GK, LB, CB, RB, PIVOT_LEFT, PIVOT_RIGHT, STRIKER] = SHAPE;

/** The seven starters of the demo season, near enough. */
const TEAM: SlotAssignment[] = [
  { slotId: GK.key, memberId: "hugo" },
  { slotId: LB.key, memberId: "samir" },
  { slotId: CB.key, memberId: "thomas" },
  { slotId: RB.key, memberId: "nico" },
  { slotId: PIVOT_LEFT.key, memberId: "leo" },
  { slotId: PIVOT_RIGHT.key, memberId: "karim" },
  { slotId: STRIKER.key, memberId: "julien" },
];

/** Nobody may hold two slots, and no slot two players. */
function expectConsistent(assignments: readonly SlotAssignment[]): void {
  expect(new Set(assignments.map((a) => a.slotId)).size).toBe(assignments.length);
  expect(new Set(assignments.map((a) => a.memberId)).size).toBe(assignments.length);
}

describe("placeInSlot", () => {
  it("brings a bench player onto a free slot", () => {
    const short = clearSlot(TEAM, STRIKER.key);
    const after = placeInSlot(short, STRIKER.key, "momo");

    expect(memberInSlot(after, STRIKER.key)).toBe("momo");
    expect(after).toHaveLength(7);
    expectConsistent(after);
  });

  it("swaps two players when one is dropped on the other", () => {
    // The coach drags the left pivot onto the striker: Léo goes up front, Julien drops in.
    const after = placeInSlot(TEAM, STRIKER.key, "leo");

    expect(memberInSlot(after, STRIKER.key)).toBe("leo");
    expect(memberInSlot(after, PIVOT_LEFT.key)).toBe("julien");
    expect(after).toHaveLength(7);
    expectConsistent(after);
  });

  it("sends the occupant back to the bench when the newcomer came from the bench", () => {
    const after = placeInSlot(TEAM, STRIKER.key, "momo");

    expect(memberInSlot(after, STRIKER.key)).toBe("momo");
    expect(isOnPitch(after, "julien")).toBe(false);
    expect(after).toHaveLength(7);
    expectConsistent(after);
  });

  it("leaves the old slot empty when a player moves onto a free one", () => {
    const short = clearSlot(TEAM, STRIKER.key);
    const after = placeInSlot(short, STRIKER.key, "karim");

    expect(memberInSlot(after, STRIKER.key)).toBe("karim");
    expect(memberInSlot(after, PIVOT_RIGHT.key)).toBeNull();
    expect(after).toHaveLength(6);
    expectConsistent(after);
  });

  it("does nothing when a player is dropped back where he already was", () => {
    expect(placeInSlot(TEAM, STRIKER.key, "julien")).toEqual(TEAM);
  });

  it("stays consistent through a chain of swaps", () => {
    // A rotation the long way round: three drops that shuffle the same three players.
    let state: readonly SlotAssignment[] = TEAM;
    state = placeInSlot(state, PIVOT_RIGHT.key, "leo");
    state = placeInSlot(state, STRIKER.key, "karim");
    state = placeInSlot(state, PIVOT_LEFT.key, "julien");

    expect(state).toHaveLength(7);
    expectConsistent(state);
    expect(memberInSlot(state, PIVOT_RIGHT.key)).toBe("leo");
    expect(memberInSlot(state, STRIKER.key)).toBe("karim");
    expect(memberInSlot(state, PIVOT_LEFT.key)).toBe("julien");
  });

  it("keeps the slot order stable so a re-render does not reshuffle the pitch", () => {
    const after = placeInSlot(TEAM, PIVOT_LEFT.key, "karim");
    expect(after.map((assignment) => assignment.slotId)).toEqual(
      TEAM.map((assignment) => assignment.slotId),
    );
  });
});

describe("clearSlot and removeMember", () => {
  it("frees one slot and nothing else", () => {
    const after = clearSlot(TEAM, CB.key);
    expect(memberInSlot(after, CB.key)).toBeNull();
    expect(after).toHaveLength(6);
  });

  it("takes a player off wherever he stands", () => {
    expect(slotOfMember(removeMember(TEAM, "karim"), "karim")).toBeNull();
  });

  it("ignores a player who is not on the pitch", () => {
    expect(removeMember(TEAM, "momo")).toEqual(TEAM);
  });
});

describe("restrictToSlots / restrictToMembers", () => {
  it("drops the pairs whose slot has disappeared", () => {
    const kept = restrictToSlots(TEAM, [GK.key, CB.key]);
    expect(kept.map((assignment) => assignment.memberId)).toEqual(["hugo", "thomas"]);
  });

  it("drops a player who is no longer on the match sheet", () => {
    const sheet = TEAM.map((assignment) => assignment.memberId).filter((id) => id !== "leo");
    expect(isOnPitch(restrictToMembers(TEAM, sheet), "leo")).toBe(false);
  });
});

describe("remapToShape", () => {
  it("carries the team over when the coach changes formation", () => {
    const target = shapeOf("1-2-3-1");
    const after = remapToShape(TEAM, SHAPE, target);

    expect(after).toHaveLength(7);
    expectConsistent(after);
    // The keeper stays in goal: both shapes list the goalkeeper first.
    const keeperSlot = target.find((slot) => slot.positionCode === "GB");
    expect(memberInSlot(after, keeperSlot?.key ?? "")).toBe("hugo");
    // And the striker stays up front: it is the last slot of both shapes.
    const strikerSlot = target[target.length - 1];
    expect(memberInSlot(after, strikerSlot.key)).toBe("julien");
  });

  it("benches the players the new shape has no room for", () => {
    const target = shapeOf("1-2-3-1").slice(0, 5);
    const after = remapToShape(TEAM, SHAPE, target);
    expect(after).toHaveLength(5);
    expectConsistent(after);
  });

  it("keeps an incomplete composition incomplete", () => {
    const short = clearSlot(TEAM, STRIKER.key);
    const after = remapToShape(short, SHAPE, shapeOf("1-2-3-1"));
    expect(after).toHaveLength(6);
  });
});

describe("derived views", () => {
  it("lists the bench in the order it was given", () => {
    const squad = [
      { membershipId: "hugo" },
      { membershipId: "momo" },
      { membershipId: "yanis" },
      { membershipId: "karim" },
    ];
    expect(benchOf(squad, TEAM).map((member) => member.membershipId)).toEqual(["momo", "yanis"]);
  });

  it("counts the slots still to fill", () => {
    expect(emptySlotCount(TEAM, SHAPE)).toBe(0);
    expect(emptySlotCount(clearSlot(TEAM, CB.key), SHAPE)).toBe(1);
  });

  it("sorts assignments into store order", () => {
    const shuffled = [...TEAM].reverse();
    expect(sortAssignments(shuffled, SHAPE).map((assignment) => assignment.memberId)).toEqual([
      "hugo",
      "samir",
      "thomas",
      "nico",
      "leo",
      "karim",
      "julien",
    ]);
  });

  it("signs a composition independently of the order of the gestures", () => {
    expect(assignmentsSignature([...TEAM].reverse())).toBe(assignmentsSignature(TEAM));
    expect(assignmentsSignature(clearSlot(TEAM, CB.key))).not.toBe(assignmentsSignature(TEAM));
  });
});

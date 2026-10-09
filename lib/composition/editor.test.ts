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

const SHAPE = shapeOf("1-2-3-1");
const [GK, CB_LEFT, CB_RIGHT, WING_LEFT, PIVOT, WING_RIGHT, STRIKER] = SHAPE;

/** The seven starters of the demo season, near enough. */
const TEAM: SlotAssignment[] = [
  { slotId: GK.key, memberId: "hugo" },
  { slotId: CB_LEFT.key, memberId: "samir" },
  { slotId: CB_RIGHT.key, memberId: "thomas" },
  { slotId: WING_LEFT.key, memberId: "nico" },
  { slotId: PIVOT.key, memberId: "leo" },
  { slotId: WING_RIGHT.key, memberId: "karim" },
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
    expect(memberInSlot(after, PIVOT.key)).toBe("julien");
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
    expect(memberInSlot(after, WING_RIGHT.key)).toBeNull();
    expect(after).toHaveLength(6);
    expectConsistent(after);
  });

  it("does nothing when a player is dropped back where he already was", () => {
    expect(placeInSlot(TEAM, STRIKER.key, "julien")).toEqual(TEAM);
  });

  it("stays consistent through a chain of swaps", () => {
    // A rotation the long way round: three drops that shuffle the same three players.
    let state: readonly SlotAssignment[] = TEAM;
    state = placeInSlot(state, WING_RIGHT.key, "leo");
    state = placeInSlot(state, STRIKER.key, "karim");
    state = placeInSlot(state, PIVOT.key, "julien");

    expect(state).toHaveLength(7);
    expectConsistent(state);
    expect(memberInSlot(state, WING_RIGHT.key)).toBe("leo");
    expect(memberInSlot(state, STRIKER.key)).toBe("karim");
    expect(memberInSlot(state, PIVOT.key)).toBe("julien");
  });

  it("keeps the slot order stable so a re-render does not reshuffle the pitch", () => {
    const after = placeInSlot(TEAM, PIVOT.key, "karim");
    expect(after.map((assignment) => assignment.slotId)).toEqual(
      TEAM.map((assignment) => assignment.slotId),
    );
  });
});

describe("clearSlot and removeMember", () => {
  it("frees one slot and nothing else", () => {
    const after = clearSlot(TEAM, CB_RIGHT.key);
    expect(memberInSlot(after, CB_RIGHT.key)).toBeNull();
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
    const kept = restrictToSlots(TEAM, [GK.key, CB_RIGHT.key]);
    expect(kept.map((assignment) => assignment.memberId)).toEqual(["hugo", "thomas"]);
  });

  it("drops a player who is no longer on the match sheet", () => {
    const sheet = TEAM.map((assignment) => assignment.memberId).filter((id) => id !== "leo");
    expect(isOnPitch(restrictToMembers(TEAM, sheet), "leo")).toBe(false);
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
    expect(emptySlotCount(clearSlot(TEAM, CB_RIGHT.key), SHAPE)).toBe(1);
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
    expect(assignmentsSignature(clearSlot(TEAM, CB_RIGHT.key))).not.toBe(assignmentsSignature(TEAM));
  });
});

import { describe, expect, it } from "vitest";

import {
  type LineupStep,
  type SlotAssignment,
  type SlotInfo,
  applyLineupSteps,
  describeLineupDiffFr,
  describePositionChangeFr,
  describeSubstitutionFr,
  diffLineups,
  hasSlotConflict,
  summariseLineupDiffFr,
} from "./lineup";

/** The 1-3-2-1 of the seeded team, with the slot ids used throughout these fixtures. */
const SLOTS: SlotInfo[] = [
  { id: "s-gb", positionCode: "GB", sort: 1 },
  { id: "s-dg", positionCode: "DG", sort: 2 },
  { id: "s-dc", positionCode: "DC", sort: 3 },
  { id: "s-dd", positionCode: "DD", sort: 4 },
  { id: "s-mc1", positionCode: "MC", sort: 5 },
  { id: "s-mc2", positionCode: "MC", sort: 6 },
  { id: "s-at", positionCode: "AT", sort: 7 },
];

const options = { slots: SLOTS };

const team = (pairs: Record<string, string>): SlotAssignment[] =>
  Object.entries(pairs).map(([slotId, memberId]) => ({ slotId, memberId }));

const STARTERS = team({
  "s-gb": "hugo",
  "s-dg": "samir",
  "s-dc": "thomas",
  "s-dd": "nico",
  "s-mc1": "leo",
  "s-mc2": "karim",
  "s-at": "julien",
});

const names: Record<string, string> = {
  hugo: "Hugo",
  samir: "Samir",
  thomas: "Thomas",
  nico: "Nico",
  leo: "Léo",
  karim: "Karim",
  julien: "Julien",
  yanis: "Yanis",
  momo: "Momo",
};
const nameOf = (memberId: string) => names[memberId] ?? memberId;

/**
 * The only honest proof that `steps` is applicable: replay them one at a time, check that no slot is
 * ever held by two players on the way, and check the end state is exactly the target.
 */
function expectStepsAreApplicable(
  from: readonly SlotAssignment[],
  to: readonly SlotAssignment[],
  steps: readonly LineupStep[],
): void {
  const conflicts: LineupStep[] = [];
  const result = applyLineupSteps(from, steps, (assignments, step) => {
    if (hasSlotConflict(assignments)) conflicts.push(step);
  });
  expect(conflicts).toEqual([]);
  expect([...result].sort(bySlot)).toEqual([...to].sort(bySlot));
}

const bySlot = (a: SlotAssignment, b: SlotAssignment) => (a.slotId < b.slotId ? -1 : 1);

describe("nothing to do", () => {
  it("reports an empty diff for two identical compositions", () => {
    const diff = diffLineups(STARTERS, STARTERS, options);
    expect(diff.isEmpty).toBe(true);
    expect(diff.substitutions).toEqual([]);
    expect(diff.positionChanges).toEqual([]);
    expect(diff.steps).toEqual([]);
    expect(diff.unchanged).toHaveLength(7);
    expect(summariseLineupDiffFr(diff, nameOf)).toBe("Aucun changement");
  });

  it("is insensitive to the order the assignments arrive in", () => {
    const shuffled = [...STARTERS].reverse();
    expect(diffLineups(shuffled, STARTERS, options).isEmpty).toBe(true);
  });
});

describe("a plain substitution", () => {
  const to = team({
    "s-gb": "hugo",
    "s-dg": "samir",
    "s-dc": "thomas",
    "s-dd": "nico",
    "s-mc1": "yanis",
    "s-mc2": "karim",
    "s-at": "julien",
  });

  it("is one substitution and nothing else", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.substitutions).toEqual([
      { outId: "leo", inId: "yanis", slotId: "s-mc1", positionCode: "MC" },
    ]);
    expect(diff.positionChanges).toEqual([]);
    expect(diff.comingOn).toEqual(["yanis"]);
    expect(diff.goingOff).toEqual(["leo"]);
    expect(diff.unchanged).toHaveLength(6);
  });

  it("splits into the two halves, the departure first", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.steps).toEqual([
      { kind: "out", memberId: "leo", slotId: "s-mc1" },
      { kind: "in", memberId: "yanis", slotId: "s-mc1" },
    ]);
    expectStepsAreApplicable(STARTERS, to, diff.steps);
  });

  it("reads as « Léo → Yanis »", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(describeSubstitutionFr(diff.substitutions[0], nameOf)).toBe("Léo → Yanis");
    expect(summariseLineupDiffFr(diff, nameOf)).toBe("Léo → Yanis");
  });
});

describe("a position change with nobody entering or leaving", () => {
  // Karim and Julien swap: a midfielder goes up front, the striker drops into midfield.
  const to = team({
    "s-gb": "hugo",
    "s-dg": "samir",
    "s-dc": "thomas",
    "s-dd": "nico",
    "s-mc1": "leo",
    "s-mc2": "julien",
    "s-at": "karim",
  });

  it("is two position changes and no substitution", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.substitutions).toEqual([]);
    expect(diff.comingOn).toEqual([]);
    expect(diff.goingOff).toEqual([]);
    expect(diff.positionChanges.map((change) => change.memberId)).toEqual(["julien", "karim"]);
    expect(diff.positionChanges[1]).toMatchObject({
      memberId: "karim",
      fromPositionCode: "MC",
      toPositionCode: "AT",
    });
  });

  it("emits an exchange as a single rotation, because it cannot be done in two independent moves", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.steps).toHaveLength(1);
    expect(diff.steps[0]).toMatchObject({ kind: "rotation" });
    expectStepsAreApplicable(STARTERS, to, diff.steps);
  });

  it("reads as « Karim passe MC → AT », long form on demand", () => {
    const diff = diffLineups(STARTERS, to, options);
    const karim = diff.positionChanges.find((change) => change.memberId === "karim")!;
    expect(describePositionChangeFr(karim, nameOf)).toBe("Karim passe MC → AT");
    expect(describePositionChangeFr(karim, nameOf, { long: true })).toBe(
      "Karim passe Milieu central → Attaquant",
    );
  });

  it("falls back to « change de poste » when the slot catalogue is unknown", () => {
    const diff = diffLineups(STARTERS, to);
    const karim = diff.positionChanges.find((change) => change.memberId === "karim")!;
    expect(describePositionChangeFr(karim, nameOf)).toBe("Karim change de poste");
  });
});

describe("the chained case from the owner's notes", () => {
  /*
   * « l'attaquant passe milieu, le remplaçant passe attaquant, le milieu passe goal et le goal
   * sort ». Four sentences describing one substitution and two continuing players changing role —
   * crediting four substitutions here would destroy four players' minutes.
   */
  const to = team({
    "s-gb": "leo", // the midfielder goes in goal
    "s-dg": "samir",
    "s-dc": "thomas",
    "s-dd": "nico",
    "s-mc1": "julien", // the striker drops into midfield
    "s-mc2": "karim",
    "s-at": "momo", // the substitute comes on up front
  });
  const diff = diffLineups(STARTERS, to, options);

  it("counts one substitution, not four", () => {
    expect(diff.substitutions).toHaveLength(1);
    expect(diff.goingOff).toEqual(["hugo"]);
    expect(diff.comingOn).toEqual(["momo"]);
  });

  it("pairs the arrival with the only departure, even though they play nowhere near each other", () => {
    // Momo walks into the striker's slot; the man who actually left is the goalkeeper.
    expect(diff.substitutions[0]).toEqual({
      outId: "hugo",
      inId: "momo",
      slotId: "s-at",
      positionCode: "AT",
    });
  });

  it("counts the continuing players as position changes", () => {
    expect(diff.positionChanges).toHaveLength(2);
    expect(diff.positionChanges.map((change) => change.memberId)).toEqual(["leo", "julien"]);
    expect(diff.positionChanges[0]).toMatchObject({ toPositionCode: "GB" });
  });

  it("orders the steps so nobody is ever in two places at once", () => {
    expect(diff.steps).toEqual([
      { kind: "out", memberId: "hugo", slotId: "s-gb" },
      { kind: "move", memberId: "leo", fromSlotId: "s-mc1", toSlotId: "s-gb" },
      { kind: "move", memberId: "julien", fromSlotId: "s-at", toSlotId: "s-mc1" },
      { kind: "in", memberId: "momo", slotId: "s-at" },
    ]);
    expectStepsAreApplicable(STARTERS, to, diff.steps);
  });

  it("is described in the order a coach would carry it out", () => {
    expect(describeLineupDiffFr(diff, nameOf)).toEqual([
      "Hugo → Momo",
      "Léo passe MC → GB",
      "Julien passe AT → MC",
    ]);
  });
});

describe("a three-way rotation", () => {
  const to = team({
    "s-gb": "hugo",
    "s-dg": "samir",
    "s-dc": "thomas",
    "s-dd": "nico",
    "s-mc1": "julien",
    "s-mc2": "leo",
    "s-at": "karim",
  });

  it("is applicable in one go rather than in three impossible moves", () => {
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.positionChanges).toHaveLength(3);
    expect(diff.steps).toHaveLength(1);
    expect(diff.steps[0]).toMatchObject({ kind: "rotation" });
    expectStepsAreApplicable(STARTERS, to, diff.steps);
  });
});

describe("unbalanced compositions", () => {
  it("walks a player on with nobody going off, and says the size changed", () => {
    const short = STARTERS.filter((assignment) => assignment.memberId !== "julien");
    const diff = diffLineups(short, STARTERS, options);
    expect(diff.substitutions).toEqual([]);
    expect(diff.comingOn).toEqual(["julien"]);
    expect(diff.steps).toEqual([{ kind: "in", memberId: "julien", slotId: "s-at" }]);
    expect(diff.warnings.map((warning) => warning.code)).toContain("size-changed");
    expectStepsAreApplicable(short, STARTERS, diff.steps);
  });

  it("takes a player off with nobody coming on", () => {
    const short = STARTERS.filter((assignment) => assignment.memberId !== "julien");
    const diff = diffLineups(STARTERS, short, options);
    expect(diff.goingOff).toEqual(["julien"]);
    expect(diff.steps).toEqual([{ kind: "out", memberId: "julien", slotId: "s-at" }]);
    expectStepsAreApplicable(STARTERS, short, diff.steps);
  });

  it("handles a double substitution", () => {
    const to = team({
      "s-gb": "hugo",
      "s-dg": "samir",
      "s-dc": "thomas",
      "s-dd": "nico",
      "s-mc1": "yanis",
      "s-mc2": "karim",
      "s-at": "momo",
    });
    const diff = diffLineups(STARTERS, to, options);
    expect(diff.substitutions).toEqual([
      { outId: "leo", inId: "yanis", slotId: "s-mc1", positionCode: "MC" },
      { outId: "julien", inId: "momo", slotId: "s-at", positionCode: "AT" },
    ]);
    expect(diff.steps.filter((step) => step.kind === "out")).toHaveLength(2);
    expectStepsAreApplicable(STARTERS, to, diff.steps);
  });
});

describe("compositions that cannot be true", () => {
  it("drops a player who appears twice and says so", () => {
    const broken = [...STARTERS, { slotId: "s-mc2", memberId: "hugo" }];
    const diff = diffLineups(STARTERS, broken, options);
    expect(diff.warnings.map((warning) => warning.code)).toContain("duplicate-member");
    // The first assignment wins, so nothing moves.
    expect(diff.isEmpty).toBe(true);
  });

  it("drops a second player in one slot and says so", () => {
    const broken = [...STARTERS.slice(0, 6), { slotId: "s-gb", memberId: "momo" }];
    const diff = diffLineups(STARTERS, broken, options);
    expect(diff.warnings.map((warning) => warning.code)).toContain("duplicate-slot");
  });

  it("flags a slot that belongs to no known formation", () => {
    const broken = [...STARTERS.slice(0, 6), { slotId: "s-unknown", memberId: "momo" }];
    const diff = diffLineups(STARTERS, broken, options);
    expect(diff.warnings.map((warning) => warning.code)).toContain("unknown-slot");
  });

  it("flags a target composition with nobody in goal", () => {
    const outfieldOnly = STARTERS.filter((assignment) => assignment.slotId !== "s-gb");
    const diff = diffLineups(STARTERS, outfieldOnly, options);
    expect(diff.warnings.map((warning) => warning.code)).toContain("no-goalkeeper");
  });

  it("says nothing about slots when no catalogue was supplied", () => {
    const diff = diffLineups(STARTERS, STARTERS);
    expect(diff.warnings).toEqual([]);
  });
});

describe("determinism", () => {
  it("gives the same answer whatever order the inputs are in", () => {
    const to = team({
      "s-gb": "leo",
      "s-dg": "samir",
      "s-dc": "thomas",
      "s-dd": "nico",
      "s-mc1": "julien",
      "s-mc2": "karim",
      "s-at": "momo",
    });
    const straight = diffLineups(STARTERS, to, options);
    const shuffled = diffLineups([...STARTERS].reverse(), [...to].reverse(), options);
    expect(shuffled).toEqual(straight);
  });
});

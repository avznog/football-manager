import { describe, expect, it } from "vitest";

import { formationByLabel } from "@/db/reference";
import type { SlotAssignment } from "@/lib/match/lineup";

import {
  blockingIssues,
  countSquadRoles,
  deduceChanges,
  findPlanIssues,
  minuteIsTaken,
  nameOfMembers,
  ordinalFr,
  planInForceBefore,
  planTitleFr,
  sortPlans,
  squadRoleLabelFr,
  squadSummaryFr,
  suggestNextMinute,
  type PlanMember,
  type PlanSlot,
  type PlannedLineup,
} from "./plan";

/** The slots of a built-in formation, keyed like `formation_slots` rows would be. */
function slotsOf(label: string): PlanSlot[] {
  const template = formationByLabel(label);
  if (!template) throw new Error(`unknown formation ${label}`);
  return template.slots.map((slot) => ({
    id: `${label}/${slot.sort}`,
    positionCode: slot.positionCode,
    sort: slot.sort,
  }));
}

const SLOTS = slotsOf("1-3-2-1");
const [GK, LB, CB, RB, PIVOT_LEFT, PIVOT_RIGHT, STRIKER] = SLOTS;

const STARTERS: SlotAssignment[] = [
  { slotId: GK.id, memberId: "hugo" },
  { slotId: LB.id, memberId: "samir" },
  { slotId: CB.id, memberId: "thomas" },
  { slotId: RB.id, memberId: "nico" },
  { slotId: PIVOT_LEFT.id, memberId: "leo" },
  { slotId: PIVOT_RIGHT.id, memberId: "karim" },
  { slotId: STRIKER.id, memberId: "ali" },
];

const NAMES: Record<string, string> = {
  hugo: "Hugo",
  samir: "Samir",
  thomas: "Thomas",
  nico: "Nico",
  leo: "Léo",
  karim: "Karim",
  ali: "Ali",
  momo: "Momo",
  yanis: "Yanis",
  brice: "Brice",
};

const nameOf = (memberId: string) => NAMES[memberId] ?? memberId;

function team(assignments: readonly SlotAssignment[], slots: readonly PlanSlot[] = SLOTS) {
  return { assignments, slots };
}

function plan(overrides: Partial<PlannedLineup> & { id: string; fromMinute: number }): PlannedLineup {
  return {
    isInitial: overrides.fromMinute === 0,
    formationId: "f1",
    formationLabel: "1-3-2-1",
    isApplied: false,
    assignments: STARTERS,
    slots: SLOTS,
    ...overrides,
  };
}

describe("deduceChanges", () => {
  it("reads a straight substitution as « Léo → Yanis »", () => {
    const target = STARTERS.map((assignment) =>
      assignment.memberId === "leo" ? { ...assignment, memberId: "yanis" } : assignment,
    );

    const changes = deduceChanges(team(STARTERS), team(target), nameOf);

    expect(changes.lines).toEqual(["Léo → Yanis"]);
    expect(changes.summary).toBe("Léo → Yanis");
    expect(changes.isEmpty).toBe(false);
  });

  it("reads a chained change the way the coach would carry it out", () => {
    // Karim leaves midfield to play up front, and Momo comes on in his place — so the player who
    // actually walks off is Ali.
    const target: SlotAssignment[] = [
      { slotId: GK.id, memberId: "hugo" },
      { slotId: LB.id, memberId: "samir" },
      { slotId: CB.id, memberId: "thomas" },
      { slotId: RB.id, memberId: "nico" },
      { slotId: PIVOT_LEFT.id, memberId: "leo" },
      { slotId: PIVOT_RIGHT.id, memberId: "momo" },
      { slotId: STRIKER.id, memberId: "karim" },
    ];

    const changes = deduceChanges(team(STARTERS), team(target), nameOf);

    expect(changes.lines).toEqual(["Ali → Momo", "Karim passe MC → AT"]);
  });

  it("spells the positions out in full when asked", () => {
    const target = STARTERS.map((assignment) =>
      assignment.slotId === STRIKER.id ? { ...assignment, memberId: "karim" } : assignment,
    ).filter((assignment) => assignment.slotId !== PIVOT_RIGHT.id);

    const changes = deduceChanges(team(STARTERS), team(target), nameOf, { long: true });

    expect(changes.lines).toContain("Karim passe Milieu central → Attaquant");
  });

  it("says nothing when two players simply swap sides of the same double pivot", () => {
    // Both slots are `MC`: there is nothing for the coach to do on the touchline.
    const target = STARTERS.map((assignment) => {
      if (assignment.slotId === PIVOT_LEFT.id) return { ...assignment, memberId: "karim" };
      if (assignment.slotId === PIVOT_RIGHT.id) return { ...assignment, memberId: "leo" };
      return assignment;
    });

    const changes = deduceChanges(team(STARTERS), team(target), nameOf);

    expect(changes.lines).toEqual([]);
    expect(changes.summary).toBe("Aucun changement");
  });

  it("only reports the players a change of formation actually moves", () => {
    const targetSlots = slotsOf("1-3-1-2");
    const [gk2, lb2, cb2, rb2, pivot2, striker2Left, striker2Right] = targetSlots;
    const target: SlotAssignment[] = [
      { slotId: gk2.id, memberId: "hugo" },
      { slotId: lb2.id, memberId: "samir" },
      { slotId: cb2.id, memberId: "thomas" },
      { slotId: rb2.id, memberId: "nico" },
      { slotId: pivot2.id, memberId: "leo" },
      { slotId: striker2Left.id, memberId: "ali" },
      { slotId: striker2Right.id, memberId: "karim" },
    ];

    const changes = deduceChanges(
      team(STARTERS),
      team(target, targetSlots),
      nameOf,
    );

    // The back four keep their codes even though every slot id changed; only Karim moves line.
    expect(changes.lines).toEqual(["Karim passe MC → AT"]);
  });

  it("has nothing to deduce for the starting composition", () => {
    const changes = deduceChanges(null, team(STARTERS), nameOf);
    expect(changes.hasPrevious).toBe(false);
    expect(changes.summary).toBe("Aucun changement");
  });
});

describe("planInForceBefore", () => {
  const lineups = [plan({ id: "start", fromMinute: 0 }), plan({ id: "quarter", fromMinute: 15 })];

  it("finds the composition a planned change starts from", () => {
    expect(planInForceBefore(lineups, 30)?.id).toBe("quarter");
    expect(planInForceBefore(lineups, 15)?.id).toBe("start");
  });

  it("has nothing before the kick-off", () => {
    expect(planInForceBefore(lineups, 0)).toBeNull();
  });

  it("does not compare a composition with itself", () => {
    expect(planInForceBefore(lineups, 15, "quarter")?.id).toBe("start");
  });
});

describe("minute bookkeeping", () => {
  const lineups = [plan({ id: "start", fromMinute: 0 }), plan({ id: "half", fromMinute: 30 })];

  it("knows a minute is already taken", () => {
    expect(minuteIsTaken(lineups, 30)).toBe(true);
    expect(minuteIsTaken(lineups, 30, "half")).toBe(false);
    expect(minuteIsTaken(lineups, 31)).toBe(false);
  });

  it("proposes half time first, then the next free minute", () => {
    expect(suggestNextMinute([plan({ id: "start", fromMinute: 0 })], 60)).toBe(30);
    expect(suggestNextMinute(lineups, 60)).toBe(1);
  });

  it("sorts the starting composition first", () => {
    const shuffled = [plan({ id: "half", fromMinute: 30 }), plan({ id: "start", fromMinute: 0 })];
    expect(sortPlans(shuffled).map((lineup) => lineup.id)).toEqual(["start", "half"]);
  });

  it("titles a composition in French", () => {
    expect(planTitleFr({ fromMinute: 0, isInitial: true })).toBe("Composition de départ");
    expect(planTitleFr({ fromMinute: 30, isInitial: false })).toBe("À partir de la 30ᵉ minute");
    expect(ordinalFr(1)).toBe("1re");
  });
});

describe("findPlanIssues", () => {
  const members: PlanMember[] = [
    { membershipId: "hugo", name: "Hugo", squadRole: "starter", isInjured: false },
    { membershipId: "samir", name: "Samir", squadRole: "starter", isInjured: false },
    { membershipId: "thomas", name: "Thomas", squadRole: "starter", isInjured: false },
    { membershipId: "nico", name: "Nico", squadRole: "starter", isInjured: false },
    { membershipId: "leo", name: "Léo", squadRole: "starter", isInjured: false },
    { membershipId: "karim", name: "Karim", squadRole: "starter", isInjured: false },
    { membershipId: "ali", name: "Ali", squadRole: "starter", isInjured: false },
    { membershipId: "momo", name: "Momo", squadRole: null, isInjured: false },
    { membershipId: "yanis", name: "Yanis", squadRole: "substitute", isInjured: true },
    { membershipId: "brice", name: "Brice", squadRole: "supporter", isInjured: false },
  ];

  it("is silent about a full, legal composition", () => {
    expect(findPlanIssues({ assignments: STARTERS, slots: SLOTS, members })).toEqual([]);
  });

  it("flags a plan that puts on a player who has left the match sheet", () => {
    const assignments = STARTERS.map((assignment) =>
      assignment.memberId === "ali" ? { ...assignment, memberId: "momo" } : assignment,
    );

    const issues = findPlanIssues({ assignments, slots: SLOTS, members });

    expect(issues).toEqual([
      {
        code: "off-sheet",
        memberId: "momo",
        messageFr: "Momo n’est plus sur la feuille de match.",
        blocking: false,
      },
    ]);
    // Worth saying, not worth refusing: the coach may be about to fix the sheet.
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("flags a supporter and an injured player without blocking the save", () => {
    const assignments = STARTERS.map((assignment) => {
      if (assignment.memberId === "ali") return { ...assignment, memberId: "brice" };
      if (assignment.memberId === "leo") return { ...assignment, memberId: "yanis" };
      return assignment;
    });

    const issues = findPlanIssues({ assignments, slots: SLOTS, members });

    expect(issues.map((issue) => issue.code).sort()).toEqual(["injured", "supporter"]);
    expect(issues.map((issue) => issue.messageFr)).toContain("Yanis est blessé.");
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("flags a player who is no longer in the squad at all", () => {
    const assignments = STARTERS.map((assignment) =>
      assignment.memberId === "ali" ? { ...assignment, memberId: "parti" } : assignment,
    );

    const issues = findPlanIssues({ assignments, slots: SLOTS, members });

    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "unknown-member", memberId: "parti" });
  });

  it("refuses an incomplete composition", () => {
    const assignments = STARTERS.filter((assignment) => assignment.slotId !== STRIKER.id);
    const issues = findPlanIssues({ assignments, slots: SLOTS, members });

    expect(issues).toEqual([
      {
        code: "incomplete",
        memberId: null,
        messageFr: "Il reste un poste à pourvoir.",
        blocking: true,
      },
    ]);
    expect(blockingIssues(issues)).toHaveLength(1);
  });

  it("counts the empty slots in the plural", () => {
    const assignments = STARTERS.slice(0, 4);
    const issues = findPlanIssues({ assignments, slots: SLOTS, members });
    expect(issues[0].messageFr).toBe("Il reste 3 postes à pourvoir.");
  });

  it("refuses a composition with nobody in goal", () => {
    const assignments = STARTERS.filter((assignment) => assignment.slotId !== GK.id);
    const issues = findPlanIssues({ assignments, slots: SLOTS, members });

    expect(issues.map((issue) => issue.code)).toContain("no-goalkeeper");
    expect(blockingIssues(issues).length).toBeGreaterThan(0);
  });
});

describe("nameOfMembers", () => {
  it("names a player who has left without crashing the diff", () => {
    const lookup = nameOfMembers([
      { membershipId: "hugo", name: "Hugo", squadRole: "starter", isInjured: false },
    ]);
    expect(lookup("hugo")).toBe("Hugo");
    expect(lookup("parti")).toBe("Joueur inconnu");
  });
});

describe("the match sheet in words", () => {
  const sheet = [
    { squadRole: "starter" as const },
    { squadRole: "starter" as const },
    { squadRole: "substitute" as const },
    { squadRole: "supporter" as const },
    { squadRole: null },
  ];

  it("counts each role, including who was not retained", () => {
    expect(countSquadRoles(sheet)).toEqual({
      starters: 2,
      substitutes: 1,
      supporters: 1,
      unselected: 1,
    });
  });

  it("summarises the sheet the way a coach reads it", () => {
    expect(squadSummaryFr(countSquadRoles(sheet))).toBe(
      "2 titulaires · 1 remplaçant · 1 supporter",
    );
  });

  it("leaves out the roles nobody has", () => {
    expect(squadSummaryFr({ starters: 1, substitutes: 0, supporters: 0, unselected: 9 })).toBe(
      "1 titulaire",
    );
  });

  it("says so when nothing has been decided", () => {
    expect(squadSummaryFr(countSquadRoles([{ squadRole: null }]))).toBe("Feuille de match vide");
  });

  it("names every role, and the absence of one", () => {
    expect(squadRoleLabelFr("starter")).toBe("Titulaire");
    expect(squadRoleLabelFr("substitute")).toBe("Remplaçant");
    expect(squadRoleLabelFr("supporter")).toBe("Supporter");
    expect(squadRoleLabelFr(null)).toBe("Non retenu");
  });
});

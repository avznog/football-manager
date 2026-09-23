import { describe, expect, it } from "vitest";

import { formationByLabel } from "@/db/reference";
import type { SlotAssignment } from "@/lib/match/lineup";

import {
  lineupsFrozenFr,
  appliedNoticeFr,
  blockingIssues,
  compositionsScreenFr,
  countSquadRoles,
  deduceChanges,
  draftChangesPendingFr,
  findPlanIssues,
  minuteIsTaken,
  nameOfMembers,
  ordinalFr,
  planInForceBefore,
  planTitleFr,
  sortPlans,
  sheetNextStepFr,
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
    // Seven players, not six: an empty slot makes the target a draft and stops the deduction.
    const target = STARTERS.map((assignment) => {
      if (assignment.slotId === STRIKER.id) return { ...assignment, memberId: "karim" };
      if (assignment.slotId === PIVOT_RIGHT.id) return { ...assignment, memberId: "yanis" };
      return assignment;
    });

    const changes = deduceChanges(team(STARTERS), team(target), nameOf, { long: true });

    expect(changes.lines).toContain("Karim passe Milieu central → Attaquant");
  });

  it("deduces nothing at all from a pitch nobody has been placed on", () => {
    // « Nouvelle composition » opens like this. Seven « X sort » lines were printed here.
    const changes = deduceChanges(team(STARTERS), team([]), nameOf);

    expect(changes.slotsLeft).toBe(7);
    expect(changes.lines).toEqual([]);
    expect(changes.summary).toBe("Aucun changement");
    expect(changes.substitutions).toEqual([]);
    expect(changes.positionChanges).toEqual([]);
  });

  it("waits for the last post to be filled before deducing anything", () => {
    const halfDone = STARTERS.filter((assignment) => assignment.slotId !== STRIKER.id);

    const changes = deduceChanges(team(STARTERS), team(halfDone), nameOf);

    expect(changes.slotsLeft).toBe(1);
    expect(changes.lines).toEqual([]);
  });

  it("counts a slot nobody is standing in, not a player who is missing", () => {
    // Six players in seven slots is a draft; the same six in six slots is a team playing short.
    const six = STARTERS.filter((assignment) => assignment.slotId !== STRIKER.id);
    const sixSlots = SLOTS.filter((slot) => slot.id !== STRIKER.id);

    const changes = deduceChanges(team(STARTERS), { assignments: six, slots: sixSlots }, nameOf);

    expect(changes.slotsLeft).toBe(0);
    expect(changes.lines).toEqual(["Ali sort"]);
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

  /**
   * The last part is what makes the line add up: five players are marked here, and a coach reading
   * « 2 titulaires · 1 remplaçant · 1 supporter » would be missing one with no way to know whether he
   * forgot him or the app did.
   */
  it("summarises the sheet the way a coach reads it, and accounts for everybody", () => {
    expect(squadSummaryFr(countSquadRoles(sheet))).toBe(
      "2 titulaires · 1 remplaçant · 1 supporter · 1 hors feuille",
    );
  });

  it("leaves out the roles nobody has", () => {
    expect(squadSummaryFr({ starters: 1, substitutes: 0, supporters: 0, unselected: 0 })).toBe(
      "1 titulaire",
    );
    expect(squadSummaryFr({ starters: 1, substitutes: 0, supporters: 0, unselected: 9 })).toBe(
      "1 titulaire · 9 hors feuille",
    );
  });

  /**
   * An untouched sheet is not thirteen players left out — it is a sheet nobody has filled. « Feuille
   * de match vide » is shorter and truer than « 13 hors feuille », so the tally is dropped entirely
   * when there is nothing else on the line.
   */
  it("says so when nothing has been decided", () => {
    expect(squadSummaryFr(countSquadRoles([{ squadRole: null }]))).toBe("Feuille de match vide");
    expect(squadSummaryFr({ starters: 0, substitutes: 0, supporters: 0, unselected: 13 })).toBe(
      "Feuille de match vide",
    );
  });

  it("names every role, and the absence of one", () => {
    expect(squadRoleLabelFr("starter")).toBe("Titulaire");
    expect(squadRoleLabelFr("substitute")).toBe("Remplaçant");
    expect(squadRoleLabelFr("supporter")).toBe("Supporter");
    expect(squadRoleLabelFr(null)).toBe("Hors feuille");
  });
});

describe("sheetNextStepFr", () => {
  const counts = (starters: number) => ({
    starters,
    substitutes: 0,
    supporters: 0,
    unselected: 13 - starters,
  });

  it("does not say the group is made on a sheet nobody has touched", () => {
    const step = sheetNextStepFr(counts(0), "scheduled");

    expect(step.description).not.toContain("Le groupe est fait");
    expect(step.description).toContain("Personne n’est encore titulaire");
  });

  it("offers no composition link when there would be nobody to place", () => {
    expect(sheetNextStepFr(counts(0), "scheduled").cta).toBeNull();
  });

  it("says how many titulaires are missing, and still lets the coach start placing", () => {
    const step = sheetNextStepFr(counts(4), "scheduled");

    expect(step.description).toContain("4 titulaires sur 7");
    expect(step.description).toContain("il en manque 3");
    expect(step.cta).toBe("composition");
  });

  it("agrees in number for a single titulaire", () => {
    const step = sheetNextStepFr(counts(1), "scheduled");

    expect(step.description).toContain("1 titulaire sur 7");
    expect(step.description).toContain("celui-là");
    expect(step.description).not.toContain("ceux-là");
  });

  it("says the group is made only when seven are ticked", () => {
    expect(sheetNextStepFr(counts(7), "scheduled").description).toBe(
      "Le groupe est fait : place les sept sur le terrain.",
    );
  });

  /** Nothing caps the starters, so nine of them is reachable — and « place les sept » was a lie. */
  it("says by how much a sheet is over seven, rather than naming a seven that does not exist", () => {
    const step = sheetNextStepFr(counts(9), "scheduled");

    expect(step.description).toContain("9 titulaires cochés pour 7 places");
    expect(step.description).toContain("2 de trop");
    expect(step.description).toContain("Repasse-les en remplaçants");
    expect(step.description).not.toContain("place les sept");
  });

  it("stops giving instructions once the match is played, whatever the sheet says", () => {
    for (const starters of [0, 4, 7, 9]) {
      const step = sheetNextStepFr(counts(starters), "finished");

      expect(step.description).toContain("Le match est joué");
      expect(step.description).not.toContain("place");
      expect(step.cta).toBe("recap");
    }
  });

  it("treats a live match like one still to compose: invariant 3 makes a plan a proposal", () => {
    expect(sheetNextStepFr(counts(7), "live").cta).toBe("composition");
  });
});

describe("compositionsScreenFr", () => {
  const live = { status: "live" as const, entryMode: "live" as const };
  const scheduled = { status: "scheduled" as const, entryMode: "live" as const };
  const played = { status: "finished" as const, entryMode: "live" as const };
  const typedUp = { status: "finished" as const, entryMode: "retro" as const };

  it("lets a match still to be played be composed, and says so the old way", () => {
    const screen = compositionsScreenFr(scheduled);

    expect(screen.editable).toBe(true);
    expect(screen.frozenNoticeFr).toBeNull();
    expect(screen.noPlansFr.title).toBe("Le terrain est vide");
    expect(screen.noPlansFr.withCta).toBe(true);
    expect(screen.emptySheetFr.withCta).toBe(true);
    expect(screen.sheetLinkFr).toBe("modifier la feuille");
  });

  /** Planning the 40th minute during the 20th is the point of the screen; invariant 3 keeps it a plan. */
  it("keeps a live match editable", () => {
    expect(compositionsScreenFr(live).editable).toBe(true);
  });

  it("never tells a coach to place seven players in a match that is over", () => {
    for (const match of [played, typedUp]) {
      const screen = compositionsScreenFr(match);

      expect(screen.editable).toBe(false);
      expect(screen.noPlansFr.withCta).toBe(false);
      expect(screen.emptySheetFr.withCta).toBe(false);
      expect(screen.noPlansFr.description).not.toContain("Place tes sept joueurs");
      expect(screen.noPlansFr.description).not.toContain("planifier");
      expect(screen.emptySheetFr.description).not.toContain("Choisis d’abord");
      // The sheet itself is `frozen` on a finished match, so « modifier » is a promise it breaks.
      expect(screen.sheetLinkFr).toBe("voir la feuille");
    }
  });

  it("does not repeat the heading of the card it sits in", () => {
    expect(compositionsScreenFr(played).noPlansFr.title).not.toBe("Aucune composition");
    expect(compositionsScreenFr(typedUp).noPlansFr.title).not.toBe("Aucune composition");
  });

  it("says where a typed-up match's minutes come from, since no composition made them", () => {
    expect(compositionsScreenFr(typedUp).noPlansFr.description).toContain("saisi après coup");
    expect(compositionsScreenFr(played).noPlansFr.description).not.toContain("saisi après coup");
  });

  it("says once, above the compositions, that they have stopped being plans", () => {
    expect(compositionsScreenFr(played).frozenNoticeFr).toBe(lineupsFrozenFr("live"));
    expect(lineupsFrozenFr("live")).toContain("ne changent plus");
    expect(lineupsFrozenFr("live")).toContain("par sa saisie");
  });
});

describe("draftChangesPendingFr", () => {
  it("agrees in number", () => {
    expect(draftChangesPendingFr(1)).toContain("Il reste un poste à pourvoir");
    expect(draftChangesPendingFr(4)).toContain("Il reste 4 postes à pourvoir");
  });

  it("says the changes are coming rather than that there are none", () => {
    expect(draftChangesPendingFr(7)).not.toContain("Aucun changement");
    expect(draftChangesPendingFr(7)).toContain("quand l’équipe sera complète");
  });
});

describe("appliedNoticeFr", () => {
  it("credits a confirmation to the coach who was there with the phone", () => {
    const notice = appliedNoticeFr("live");
    expect(notice.howFr).toBe("confirmée pendant le match");
    expect(notice.listFr).toBe(
      "Cette composition a été confirmée pendant le match : elle ne change plus.",
    );
  });

  /**
   * FC Rivière in the demo season: `entry_mode = 'retro'`, and its starting composition is marked
   * applied because `lib/retro/log.ts` writes a `LINEUP_APPLIED` at 0′ on purpose. Nobody confirmed
   * anything during that match — there was nobody watching it with the app open.
   */
  it("says a saisie was a saisie", () => {
    const notice = appliedNoticeFr("retro");
    expect(notice.howFr).toBe("enregistrée avec la saisie du match");
    expect(notice.listFr).not.toContain("pendant le match");
    expect(notice.editorFr).not.toContain("pendant le match");
    expect(notice.refusalFr).not.toContain("pendant le match");
  });

  it("keeps each sentence's own ending, so the three surfaces still read differently", () => {
    const notice = appliedNoticeFr("retro");
    expect(notice.listFr).toContain("elle ne change plus");
    expect(notice.editorFr).toContain("ce qui s’est passé");
    expect(notice.refusalFr).toContain("ne peut plus être modifiée");
  });

  it("never calls it « appliquée », which said nothing about how", () => {
    for (const mode of ["live", "retro"] as const) {
      expect(appliedNoticeFr(mode).refusalFr).not.toContain("appliquée");
    }
  });
});

describe("lineupsFrozenFr", () => {
  it("credits the mode that was actually used", () => {
    expect(lineupsFrozenFr("live")).toContain("le mode match a confirmées");
    expect(lineupsFrozenFr("retro")).not.toContain("mode match");
    expect(lineupsFrozenFr("retro")).toContain("viennent de la saisie");
  });

  it("says the same two things either way: it is over, and the saisie is the way in", () => {
    for (const mode of ["live", "retro"] as const) {
      expect(lineupsFrozenFr(mode)).toContain("ne changent plus");
      expect(lineupsFrozenFr(mode)).toContain("sa saisie");
    }
  });
});

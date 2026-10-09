import { describe, expect, it } from "vitest";

import type { SlotAssignment } from "@/lib/match/lineup";

import {
  lineupsFrozenFr,
  appliedNoticeFr,
  blockingIssues,
  compositionsScreenFr,
  countSquadRoles,
  isSheetCandidate,
  deduceChanges,
  draftChangesPendingFr,
  findPlanIssues,
  minuteIsTaken,
  nameOfMembers,
  ordinalFr,
  planInForceBefore,
  planTitleFr,
  sortPlans,
  squadSummaryFr,
  suggestNextMinute,
  type PlanMember,
  type PlanSlot,
  type PlannedLineup,
} from "./plan";

/**
 * Two of the **retired** built-in shapes, as their `formation_slots` rows still read (decision 157 keeps
 * the rows; `0009_seed_formations.sql` is where they come from). Typed out here rather than read from
 * `db/reference.ts`, which only holds the one formation now.
 *
 * Why these and not the 1-2-3-1: the planner is formation-agnostic — a slot is an id and a code — and
 * what these cases need is a shape with **two slots on one code** in midfield (the double pivot, `MC`
 * twice) and a second shape to change to, which is exactly the history an old plan can still carry.
 */
const RETIRED_SHAPES: Record<string, readonly string[]> = {
  "1-3-2-1": ["GB", "DG", "DC", "DD", "MC", "MC", "AT"],
  "1-3-1-2": ["GB", "DG", "DC", "DD", "MC", "AT", "AT"],
};

/** The slots of a shape, keyed like `formation_slots` rows would be. */
function slotsOf(label: string): PlanSlot[] {
  const codes = RETIRED_SHAPES[label];
  if (!codes) throw new Error(`unknown formation ${label}`);
  return codes.map((positionCode, index) => ({
    id: `${label}/${index + 1}`,
    positionCode,
    sort: index + 1,
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
        messageFr: "Momo n’est plus sélectionné.",
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

describe("the selection in words", () => {
  const sheet = [
    { isPlayer: true, squadRole: "starter" as const },
    { isPlayer: true, squadRole: "starter" as const },
    { isPlayer: true, squadRole: "substitute" as const },
    { isPlayer: true, squadRole: "supporter" as const },
    { isPlayer: true, squadRole: null },
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
      "2 titulaires · 1 remplaçant · 1 supporter · 1 non sélectionné",
    );
  });

  /**
   * The demo season, exactly: thirteen players, eleven of them on the sheet against Étoile du Parc,
   * and a fourteenth member — the club's second coach — who has never played a minute. The match page
   * said « 3 hors feuille », the sheet one tap away said « 2 », and only one of them can be true.
   */
  it("does not count a coach who never plays as a player left out", () => {
    const squad = [
      ...Array.from({ length: 7 }, () => ({ isPlayer: true, squadRole: "starter" as const })),
      ...Array.from({ length: 3 }, () => ({ isPlayer: true, squadRole: "substitute" as const })),
      { isPlayer: true, squadRole: "supporter" as const },
      { isPlayer: true, squadRole: null },
      { isPlayer: true, squadRole: null },
      { isPlayer: false, squadRole: null },
    ];

    expect(countSquadRoles(squad).unselected).toBe(2);
    expect(squadSummaryFr(countSquadRoles(squad))).toBe(
      "7 titulaires · 3 remplaçants · 1 supporter · 2 non sélectionnés",
    );
  });

  /** The line has to add up against the squad the reader can count, non-players excluded. */
  it("accounts for every player and nobody else", () => {
    const squad = [
      { isPlayer: true, squadRole: "starter" as const },
      { isPlayer: true, squadRole: null },
      { isPlayer: false, squadRole: null },
      { isPlayer: false, squadRole: null },
    ];
    const counts = countSquadRoles(squad);
    const total = counts.starters + counts.substitutes + counts.supporters + counts.unselected;

    expect(total).toBe(squad.filter((member) => member.isPlayer).length);
  });

  /**
   * The one case that keeps a non-player in the count: a coach the coach did put on the sheet. Hiding
   * him would leave the only screen that can take him back off unable to show him.
   */
  it("keeps a non-player who is on the sheet", () => {
    const squad = [
      { isPlayer: true, squadRole: "starter" as const },
      { isPlayer: false, squadRole: "supporter" as const },
    ];

    expect(countSquadRoles(squad)).toEqual({
      starters: 1,
      substitutes: 0,
      supporters: 1,
      unselected: 0,
    });
    expect(isSheetCandidate({ isPlayer: false, squadRole: "supporter" })).toBe(true);
    expect(isSheetCandidate({ isPlayer: false, squadRole: null })).toBe(false);
    expect(isSheetCandidate({ isPlayer: true, squadRole: null })).toBe(true);
  });

  it("leaves out the roles nobody has", () => {
    expect(squadSummaryFr({ starters: 1, substitutes: 0, supporters: 0, unselected: 0 })).toBe(
      "1 titulaire",
    );
    expect(squadSummaryFr({ starters: 1, substitutes: 0, supporters: 0, unselected: 9 })).toBe(
      "1 titulaire · 9 non sélectionnés",
    );
  });

  /**
   * An untouched selection is not thirteen players left out — it is a selection nobody has made.
   * « Personne n’est encore sélectionné » is truer than « 13 non sélectionnés », so the tally is
   * dropped entirely when there is nothing else on the line.
   */
  it("says so when nothing has been decided", () => {
    expect(squadSummaryFr(countSquadRoles([{ isPlayer: true, squadRole: null }]))).toBe(
      "Personne n’est encore sélectionné",
    );
    expect(squadSummaryFr({ starters: 0, substitutes: 0, supporters: 0, unselected: 13 })).toBe(
      "Personne n’est encore sélectionné",
    );
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
  });

  /** Decision 165: the starting composition is the selection, so its empty state names both halves. */
  it("tells a coach that the remplaçants and supporters are chosen on the same page", () => {
    expect(compositionsScreenFr(scheduled).noPlansFr.description).toContain(
      "les remplaçants et les supporters",
    );
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
      expect(screen.noPlansFr.description).not.toContain("Place tes sept joueurs");
      expect(screen.noPlansFr.description).not.toContain("planifier");
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

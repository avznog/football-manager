import { describe, expect, it } from "vitest";

import { describeLineupDiffFr } from "./lineup";
import { playerIndex, type LivePlayer, type LiveSlot, type PlayerOption } from "./presenter";
import {
  nearestTerrainTarget,
  terrainBench,
  terrainDrop,
  terrainLineupId,
  terrainPayload,
  terrainPitchSlots,
  terrainPlace,
  terrainRemove,
  terrainReview,
  terrainSummaryFr,
  terrainTargets,
  type SlotAssignment,
} from "./terrain";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

const SLOT = {
  gb: "s-gb",
  dg: "s-dg",
  dc: "s-dc",
  dd: "s-dd",
  mc1: "s-mc1",
  mc2: "s-mc2",
  at: "s-at",
} as const;

/** The built-in 1-3-2-1, with the permille coordinates `formation_slots` stores. */
const SLOTS: LiveSlot[] = [
  { id: SLOT.gb, formationId: "f1", positionCode: "GB", x: 500, y: 60, sort: 1 },
  { id: SLOT.dg, formationId: "f1", positionCode: "DG", x: 220, y: 280, sort: 2 },
  { id: SLOT.dc, formationId: "f1", positionCode: "DC", x: 500, y: 250, sort: 3 },
  { id: SLOT.dd, formationId: "f1", positionCode: "DD", x: 780, y: 280, sort: 4 },
  { id: SLOT.mc1, formationId: "f1", positionCode: "MC", x: 350, y: 540, sort: 5 },
  { id: SLOT.mc2, formationId: "f1", positionCode: "MC", x: 650, y: 540, sort: 6 },
  { id: SLOT.at, formationId: "f1", positionCode: "AT", x: 500, y: 850, sort: 7 },
];

/** A second formation, so the "slot from another shape" cases are real and not hypothetical. */
const OTHER_SLOTS: LiveSlot[] = [
  { id: "o-gb", formationId: "f2", positionCode: "GB", x: 500, y: 60, sort: 1 },
  { id: "o-at2", formationId: "f2", positionCode: "AT", x: 300, y: 860, sort: 7 },
];

const ALL_SLOTS = [...SLOTS, ...OTHER_SLOTS];

const player = (
  memberId: string,
  displayName: string,
  extra: Partial<LivePlayer> = {},
): LivePlayer => ({
  memberId,
  displayName,
  jerseyNumber: null,
  isInjured: false,
  squadRole: "starter",
  isPlayer: true,
  ...extra,
});

const PLAYERS: LivePlayer[] = [
  player("hugo", "Hugo", { jerseyNumber: 1 }),
  player("samir", "Samir"),
  player("thomas", "Thomas"),
  player("nico", "Nico"),
  player("leo", "Léo"),
  player("karim", "Karim"),
  player("julien", "Julien"),
  player("momo", "Momo", { squadRole: "substitute" }),
  player("yanis", "Yanis", { squadRole: "substitute" }),
  player("ali", "Ali", { squadRole: "substitute", isInjured: true }),
  player("gerard", "Gérard", { squadRole: "supporter", isPlayer: false }),
  player("fabien", "Fabien", { squadRole: null }),
];

const PLAYER_INDEX = playerIndex(PLAYERS);

const STARTING_SEVEN: SlotAssignment[] = [
  { slotId: SLOT.gb, memberId: "hugo" },
  { slotId: SLOT.dg, memberId: "samir" },
  { slotId: SLOT.dc, memberId: "thomas" },
  { slotId: SLOT.dd, memberId: "nico" },
  { slotId: SLOT.mc1, memberId: "leo" },
  { slotId: SLOT.mc2, memberId: "karim" },
  { slotId: SLOT.at, memberId: "julien" },
];

const option = (memberId: string, extra: Partial<PlayerOption> = {}): PlayerOption => ({
  memberId,
  name: PLAYER_INDEX.nameOf(memberId),
  jerseyNumber: null,
  subtitle: null,
  warn: false,
  ...extra,
});

function review(arranged: SlotAssignment[], base: SlotAssignment[] = STARTING_SEVEN, leftPitch: string[] = []) {
  return terrainReview(base, arranged, {
    slots: ALL_SLOTS,
    players: PLAYER_INDEX,
    leftPitchMemberIds: leftPitch,
  });
}

/* -------------------------------------------------------------------------- */
/* Drop targets                                                               */
/* -------------------------------------------------------------------------- */

describe("terrainTargets", () => {
  it("draws the chosen formation, in store order", () => {
    const targets = terrainTargets(ALL_SLOTS, { formationId: "f1" });
    expect(targets.map((slot) => slot.id)).toEqual([
      SLOT.gb,
      SLOT.dg,
      SLOT.dc,
      SLOT.dd,
      SLOT.mc1,
      SLOT.mc2,
      SLOT.at,
    ]);
  });

  it("keeps an occupied slot from another formation, so nobody vanishes", () => {
    const targets = terrainTargets(ALL_SLOTS, { formationId: "f1", occupiedSlotIds: ["o-at2"] });
    expect(targets.map((slot) => slot.id)).toContain("o-at2");
    expect(targets).toHaveLength(8);
  });
});

describe("nearestTerrainTarget", () => {
  it("snaps a drop near a slot onto it", () => {
    expect(nearestTerrainTarget(SLOTS, { x: 520, y: 880 })?.id).toBe(SLOT.at);
  });

  it("returns null for a drop on empty grass", () => {
    // Mid-pitch, on the left touchline: far from every slot of the 1-3-2-1.
    expect(nearestTerrainTarget(SLOTS, { x: 20, y: 700 })).toBeNull();
  });

  it("picks the closer of two neighbouring slots", () => {
    expect(nearestTerrainTarget(SLOTS, { x: 380, y: 545 })?.id).toBe(SLOT.mc1);
    expect(nearestTerrainTarget(SLOTS, { x: 620, y: 545 })?.id).toBe(SLOT.mc2);
  });
});

/* -------------------------------------------------------------------------- */
/* Arranging                                                                  */
/* -------------------------------------------------------------------------- */

describe("terrainDrop", () => {
  it("brings a substitute on when the drop lands on a free slot", () => {
    const arranged = terrainRemove(STARTING_SEVEN, "julien");
    const next = terrainDrop(arranged, SLOTS, "yanis", { x: 500, y: 850 });
    expect(next).toContainEqual({ slotId: SLOT.at, memberId: "yanis" });
  });

  it("swaps two players when the drop lands on an occupied slot", () => {
    const next = terrainDrop(STARTING_SEVEN, SLOTS, "julien", { x: 500, y: 60 });
    expect(next).toContainEqual({ slotId: SLOT.gb, memberId: "julien" });
    expect(next).toContainEqual({ slotId: SLOT.at, memberId: "hugo" });
  });

  it("changes nothing when the drop lands on empty grass", () => {
    // The safety rule: a slipped thumb at 70′ must not take a player off the pitch.
    const next = terrainDrop(STARTING_SEVEN, SLOTS, "julien", { x: 20, y: 700 });
    expect(next).toEqual(STARTING_SEVEN);
  });

  it("changes nothing when a substitute is dropped on empty grass either", () => {
    const next = terrainDrop(STARTING_SEVEN, SLOTS, "yanis", { x: 20, y: 700 });
    expect(next.some((assignment) => assignment.memberId === "yanis")).toBe(false);
    expect(next).toHaveLength(7);
  });
});

describe("terrainPlace and terrainRemove", () => {
  it("places by slot id, for the tap-then-tap and keyboard paths", () => {
    const next = terrainPlace(terrainRemove(STARTING_SEVEN, "julien"), SLOT.at, "momo");
    expect(next).toContainEqual({ slotId: SLOT.at, memberId: "momo" });
  });

  it("gives the same result as the equivalent drag", () => {
    const dragged = terrainDrop(STARTING_SEVEN, SLOTS, "julien", { x: 500, y: 60 });
    const tapped = terrainPlace(STARTING_SEVEN, SLOT.gb, "julien");
    expect(tapped).toEqual(dragged);
  });

  it("takes a player off wherever he stood", () => {
    const next = terrainRemove(STARTING_SEVEN, "leo");
    expect(next).toHaveLength(6);
    expect(next.some((assignment) => assignment.memberId === "leo")).toBe(false);
  });
});

/* -------------------------------------------------------------------------- */
/* The pitch being arranged                                                   */
/* -------------------------------------------------------------------------- */

describe("terrainPitchSlots", () => {
  it("draws a player who is not on yet as a ghost that reads « entre »", () => {
    const arranged = terrainPlace(terrainRemove(STARTING_SEVEN, "julien"), SLOT.at, "yanis");
    const slots = terrainPitchSlots(arranged, ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
    });
    const at = slots.find((slot) => slot.id === SLOT.at);
    expect(at?.player?.variant).toBe("ghost");
    expect(at?.player?.statusLabel).toBe("entre");
  });

  it("keeps a player already on the pitch normal, even if he moved", () => {
    const arranged = terrainPlace(STARTING_SEVEN, SLOT.gb, "julien");
    const slots = terrainPitchSlots(arranged, ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
    });
    expect(slots.find((slot) => slot.id === SLOT.gb)?.player).toMatchObject({
      id: "julien",
      variant: "normal",
    });
  });

  it("flags an injured entrant rather than hiding him (decision 011)", () => {
    const arranged = terrainPlace(terrainRemove(STARTING_SEVEN, "julien"), SLOT.at, "ali");
    const at = terrainPitchSlots(arranged, ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
    }).find((slot) => slot.id === SLOT.at);
    expect(at?.player).toMatchObject({ variant: "unavailable", statusLabel: "blessé" });
  });

  it("marks the disc the coach has picked up as selected", () => {
    const slots = terrainPitchSlots(STARTING_SEVEN, ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
      selectedMemberId: "karim",
    });
    expect(slots.find((slot) => slot.id === SLOT.mc2)?.player?.variant).toBe("selected");
  });

  it("leaves a vacated slot empty", () => {
    const slots = terrainPitchSlots(terrainRemove(STARTING_SEVEN, "leo"), ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
    });
    expect(slots.find((slot) => slot.id === SLOT.mc1)?.player).toBeNull();
  });

  it("still shows a player standing in a slot of another formation", () => {
    const base: SlotAssignment[] = [...STARTING_SEVEN, { slotId: "o-at2", memberId: "momo" }];
    const slots = terrainPitchSlots(base, ALL_SLOTS, PLAYER_INDEX, { base, formationId: "f1" });
    expect(slots.find((slot) => slot.id === "o-at2")?.player?.id).toBe("momo");
  });

  it("shows a player whose slot is in no formation at all, rather than losing him", () => {
    const arranged: SlotAssignment[] = [...STARTING_SEVEN, { slotId: "ghost-slot", memberId: "momo" }];
    const slots = terrainPitchSlots(arranged, ALL_SLOTS, PLAYER_INDEX, {
      base: STARTING_SEVEN,
      formationId: "f1",
    });
    expect(slots.find((slot) => slot.id === "ghost-slot")?.player).toMatchObject({
      id: "momo",
      statusLabel: "poste inconnu",
    });
  });
});

/* -------------------------------------------------------------------------- */
/* The bench strip                                                            */
/* -------------------------------------------------------------------------- */

describe("terrainBench", () => {
  const candidates = [
    option("hugo"),
    option("leo"),
    option("julien"),
    option("momo", { subtitle: "remplaçant" }),
    option("yanis", { subtitle: "remplaçant" }),
  ];

  it("lists the players the arrangement takes off first, labelled « sort du terrain »", () => {
    const arranged = terrainRemove(STARTING_SEVEN, "leo");
    const bench = terrainBench(arranged, { candidates, base: STARTING_SEVEN });
    expect(bench[0]).toMatchObject({ memberId: "leo", comingOff: true, subtitle: "sort du terrain" });
    expect(bench.map((entry) => entry.memberId)).toEqual(["leo", "momo", "yanis"]);
  });

  it("drops anybody the coach has placed", () => {
    const arranged = terrainPlace(terrainRemove(STARTING_SEVEN, "leo"), SLOT.mc1, "momo");
    const bench = terrainBench(arranged, { candidates, base: STARTING_SEVEN });
    expect(bench.map((entry) => entry.memberId)).toEqual(["leo", "yanis"]);
  });

  it("keeps the recommendation order of the candidates it is given", () => {
    const bench = terrainBench(STARTING_SEVEN, { candidates, base: STARTING_SEVEN });
    expect(bench.map((entry) => entry.memberId)).toEqual(["momo", "yanis"]);
    expect(bench.every((entry) => !entry.comingOff)).toBe(true);
  });
});

/* -------------------------------------------------------------------------- */
/* What the coach reads before confirming                                     */
/* -------------------------------------------------------------------------- */

describe("terrainReview", () => {
  it("has nothing to confirm when nothing was arranged", () => {
    const result = review([...STARTING_SEVEN]);
    expect(result.isEmpty).toBe(true);
    expect(result.canConfirm).toBe(false);
    expect(result.changes).toEqual([]);
    expect(result.summary).toBe("Aucun changement");
  });

  it("reads out two substitutions and a move as three lines and one confirmation", () => {
    // Léo → Yanis, Julien → Momo, and Karim pushed up front: the 70′ case, one « Valider ».
    let arranged = terrainRemove(STARTING_SEVEN, "leo");
    arranged = terrainRemove(arranged, "julien");
    arranged = terrainPlace(arranged, SLOT.mc1, "yanis");
    arranged = terrainPlace(arranged, SLOT.at, "karim");
    arranged = terrainPlace(arranged, SLOT.mc2, "momo");

    const result = review(arranged);
    expect(result.canConfirm).toBe(true);
    expect(result.problems).toEqual([]);
    expect(result.changes).toEqual([
      "Léo → Yanis",
      "Julien → Momo",
      "Karim passe MC → AT",
    ]);
    expect(result.count).toBe(3);
    expect(result.summary).toBe("2 changements et 1 repositionnement");
  });

  it("spells out an arrival that replaces nobody", () => {
    // Six on the pitch after an injury, a seventh comes on: `describeLineupDiffFr` alone would
    // print nothing at all for this.
    const base = terrainRemove(STARTING_SEVEN, "julien");
    const arranged = terrainPlace(base, SLOT.at, "momo");
    const result = review(arranged, base);
    expect(result.changes).toEqual(["Momo entre"]);
    expect(result.canConfirm).toBe(true);
  });

  it("spells out a departure that nobody replaces", () => {
    const arranged = terrainRemove(STARTING_SEVEN, "julien");
    const result = review(arranged);
    expect(result.changes).toEqual(["Julien sort"]);
    expect(result.warnings).toContain("6 joueurs sur le terrain : il en manque 1.");
    // A side that finishes with six is legal and sometimes unavoidable: a warning, not a refusal.
    expect(result.canConfirm).toBe(true);
  });

  it("refuses an eighth player on the pitch", () => {
    const arranged = terrainPlace([...STARTING_SEVEN], "o-at2", "momo");
    const result = review(arranged);
    expect(result.problems.map((problem) => problem.code)).toEqual(["too-many"]);
    expect(result.problems[0].message).toBe("8 joueurs placés : il n’en faut que 7.");
    expect(result.canConfirm).toBe(false);
  });

  it("refuses an arrangement with nobody in the goal", () => {
    const arranged = terrainRemove(STARTING_SEVEN, "hugo");
    const result = review(arranged);
    expect(result.problems.map((problem) => problem.code)).toEqual(["no-goalkeeper"]);
    expect(result.canConfirm).toBe(false);
  });

  it("refuses an empty pitch", () => {
    const result = review([]);
    expect(result.problems.map((problem) => problem.code)).toEqual(["empty"]);
    expect(result.canConfirm).toBe(false);
  });

  it("warns about who is coming on without blocking it", () => {
    let arranged = terrainRemove(STARTING_SEVEN, "julien");
    arranged = terrainRemove(arranged, "leo");
    arranged = terrainPlace(arranged, SLOT.at, "ali");
    arranged = terrainPlace(arranged, SLOT.mc1, "fabien");

    const result = review(arranged);
    expect(result.warnings).toEqual(["Fabien est hors feuille.", "Ali est blessé."]);
    expect(result.canConfirm).toBe(true);
  });

  it("warns when a player who already came off is sent back on", () => {
    const arranged = terrainPlace(terrainRemove(STARTING_SEVEN, "julien"), SLOT.at, "momo");
    const result = review(arranged, STARTING_SEVEN, ["momo"]);
    expect(result.warnings).toContain("Momo est déjà sorti.");
    expect(result.canConfirm).toBe(true);
  });

  it("exposes the diff, so the same arrangement drives the pitch and the list", () => {
    const arranged = terrainPlace(STARTING_SEVEN, SLOT.mc1, "karim");
    const result = review(arranged);
    // Karim and Léo exchange slots: a rotation, and no substitution at all.
    expect(result.diff.substitutions).toEqual([]);
    expect(result.diff.positionChanges).toHaveLength(2);
    expect(result.diff.steps.some((step) => step.kind === "rotation")).toBe(true);
  });
});

describe("describeLineupDiffFr and terrainSummaryFr", () => {
  it("counts an unpaired arrival and an unpaired departure as changes", () => {
    const base = terrainRemove(STARTING_SEVEN, "julien");
    const arranged = terrainPlace(base, SLOT.at, "momo");
    const { diff } = review(arranged, base);
    expect(describeLineupDiffFr(diff, PLAYER_INDEX.nameOf)).toEqual(["Momo entre"]);
    // Nobody left and nobody moved, so this is a man coming on — not a substitution.
    expect(terrainSummaryFr(diff)).toBe("1 joueur entre");
  });

  it("does not call the starting seven « 7 changements »", () => {
    // What « Ajuster sur le terrain » shows before the kick-off: an empty pitch being filled.
    const { diff } = review(STARTING_SEVEN, []);
    expect(terrainSummaryFr(diff)).toBe("7 joueurs entrent");
  });

  it("singularises and pluralises both halves", () => {
    const arranged = terrainPlace(terrainRemove(STARTING_SEVEN, "leo"), SLOT.mc1, "yanis");
    expect(terrainSummaryFr(review(arranged).diff)).toBe("1 changement");
    expect(terrainSummaryFr(review(terrainPlace(STARTING_SEVEN, SLOT.mc1, "karim")).diff)).toBe(
      "2 repositionnements",
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The one event                                                              */
/* -------------------------------------------------------------------------- */

describe("terrainPayload", () => {
  it("carries no lineupId for an ad-hoc change, and the plan's id for an adjusted plan", () => {
    expect(terrainLineupId({ kind: "pitch" })).toBeNull();
    expect(terrainLineupId({ kind: "plan", lineupId: "l1", title: "Composition prévue à la 45’" })).toBe("l1");

    expect(
      terrainPayload(STARTING_SEVEN, { slots: ALL_SLOTS, origin: { kind: "pitch" } }).lineupId,
    ).toBeNull();
    expect(
      terrainPayload(STARTING_SEVEN, {
        slots: ALL_SLOTS,
        origin: { kind: "plan", lineupId: "l1", title: "x" },
      }).lineupId,
    ).toBe("l1");
  });

  it("emits the slots in store order, whatever order the discs were dragged in", () => {
    let arranged = terrainRemove(STARTING_SEVEN, "julien");
    arranged = terrainPlace(arranged, SLOT.at, "yanis");
    arranged = terrainPlace(arranged, SLOT.gb, "karim");
    arranged = terrainPlace(arranged, SLOT.mc2, "hugo");

    const payload = terrainPayload(arranged, { slots: ALL_SLOTS, origin: { kind: "pitch" } });
    expect(payload.slots.map((assignment) => assignment.slotId)).toEqual([
      SLOT.gb,
      SLOT.dg,
      SLOT.dc,
      SLOT.dd,
      SLOT.mc1,
      SLOT.mc2,
      SLOT.at,
    ]);
  });

  it("is the same payload for two arrangements that end up identical", () => {
    const a = terrainPlace(terrainPlace(STARTING_SEVEN, SLOT.gb, "julien"), SLOT.mc1, "karim");
    const b = terrainPlace(terrainPlace(STARTING_SEVEN, SLOT.mc1, "karim"), SLOT.gb, "julien");
    const of = (arranged: SlotAssignment[]) =>
      terrainPayload(arranged, { slots: ALL_SLOTS, origin: { kind: "pitch" } });
    expect(of(a)).toEqual(of(b));
  });

  it("does not drop a player whose slot is in no formation", () => {
    const arranged: SlotAssignment[] = [...STARTING_SEVEN, { slotId: "ghost-slot", memberId: "momo" }];
    const payload = terrainPayload(arranged, { slots: ALL_SLOTS, origin: { kind: "pitch" } });
    expect(payload.slots).toHaveLength(8);
    expect(payload.slots.at(-1)).toEqual({ slotId: "ghost-slot", memberId: "momo" });
  });
});

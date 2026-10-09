/**
 * The rule the whole feature turns on: **which** composition a new one is pre-filled from.
 *
 * « In force at that minute » is the greatest `fromMinute` strictly below the new one. Not the last
 * composition created, not the last one in the list: a coach who has planned the 20th and then adds
 * the 10th inherits the starting seven. Every way of getting that wrong is a screen that puts seven
 * players on the pitch and calls them something they are not, so each one has a case here.
 */

import { describe, expect, it } from "vitest";

import { formationByLabel } from "@/db/reference";
import type { SlotAssignment } from "@/lib/match/lineup";

import { deduceChanges, editorSaveStateFr, newPlanPromptFr, type PlanSlot, type PlannedLineup } from "./plan";
import { prefillFromPlans, prefillNoticeFr } from "./prefill";

function slotsOf(label: string): PlanSlot[] {
  const template = formationByLabel(label);
  if (!template) throw new Error(`unknown formation ${label}`);
  return template.slots.map((slot) => ({
    id: `${label}/${slot.sort}`,
    positionCode: slot.positionCode,
    sort: slot.sort,
  }));
}

const SLOTS = slotsOf("1-2-3-1");
const [GK, CB_LEFT, CB_RIGHT, WING_LEFT, PIVOT, WING_RIGHT, STRIKER] = SLOTS;

const STARTERS: SlotAssignment[] = [
  { slotId: GK.id, memberId: "hugo" },
  { slotId: CB_LEFT.id, memberId: "samir" },
  { slotId: CB_RIGHT.id, memberId: "thomas" },
  { slotId: WING_LEFT.id, memberId: "nico" },
  { slotId: PIVOT.id, memberId: "leo" },
  { slotId: WING_RIGHT.id, memberId: "karim" },
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
};

const nameOf = (memberId: string) => NAMES[memberId] ?? memberId;

/** Everybody the fixture ever places: the editor's pool unless a test narrows it. */
const EVERYONE = Object.keys(NAMES);

function plan(
  overrides: Partial<PlannedLineup> & { id: string; fromMinute: number },
): PlannedLineup {
  return {
    isInitial: overrides.fromMinute === 0,
    formationId: "f1",
    formationLabel: "1-2-3-1",
    isApplied: false,
    assignments: STARTERS,
    slots: SLOTS,
    ...overrides,
  };
}

function prefill(
  plans: readonly PlannedLineup[],
  minute: number,
  placeable: readonly string[] = EVERYONE,
  formationIds: readonly string[] = ["f1", "f2"],
) {
  return prefillFromPlans({ plans, minute, placeableMemberIds: placeable, formationIds });
}

/* -------------------------------------------------------------------------- */
/* Which composition                                                          */
/* -------------------------------------------------------------------------- */

describe("prefillFromPlans — which composition is in force", () => {
  it("inherits nothing when the match has no composition at all", () => {
    const result = prefill([], 0);

    expect(result.source).toBeNull();
    expect(result.formationId).toBeNull();
    expect(result.assignments).toEqual([]);
    expect(result.droppedMemberIds).toEqual([]);
  });

  it("inherits nothing for the starting composition itself — there is no minute before 0", () => {
    const result = prefill([plan({ id: "a", fromMinute: 30 })], 0);

    expect(result.source).toBeNull();
    expect(result.assignments).toEqual([]);
  });

  it("inherits the starting seven for a change at the 10th minute", () => {
    const result = prefill([plan({ id: "start", fromMinute: 0 })], 10);

    expect(result.source?.id).toBe("start");
    expect(result.assignments).toEqual(STARTERS);
  });

  it("ignores a composition that starts at the very same minute", () => {
    // The minute is taken — `saveLineup` refuses it and the editor flags it — but a composition is
    // never a change to itself, so what it would inherit is still the one before it.
    const result = prefill(
      [plan({ id: "start", fromMinute: 0 }), plan({ id: "ten", fromMinute: 10 })],
      10,
    );

    expect(result.source?.id).toBe("start");
  });

  it("takes the latest of several earlier compositions, not the first", () => {
    const result = prefill(
      [
        plan({ id: "start", fromMinute: 0 }),
        plan({ id: "fifteen", fromMinute: 15 }),
        plan({ id: "twenty", fromMinute: 20 }),
      ],
      40,
    );

    expect(result.source?.id).toBe("twenty");
  });

  it("takes the starting seven when the only other composition comes later", () => {
    // The case the owner's note is about: the 20th is already planned, the coach adds the 10th.
    // Inheriting « the last one created » would put the 20th minute's team on the pitch.
    const result = prefill(
      [plan({ id: "start", fromMinute: 0 }), plan({ id: "twenty", fromMinute: 20 })],
      10,
    );

    expect(result.source?.id).toBe("start");
  });

  it("does not care what order the plans arrive in", () => {
    const plans = [
      plan({ id: "twenty", fromMinute: 20 }),
      plan({ id: "start", fromMinute: 0 }),
      plan({ id: "ten", fromMinute: 10 }),
    ];

    expect(prefill(plans, 15).source?.id).toBe("ten");
    expect(prefill([...plans].reverse(), 15).source?.id).toBe("ten");
  });

  it("inherits a composition game mode has already confirmed", () => {
    // At the 25th minute of a live match, the team on the pitch is the applied one. Copying it is a
    // read: nothing here touches `applied_event_id`.
    const applied = plan({ id: "start", fromMinute: 0, isApplied: true });
    const result = prefill([applied], 25);

    expect(result.source?.id).toBe("start");
    expect(result.assignments).toEqual(STARTERS);
  });
});

/* -------------------------------------------------------------------------- */
/* The formation                                                              */
/* -------------------------------------------------------------------------- */

describe("prefillFromPlans — the formation", () => {
  it("inherits the formation, so the seven land in slots that exist", () => {
    const result = prefill([plan({ id: "start", fromMinute: 0, formationId: "f2" })], 10);

    expect(result.formationId).toBe("f2");
    expect(result.assignments.map((assignment) => assignment.slotId)).toEqual(
      STARTERS.map((assignment) => assignment.slotId),
    );
  });

  it("places nobody when the source's formation is no longer available to the team", () => {
    const result = prefill([plan({ id: "start", fromMinute: 0, formationId: "gone" })], 10);

    expect(result.source?.id).toBe("start");
    expect(result.formationId).toBeNull();
    expect(result.assignments).toEqual([]);
    // Not listed as dropped players: it is the shape that is missing, not the seven.
    expect(result.droppedMemberIds).toEqual([]);
  });

  it("drops a pair whose slot is not one of the composition's own", () => {
    const stale = plan({
      id: "start",
      fromMinute: 0,
      assignments: [...STARTERS, { slotId: "redrawn/9", memberId: "momo" }],
    });

    expect(prefill([stale], 10).assignments).toEqual(STARTERS);
  });
});

/* -------------------------------------------------------------------------- */
/* Availability and the match sheet                                           */
/* -------------------------------------------------------------------------- */

describe("prefillFromPlans — who may be placed", () => {
  it("leaves out an inherited player who is no longer on the sheet, and says who", () => {
    const placeable = EVERYONE.filter((memberId) => memberId !== "ali");

    const result = prefill([plan({ id: "start", fromMinute: 0 })], 10, placeable);

    expect(result.assignments).toHaveLength(6);
    expect(result.assignments.some((assignment) => assignment.memberId === "ali")).toBe(false);
    expect(result.droppedMemberIds).toEqual(["ali"]);
    // His post is left open, which `findPlanIssues` reports as « Il reste un poste à pourvoir ».
    expect(result.assignments.some((assignment) => assignment.slotId === STRIKER.id)).toBe(false);
  });

  it("lists the dropped players in the composition's slot order", () => {
    const placeable = EVERYONE.filter(
      (memberId) => memberId !== "ali" && memberId !== "samir",
    );

    expect(prefill([plan({ id: "start", fromMinute: 0 })], 10, placeable).droppedMemberIds).toEqual([
      "samir",
      "ali",
    ]);
  });

  it("places nobody when nobody from the composition may be placed any more", () => {
    const result = prefill([plan({ id: "start", fromMinute: 0 })], 10, []);

    expect(result.assignments).toEqual([]);
    expect(result.droppedMemberIds).toHaveLength(STARTERS.length);
  });
});

/* -------------------------------------------------------------------------- */
/* The diff it feeds                                                          */
/* -------------------------------------------------------------------------- */

describe("what the pre-filled editor deduces", () => {
  const plans = [plan({ id: "start", fromMinute: 0 })];

  it("shows no change at all until the coach moves somebody", () => {
    const result = prefill(plans, 10);
    const changes = deduceChanges(
      plans[0],
      { assignments: result.assignments, slots: SLOTS },
      nameOf,
    );

    expect(changes.slotsLeft).toBe(0);
    expect(changes.lines).toEqual([]);
    expect(changes.summary).toBe("Aucun changement");
    expect(changes.isEmpty).toBe(true);
    // And emphatically not the seven departures the empty pitch used to produce.
    expect(changes.substitutions).toEqual([]);
  });

  it("names exactly the one substitution once he does", () => {
    const result = prefill(plans, 10);
    const moved = result.assignments.map((assignment) =>
      assignment.memberId === "leo" ? { ...assignment, memberId: "yanis" } : assignment,
    );

    const changes = deduceChanges(plans[0], { assignments: moved, slots: SLOTS }, nameOf);

    expect(changes.lines).toEqual(["Léo → Yanis"]);
    expect(changes.substitutions).toHaveLength(1);
  });

  it("does not pretend to a change list while an inherited player's post is empty", () => {
    const result = prefill(plans, 10, EVERYONE.filter((memberId) => memberId !== "ali"));

    const changes = deduceChanges(
      plans[0],
      { assignments: result.assignments, slots: SLOTS },
      nameOf,
    );

    expect(changes.slotsLeft).toBe(1);
    expect(changes.lines).toEqual([]);
  });
});

/* -------------------------------------------------------------------------- */
/* What the screen says                                                       */
/* -------------------------------------------------------------------------- */

describe("prefillNoticeFr", () => {
  it("says nothing when nothing was inherited", () => {
    expect(prefillNoticeFr(prefill([], 0), nameOf)).toEqual([]);
  });

  it("says where the team comes from and that nothing is saved yet", () => {
    const lines = prefillNoticeFr(prefill([plan({ id: "start", fromMinute: 0 })], 10), nameOf);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("composition de départ");
    expect(lines[0]).toContain("déplace seulement ce qui change");
    expect(lines[0]).toContain("Rien n’est enregistré avant que tu valides");
  });

  it("never implies the composition already exists", () => {
    const lines = prefillNoticeFr(prefill([plan({ id: "start", fromMinute: 0 })], 10), nameOf);

    for (const line of lines) {
      expect(line).not.toContain("enregistrée");
      expect(line).not.toContain("planifiée");
      expect(line).not.toContain("prévue");
    }
  });

  it("names the composition it copied when that is a later minute", () => {
    const lines = prefillNoticeFr(
      prefillFromPlans({
        plans: [plan({ id: "start", fromMinute: 0 }), plan({ id: "thirty", fromMinute: 30 })],
        minute: 45,
        placeableMemberIds: EVERYONE,
        formationIds: ["f1"],
      }),
      nameOf,
    );

    // A reference, not the heading: « de la composition de la 30ᵉ minute », never the card's own
    // « À partir de la 30ᵉ minute » quoted inside a sentence.
    expect(lines[0]).toBe(
      "Équipe reprise de la composition de la 30ᵉ minute : déplace seulement ce qui change. " +
        "Rien n’est enregistré avant que tu valides.",
    );
  });

  it("names a single player it could not replace, in the singular", () => {
    const lines = prefillNoticeFr(
      prefill([plan({ id: "start", fromMinute: 0 })], 10, EVERYONE.filter((id) => id !== "ali")),
      nameOf,
    );

    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Ali n’a pas pu être replacé");
    expect(lines[1]).toContain("Son poste est resté libre");
  });

  it("names several of them in the plural", () => {
    const lines = prefillNoticeFr(
      prefill(
        [plan({ id: "start", fromMinute: 0 })],
        10,
        EVERYONE.filter((id) => id !== "ali" && id !== "leo"),
      ),
      nameOf,
    );

    expect(lines[1]).toContain("Léo");
    expect(lines[1]).toContain("Ali");
    expect(lines[1]).toContain("n’ont pas pu être replacés");
  });

  it("explains an unavailable formation instead of blaming the players", () => {
    const lines = prefillNoticeFr(
      prefill([plan({ id: "start", fromMinute: 0, formationId: "gone" })], 10),
      nameOf,
    );

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("sa formation n’est plus disponible");
    expect(lines[0]).toContain("rien n’est enregistré avant que tu valides");
  });
});

describe("editorSaveStateFr", () => {
  it("never says « À jour » about a composition that does not exist yet", () => {
    expect(editorSaveStateFr({ isNew: true, dirty: false })).toBe("Rien n’est encore enregistré.");
    expect(editorSaveStateFr({ isNew: true, dirty: true })).toBe("Rien n’est encore enregistré.");
  });

  it("keeps the two answers a saved composition has", () => {
    expect(editorSaveStateFr({ isNew: false, dirty: true })).toBe(
      "Modifications non enregistrées.",
    );
    expect(editorSaveStateFr({ isNew: false, dirty: false })).toBe("À jour.");
  });
});

describe("newPlanPromptFr", () => {
  it("tells the coach the team in place is reused, so he does not expect an empty pitch", () => {
    const prompt = newPlanPromptFr(60);

    expect(prompt.description).toContain("reprise");
    expect(prompt.description).toContain("60 minutes");
  });
});

import { describe, expect, it } from "vitest";

import type { BestSevenSlot } from "./best-seven";
import { buildSevenPrompt, sevenHandles, sevenShapeFr } from "./seven-prompt";
import { buildCells, type SevenCandidate } from "./sevens";

/* The fixture style of `sevens.test.ts`, deliberately: one squad shape for the whole seven layer. */

function slot(id: string, positionCode: string): BestSevenSlot {
  return { id, positionCode, isGoalkeeper: positionCode === "GB" };
}

let jersey = 0;
function player(overrides: Partial<SevenCandidate> & { displayName: string }): SevenCandidate {
  jersey += 1;
  const base: SevenCandidate = {
    id: `id-${overrides.displayName}`,
    displayName: overrides.displayName,
    jerseyNumber: jersey,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanMinutes: 0,
    gkMinutes: 0,
    gkCleanMinutes: 0,
    ratingAverage: null,
    ratingCount: 0,
    ratingVariance: null,
    declarations: {},
    outfieldMinutes: 0,
    concededOutfield: 0,
    concededWhileGk: 0,
    positions: [],
  };
  const merged = { ...base, ...overrides };
  if (overrides.outfieldMinutes === undefined) merged.outfieldMinutes = merged.minutes - merged.gkMinutes;
  return merged;
}

const SLOTS = [
  slot("gb", "GB"),
  slot("dc1", "DC"),
  slot("dc2", "DC"),
  slot("ail1", "AIL"),
  slot("ail2", "AIL"),
  slot("mc", "MC"),
  slot("at", "AT"),
];

/** A squad big enough to be representative of the real one, and small enough to read in a diff. */
function squad(): SevenCandidate[] {
  jersey = 0;
  return [
    player({
      displayName: "Gardien",
      minutes: 600,
      gkMinutes: 600,
      concededWhileGk: 9,
      declarations: { GB: "primary" },
      ratingAverage: 6.5,
      ratingCount: 8,
      ratingVariance: 0.4,
      positions: [{ group: "GB", minutes: 600, goalsFor: 12, goalsAgainst: 9 }],
    }),
    player({
      displayName: "Défenseur",
      minutes: 540,
      concededOutfield: 7,
      declarations: { DC: "primary", MC: "secondary" },
      ratingAverage: 6,
      ratingCount: 7,
      ratingVariance: 0.3,
      positions: [{ group: "DC", minutes: 480, goalsFor: 9, goalsAgainst: 7 }],
    }),
    player({
      displayName: "Autre défenseur",
      minutes: 480,
      concededOutfield: 8,
      declarations: { DC: "primary" },
      positions: [{ group: "DC", minutes: 480, goalsFor: 8, goalsAgainst: 8 }],
    }),
    player({
      displayName: "Ailier",
      minutes: 420,
      goals: 4,
      assists: 3,
      declarations: { AIL: "primary" },
      ratingAverage: 7.25,
      ratingCount: 6,
      ratingVariance: 0.6,
      positions: [{ group: "AIL", minutes: 420, goalsFor: 11, goalsAgainst: 6 }],
    }),
    player({
      displayName: "Autre ailier",
      minutes: 300,
      goals: 2,
      assists: 5,
      declarations: { AIL: "secondary" },
      positions: [{ group: "AIL", minutes: 300, goalsFor: 6, goalsAgainst: 5 }],
    }),
    player({
      displayName: "Milieu",
      minutes: 600,
      goals: 1,
      assists: 6,
      gkMinutes: 60,
      concededWhileGk: 1,
      declarations: { MC: "primary" },
      positions: [{ group: "MC", minutes: 540, goalsFor: 13, goalsAgainst: 8 }],
    }),
    player({
      displayName: "Attaquant",
      minutes: 510,
      goals: 11,
      assists: 2,
      declarations: { AT: "primary" },
      ratingAverage: 7.75,
      ratingCount: 9,
      ratingVariance: 0.9,
      positions: [{ group: "AT", minutes: 510, goalsFor: 14, goalsAgainst: 7 }],
    }),
    // No shirt: he must still be representable, with a synthetic handle.
    player({ displayName: "Sans maillot", minutes: 180, jerseyNumber: null, declarations: { AT: "secondary" } }),
  ];
}

function built(kind: Parameters<typeof buildSevenPrompt>[0], context: string) {
  const candidates = squad();
  const cells = buildCells(kind, candidates, SLOTS).cells;
  return { candidates, ...buildSevenPrompt(kind, candidates, cells, SLOTS, context) };
}

describe("the handles", () => {
  it("is the shirt number, and a negative stand-in for a man without one", () => {
    const candidates = squad();
    const handles = sevenHandles(candidates);
    expect(handles.slice(0, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(handles[7]).toBe(-1);
    // No collision is possible: a real shirt is never negative.
    expect(new Set(handles).size).toBe(handles.length);
  });
});

describe("buildSevenPrompt", () => {
  it("names every eligible handle exactly once", () => {
    const { candidates, user } = built("offensive", "");
    for (const handle of sevenHandles(candidates)) {
      expect(user).toContain(`#${handle} —`);
    }
  });

  it("states the 1/2/2/1/1 shape", () => {
    expect(sevenShapeFr(SLOTS)).toBe("GB×1, DC×2, AIL×2, MC×1, AT×1");
    expect(built("offensive", "").user).toContain("GB×1, DC×2, AIL×2, MC×1, AT×1");
  });

  it("carries both the smoothed figure and the raw record behind it", () => {
    const { user } = built("offensive", "");
    expect(user).toContain("lissé");
    expect(user).toContain("brut");
    // The attaquant's raw goal record, as the cells hold it: 11 goals over 510 minutes.
    expect(user).toMatch(/11 sur 510′/);
  });

  it("says whether a man has ever kept goal", () => {
    const { user } = built("defensive", "");
    expect(user).toContain("a déjà gardé : oui");
    expect(user).toContain("a déjà gardé : non");
  });

  it("gives the ratings mean with the number of matches it rests on, and never an individual mark", () => {
    const { user } = built("notes", "");
    expect(user).toContain("7.75 sur 9 matchs notés");
    expect(user).toContain("notes : aucune");
  });

  it("includes the coach's context last, fenced, when he typed one", () => {
    const { user } = built("legende", "  Léo est blessé jusqu’en mars.  ");
    expect(user).toContain("Contexte donné par le coach");
    expect(user).toContain("Léo est blessé jusqu’en mars.");
    expect(user.indexOf("Contexte donné par le coach")).toBeGreaterThan(user.indexOf("Effectif :"));
    expect(user.trimEnd().endsWith("```")).toBe(true);
  });

  it("omits the context section entirely when there is none", () => {
    for (const context of ["", "   \n "]) {
      const { user } = built("legende", context);
      expect(user).not.toContain("Contexte");
      expect(user).not.toContain("```");
    }
  });

  it("leaks no identifier and no individual peer rating", () => {
    const { candidates, user } = built("notes", "rien à signaler");
    for (const candidate of candidates) {
      expect(user).not.toContain(candidate.id);
    }
    expect(user).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
    // The only rating in the prompt is the mean and its count: no per-rater line exists at all.
    expect(user.match(/notes :/g)?.length).toBe(candidates.length);
  });

  it("tells the model its job, the hard rules and that it answers in French", () => {
    const { system } = built("offensive", "");
    expect(system).toContain("exactement sept joueurs");
    expect(system).toContain("numéros de maillot");
    expect(system).toContain("déjà gardé");
    expect(system).toContain("tutoyant");
  });

  it("stays near the 1 600-token budget on a real-sized squad", () => {
    const { system, user } = built("legende", "Match de coupe, on joue serré.");
    // Four characters to a token is the usual rule of thumb; this is a budget check, not a measure.
    const tokens = (system.length + user.length) / 4;
    expect(tokens).toBeLessThan(2400);
  });
});

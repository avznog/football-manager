import { describe, expect, it } from "vitest";

import type { PositionSeason } from "./impact";
import { normalizeSevenContext, sevenFingerprint } from "./seven-cache";
import type { SevenCandidate } from "./sevens";

/** The fixture of `sevens.test.ts`, minus its auto-incrementing shirt: a key needs stable input. */
function player(overrides: Partial<SevenCandidate> & { displayName: string; jerseyNumber: number }) {
  const base: SevenCandidate = {
    id: overrides.displayName,
    displayName: overrides.displayName,
    jerseyNumber: overrides.jerseyNumber,
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
  if (overrides.outfieldMinutes === undefined) {
    merged.outfieldMinutes = merged.minutes - merged.gkMinutes;
  }
  return merged;
}

const at = (
  group: PositionSeason["group"],
  minutes: number,
  goalsFor: number,
  goalsAgainst: number,
): PositionSeason => ({ group, minutes, goalsFor, goalsAgainst });

const squad: SevenCandidate[] = [
  player({
    displayName: "Buteur",
    jerseyNumber: 9,
    minutes: 600,
    goals: 8,
    assists: 2,
    declarations: { AT: "primary" },
    positions: [at("AT", 600, 14, 9)],
  }),
  player({
    displayName: "Mur",
    jerseyNumber: 1,
    minutes: 300,
    gkMinutes: 300,
    concededWhileGk: 3,
    declarations: { GB: "primary" },
  }),
  player({
    displayName: "Ailier",
    jerseyNumber: 7,
    minutes: 450,
    goals: 3,
    assists: 6,
    ratingAverage: 7.25,
    ratingCount: 4,
    declarations: { AIL: "primary", MC: "secondary" },
    positions: [at("AIL", 450, 9, 6)],
  }),
];

const key = (context = "", candidates: readonly SevenCandidate[] = squad, competition: string | null = null) =>
  sevenFingerprint("offensive", competition, context, candidates);

describe("sevenFingerprint", () => {
  it("is stable across repeated calls", () => {
    expect(key()).toBe(key());
    expect(key("sans Buteur")).toBe(key("sans Buteur"));
  });

  it("is a hex sha-256", () => {
    expect(key()).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("changes when the context changes", () => {
    expect(key("Buteur est blessé")).not.toBe(key());
    expect(key("Buteur est blessé")).not.toBe(key("Mur est blessé"));
  });

  it("does not change on whitespace the reader cannot see", () => {
    expect(key("  Buteur   est\nblessé ")).toBe(key("Buteur est blessé"));
  });

  it("changes when a figure changes", () => {
    const scoredAgain = squad.map((candidate) =>
      candidate.displayName === "Buteur" ? { ...candidate, goals: candidate.goals + 1 } : candidate,
    );
    expect(key("", scoredAgain)).not.toBe(key());
  });

  it("changes when a declared post changes", () => {
    const moved = squad.map((candidate) =>
      candidate.displayName === "Ailier"
        ? { ...candidate, declarations: { AIL: "primary" as const } }
        : candidate,
    );
    expect(key("", moved)).not.toBe(key());
  });

  it("changes when the seven or the competition filter changes", () => {
    expect(sevenFingerprint("defensive", null, "", squad)).not.toBe(key());
    expect(key("", squad, "11111111-1111-1111-1111-111111111111")).not.toBe(key());
  });

  it("changes when a man joins or leaves the running", () => {
    expect(key("", squad.slice(0, 2))).not.toBe(key());
  });

  it("does not change when only the candidate order changes", () => {
    const reversed = [...squad].reverse();
    const rotated = [squad[1], squad[2], squad[0]];
    expect(key("", reversed)).toBe(key());
    expect(key("", rotated)).toBe(key());
    expect(key("sans Mur", reversed)).toBe(key("sans Mur"));
  });

  it("does not change when only an id the model never sees changes", () => {
    const reidentified = squad.map((candidate) => ({ ...candidate, id: `${candidate.id}-bis` }));
    expect(key("", reidentified)).toBe(key());
  });
});

describe("normalizeSevenContext", () => {
  it("collapses whitespace and trims", () => {
    expect(normalizeSevenContext("  deux   absents \n dimanche  ")).toBe("deux absents dimanche");
  });

  it("leaves an empty context empty", () => {
    expect(normalizeSevenContext("   \n ")).toBe("");
  });
});

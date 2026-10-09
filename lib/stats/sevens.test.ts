import { describe, expect, it } from "vitest";

import type { BestSevenSlot } from "./best-seven";
import type { PositionSeason } from "./impact";
import { solveSeven, type SevenCandidate, type SevenResult } from "./sevens";

function slot(id: string, positionCode: string): BestSevenSlot {
  return { id, positionCode, isGoalkeeper: positionCode === "GB" };
}

let jersey = 0;
function player(overrides: Partial<SevenCandidate> & { displayName: string }): SevenCandidate {
  jersey += 1;
  const base: SevenCandidate = {
    id: overrides.displayName,
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
  // Outfield minutes follow the totals unless a test says otherwise.
  if (overrides.outfieldMinutes === undefined) merged.outfieldMinutes = merged.minutes - merged.gkMinutes;
  return merged;
}

const at = (group: PositionSeason["group"], minutes: number, goalsFor: number, goalsAgainst: number) => ({
  group,
  minutes,
  goalsFor,
  goalsAgainst,
});

function pickedName(result: SevenResult, slotId: string): string | undefined {
  return result.picks.find((pick) => pick.slotId === slotId)?.player?.displayName;
}

const keeper = (name: string, gkMinutes: number, conceded: number, extra: Partial<SevenCandidate> = {}) =>
  player({
    displayName: name,
    minutes: gkMinutes,
    gkMinutes,
    concededWhileGk: conceded,
    declarations: { GB: "primary" },
    ...extra,
  });

describe("the offensive seven", () => {
  const slots = [slot("gb", "GB"), slot("at", "AT")];

  it("puts the most goals per hour up front, and the keeper who concedes least in goal", () => {
    const result = solveSeven("offensive", {
      slots,
      candidates: [
        player({ displayName: "Buteur", minutes: 600, goals: 8, declarations: { AT: "primary" } }),
        player({ displayName: "Passeur", minutes: 600, goals: 2, assists: 9, declarations: { AT: "primary" } }),
        keeper("Passoire", 300, 15),
        keeper("Mur", 300, 3),
      ],
    });
    expect(pickedName(result, "at")).toBe("Buteur");
    expect(pickedName(result, "gb")).toBe("Mur");
    expect(result.picks.find((pick) => pick.slotId === "at")?.cell?.figure).toBe("goals");
    expect(result.picks.find((pick) => pick.slotId === "gb")?.cell?.figure).toBe("keeperConceded");
  });

  it("lets assists decide between two scorers the screen prints alike", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Sans passe", minutes: 600, goals: 4, assists: 0, declarations: { AT: "primary" } }),
        player({ displayName: "Avec passes", minutes: 600, goals: 4, assists: 5, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Avec passes");
  });

  it("does not let assists outweigh a goal rate the screen prints higher", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Passeur", minutes: 600, goals: 1, assists: 20, declarations: { AT: "primary" } }),
        player({ displayName: "Buteur", minutes: 600, goals: 9, assists: 0, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Buteur");
  });

  it("keeps goal for somebody who has played there, even one the coach set elsewhere", () => {
    const result = solveSeven("offensive", {
      slots,
      candidates: [
        // Declared GB, never once in goal: refused there, « parmi ceux qui ont joué au goal ».
        player({ displayName: "Déclaré", minutes: 300, declarations: { GB: "primary", AT: "secondary" } }),
        player({
          displayName: "Dépanneur",
          minutes: 300,
          gkMinutes: 120,
          concededWhileGk: 2,
          declarations: { AT: "primary" },
        }),
      ],
    });
    expect(pickedName(result, "gb")).toBe("Dépanneur");
    expect(result.picks.find((pick) => pick.slotId === "gb")?.fit).toBe("none");
    expect(result.cells[result.candidates.findIndex((c) => c.id === "Déclaré")][0].allowed).toBe(false);
  });

  it("refuses nobody in goal when nobody has ever played there", () => {
    const result = solveSeven("offensive", {
      slots,
      candidates: [
        player({ displayName: "A", minutes: 300, declarations: { GB: "primary" } }),
        player({ displayName: "B", minutes: 300, goals: 3, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "gb")).toBe("A");
    expect(pickedName(result, "at")).toBe("B");
  });
});

describe("the defensive seven", () => {
  it("takes the outfielder who conceded least on the pitch, outside his time in goal", () => {
    const result = solveSeven("defensive", {
      slots: [slot("gb", "GB"), slot("dc", "DC")],
      candidates: [
        player({ displayName: "Rempart", minutes: 600, concededOutfield: 3, declarations: { DC: "primary" } }),
        // Conceded a lot in goal, little outfield: only the outfield count may judge him at DC.
        player({
          displayName: "Mixte",
          minutes: 600,
          gkMinutes: 300,
          concededWhileGk: 12,
          concededOutfield: 9,
          declarations: { DC: "primary" },
        }),
        keeper("Gardien", 600, 6),
      ],
    });
    expect(pickedName(result, "dc")).toBe("Rempart");
    expect(pickedName(result, "gb")).toBe("Gardien");
    expect(result.picks.find((pick) => pick.slotId === "dc")?.cell?.figure).toBe("outfieldConceded");
  });
});

describe("the 7 de légende", () => {
  it("fills the attack first, even when the total would rather have him at the back", () => {
    const result = solveSeven("legende", {
      slots: [slot("dc", "DC"), slot("at", "AT")],
      candidates: [
        // Star: best at AT and even better at DC. Second: nearly as good at AT, poor at DC. The sum
        // wants Star at DC and Second up front; « en commençant par l'attaque » wants Star up front.
        player({
          displayName: "Star",
          minutes: 6000,
          declarations: { AT: "primary", DC: "secondary" },
          positions: [at("AT", 3000, 150, 50), at("DC", 3000, 200, 50)],
        }),
        player({
          displayName: "Second",
          minutes: 6000,
          declarations: { AT: "primary", DC: "secondary" },
          positions: [at("AT", 3000, 140, 50), at("DC", 3000, 50, 100)],
        }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Star");
    expect(pickedName(result, "dc")).toBe("Second");
    expect(result.picks.find((pick) => pick.slotId === "at")?.cell?.figure).toBe("impact");
  });

  it("refuses a keeper worse than the squad's average, for a better outfielder with minutes in goal", () => {
    const result = solveSeven("legende", {
      slots: [slot("gb", "GB"), slot("dc", "DC")],
      candidates: [
        keeper("Gardien titulaire", 600, 30),
        player({
          displayName: "Joueur de champ",
          minutes: 600,
          gkMinutes: 180,
          concededWhileGk: 2,
          declarations: { DC: "primary" },
        }),
        player({ displayName: "Défenseur", minutes: 600, declarations: { DC: "primary" } }),
      ],
    });
    expect(pickedName(result, "gb")).toBe("Joueur de champ");
    expect(pickedName(result, "dc")).toBe("Défenseur");
    expect(result.keepersConsidered).toBe(2);
    expect(result.keepersRefused).toBe(1);
  });

  it("gives a man with no minutes at a post that post's average, not a zero", () => {
    const result = solveSeven("legende", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Habitué", minutes: 600, declarations: { AT: "primary" }, positions: [at("AT", 600, 2, 10)] }),
        player({ displayName: "Nouveau", minutes: 0, declarations: { AT: "primary" } }),
      ],
    });
    const cellOf = (name: string) => result.cells[result.candidates.findIndex((c) => c.id === name)][0];
    expect(cellOf("Nouveau").observed.denominator).toBe(0);
    // One man at AT: the position's mean is his own figure, so the newcomer is credited exactly that.
    expect(cellOf("Nouveau").adjusted).toBeCloseTo(cellOf("Habitué").adjusted as number);
  });
});

describe("positions are respected in every seven", () => {
  it("puts a declared man before an undeclared better one, primary before secondary", () => {
    for (const kind of ["offensive", "defensive", "legende", "notes"] as const) {
      const result = solveSeven(kind, {
        slots: [slot("at", "AT")],
        candidates: [
          player({ displayName: "Hors poste", minutes: 900, goals: 30, declarations: { DC: "primary" } }),
          player({ displayName: "Secondaire", minutes: 300, goals: 3, declarations: { AT: "secondary" } }),
          player({ displayName: "Titulaire", minutes: 300, goals: 1, declarations: { AT: "primary" } }),
        ],
      });
      expect(pickedName(result, "at"), kind).toBe("Titulaire");
      expect(result.outOfPositionCount, kind).toBe(0);
    }
  });

  it("still fills a post nobody declared, and counts it", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: [player({ displayName: "Seul", minutes: 300, declarations: { DC: "primary" } })],
    });
    expect(pickedName(result, "at")).toBe("Seul");
    expect(result.outOfPositionCount).toBe(1);
  });
});

describe("the notes seven", () => {
  it("is the old ratings seven", () => {
    const result = solveSeven("notes", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Noté 8", minutes: 300, ratingAverage: 8, ratingCount: 4, ratingVariance: 0.5, declarations: { AT: "primary" } }),
        player({ displayName: "Noté 5", minutes: 300, ratingAverage: 5, ratingCount: 4, ratingVariance: 0.5, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Noté 8");
    expect(result.picks[0].cell?.figure).toBe("ratings");
    expect(result.ratingsModel).not.toBeNull();
  });
});

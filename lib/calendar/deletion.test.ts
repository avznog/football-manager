import { describe, expect, it } from "vitest";

import { matchDeletionWarningFr } from "./deletion";

describe("matchDeletionWarningFr", () => {
  it("names the sheet and the compositions", () => {
    // An eleven-row sheet and two compositions: the old sentence — « avec les disponibilités
    // déclarées » — mentioned neither.
    const warning = matchDeletionWarningFr({ squad: 11, lineups: 2 });

    expect(warning).toBe(
      "Le match disparaît du calendrier, et avec lui la feuille de match et 2 compositions. " +
        "C’est définitif.",
    );
  });

  it("says a fresh match holds nothing", () => {
    expect(matchDeletionWarningFr({ squad: 0, lineups: 0 })).toBe(
      "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.",
    );
  });

  it("keeps « composition » singular for one", () => {
    expect(matchDeletionWarningFr({ squad: 0, lineups: 1 })).toBe(
      "Le match disparaît du calendrier, et avec lui 1 composition. C’est définitif.",
    );
  });

  it("does not count the sheet in players: it is one thing, whatever its length", () => {
    const eleven = matchDeletionWarningFr({ squad: 11, lineups: 0 });
    const one = matchDeletionWarningFr({ squad: 1, lineups: 0 });

    expect(eleven).toBe(one);
    expect(eleven).toContain("la feuille de match");
  });

  it("mentions every non-zero hold and nothing else", () => {
    const cases = [
      { squad: 0, lineups: 3 },
      { squad: 12, lineups: 0 },
      { squad: 12, lineups: 1 },
    ];

    for (const holds of cases) {
      const warning = matchDeletionWarningFr(holds);
      expect(warning.includes("disponibilité")).toBe(false);
      expect(warning.includes("feuille de match")).toBe(holds.squad > 0);
      expect(warning.includes("composition")).toBe(holds.lineups > 0);
    }
  });

  it("ends every non-empty warning on the word that makes a coach stop", () => {
    const warnings = [
      matchDeletionWarningFr({ squad: 1, lineups: 0 }),
      matchDeletionWarningFr({ squad: 9, lineups: 2 }),
    ];

    for (const warning of warnings) expect(warning.endsWith("C’est définitif.")).toBe(true);
  });
});

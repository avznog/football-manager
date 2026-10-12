import { describe, expect, it } from "vitest";

import { matchDeletionWarningFr, type MatchDeletionHolds } from "./deletion";

/** A fresh match: nothing hangs off it yet. */
const NOTHING: MatchDeletionHolds = { events: 0, ratings: 0, squad: 0, lineups: 0 };

const holds = (partial: Partial<MatchDeletionHolds>): MatchDeletionHolds => ({
  ...NOTHING,
  ...partial,
});

describe("matchDeletionWarningFr", () => {
  it("names the sheet and the compositions", () => {
    // An eleven-row sheet and two compositions: the old sentence — « avec les disponibilités
    // déclarées » — mentioned neither.
    const warning = matchDeletionWarningFr(holds({ squad: 11, lineups: 2 }));

    expect(warning).toBe(
      "Le match disparaît du calendrier, et avec lui la feuille de match et 2 compositions. " +
        "C’est définitif.",
    );
  });

  /**
   * The real match the owner would delete, and the sentence decision 191 exists for: until it, a
   * match with a log could not be deleted at all, so the two things worth stopping for — the déroulé
   * and the notes — were named nowhere.
   */
  it("names the déroulé and the notes first, and counts them", () => {
    expect(matchDeletionWarningFr({ events: 76, ratings: 342, squad: 12, lineups: 2 })).toBe(
      "Le match disparaît du calendrier, et avec lui 76 événements du déroulé, 342 notes, " +
        "la feuille de match et 2 compositions. C’est définitif.",
    );
  });

  it("says a fresh match holds nothing", () => {
    expect(matchDeletionWarningFr(NOTHING)).toBe(
      "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.",
    );
  });

  it("keeps « composition » singular for one", () => {
    expect(matchDeletionWarningFr(holds({ lineups: 1 }))).toBe(
      "Le match disparaît du calendrier, et avec lui 1 composition. C’est définitif.",
    );
  });

  it("keeps « événement » and « note » singular for one", () => {
    const warning = matchDeletionWarningFr(holds({ events: 1, ratings: 1 }));

    expect(warning).toContain("1 événement du déroulé");
    expect(warning).toContain("1 note");
    expect(warning).not.toContain("notes");
  });

  it("does not count the sheet in players: it is one thing, whatever its length", () => {
    const eleven = matchDeletionWarningFr(holds({ squad: 11 }));
    const one = matchDeletionWarningFr(holds({ squad: 1 }));

    expect(eleven).toBe(one);
    expect(eleven).toContain("la feuille de match");
  });

  it("mentions every non-zero hold and nothing else", () => {
    const cases = [
      holds({ lineups: 3 }),
      holds({ squad: 12 }),
      holds({ squad: 12, lineups: 1 }),
      holds({ events: 40 }),
      holds({ ratings: 121 }),
      holds({ events: 40, squad: 12 }),
    ];

    for (const each of cases) {
      const warning = matchDeletionWarningFr(each);
      expect(warning.includes("disponibilité")).toBe(false);
      expect(warning.includes("déroulé")).toBe(each.events > 0);
      expect(warning.includes("note")).toBe(each.ratings > 0);
      expect(warning.includes("feuille de match")).toBe(each.squad > 0);
      expect(warning.includes("composition")).toBe(each.lineups > 0);
    }
  });

  it("ends every non-empty warning on the word that makes a coach stop", () => {
    const warnings = [
      matchDeletionWarningFr(holds({ squad: 1 })),
      matchDeletionWarningFr(holds({ squad: 9, lineups: 2 })),
      matchDeletionWarningFr({ events: 76, ratings: 342, squad: 12, lineups: 2 }),
    ];

    for (const warning of warnings) expect(warning.endsWith("C’est définitif.")).toBe(true);
  });
});

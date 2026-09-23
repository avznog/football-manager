import { describe, expect, it } from "vitest";

import { matchDeletionWarningFr, trainingDeletionWarningFr } from "./deletion";

describe("matchDeletionWarningFr", () => {
  it("names the sheet and the compositions, not just the availability answers", () => {
    // The demo season's next match, exactly: eleven answers, an eleven-row sheet, two compositions.
    // The old sentence — « avec les disponibilités déclarées » — mentioned the first of those three.
    const warning = matchDeletionWarningFr({ answers: 11, squad: 11, lineups: 2 });

    expect(warning).toBe(
      "Le match disparaît du calendrier, et avec lui 11 réponses de disponibilité, " +
        "la feuille de match et 2 compositions. C’est définitif.",
    );
  });

  it("says a fresh match holds nothing rather than naming answers nobody gave", () => {
    expect(matchDeletionWarningFr({ answers: 0, squad: 0, lineups: 0 })).toBe(
      "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.",
    );
  });

  it("enumerates two things with « et » and no comma", () => {
    expect(matchDeletionWarningFr({ answers: 4, squad: 7, lineups: 0 })).toBe(
      "Le match disparaît du calendrier, et avec lui 4 réponses de disponibilité " +
        "et la feuille de match. C’est définitif.",
    );
  });

  it("keeps « réponse de disponibilité » singular for one answer", () => {
    expect(matchDeletionWarningFr({ answers: 1, squad: 0, lineups: 1 })).toBe(
      "Le match disparaît du calendrier, et avec lui 1 réponse de disponibilité " +
        "et 1 composition. C’est définitif.",
    );
  });

  it("does not count the sheet in players: it is one thing, whatever its length", () => {
    const eleven = matchDeletionWarningFr({ answers: 0, squad: 11, lineups: 0 });
    const one = matchDeletionWarningFr({ answers: 0, squad: 1, lineups: 0 });

    expect(eleven).toBe(one);
    expect(eleven).toContain("la feuille de match");
  });

  it("mentions every non-zero hold and nothing else", () => {
    const cases = [
      { answers: 0, squad: 0, lineups: 3 },
      { answers: 9, squad: 0, lineups: 0 },
      { answers: 0, squad: 12, lineups: 1 },
    ];

    for (const holds of cases) {
      const warning = matchDeletionWarningFr(holds);
      expect(warning.includes("disponibilité")).toBe(holds.answers > 0);
      expect(warning.includes("feuille de match")).toBe(holds.squad > 0);
      expect(warning.includes("composition")).toBe(holds.lineups > 0);
    }
  });
});

describe("trainingDeletionWarningFr", () => {
  it("names the attendance marks, which a coach can make before the séance", () => {
    // `AttendanceList` renders for a coach whether or not the session is over, and the delete button
    // only appears while it is *not* over — so marks on a deletable séance are reachable.
    expect(trainingDeletionWarningFr({ answers: 9, attendance: 13 })).toBe(
      "La séance disparaît du calendrier, et avec elle 9 réponses " +
        "et le pointage de 13 joueurs. C’est définitif.",
    );
  });

  it("says « avec elle », not « avec lui »", () => {
    const warning = trainingDeletionWarningFr({ answers: 2, attendance: 0 });
    expect(warning).toContain("avec elle");
    expect(warning).not.toContain("avec lui");
  });

  it("writes « d’un joueur » rather than « de 1 joueur »", () => {
    expect(trainingDeletionWarningFr({ answers: 0, attendance: 1 })).toBe(
      "La séance disparaît du calendrier, et avec elle le pointage d’un joueur. C’est définitif.",
    );
  });

  it("says a fresh séance holds nothing", () => {
    expect(trainingDeletionWarningFr({ answers: 0, attendance: 0 })).toBe(
      "La séance disparaît du calendrier. Rien d’autre n’y est encore rattaché.",
    );
  });

  it("ends every non-empty warning on the word that makes a coach stop", () => {
    const warnings = [
      matchDeletionWarningFr({ answers: 1, squad: 0, lineups: 0 }),
      trainingDeletionWarningFr({ answers: 1, attendance: 0 }),
    ];

    for (const warning of warnings) expect(warning.endsWith("C’est définitif.")).toBe(true);
  });
});

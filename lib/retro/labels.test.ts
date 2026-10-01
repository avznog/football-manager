import { describe, expect, it } from "vitest";

import { SCORE_SEPARATOR_FR, scoreLineFr } from "@/lib/calendar/labels";

import {
  RETRO_NO_FACTS_FR,
  RETRO_SCORE_EMPTY_FR,
  retroChangesEmptyFr,
  retroRecordedSummaryFr,
  retroScoreLineFr,
} from "./labels";

describe("retroChangesEmptyFr", () => {
  it("does not claim any titulaire when none has been chosen", () => {
    const text = retroChangesEmptyFr(0);

    expect(text).toContain("Aucun changement");
    expect(text).toContain("composition de départ est vide");
    expect(text).not.toContain("titulaires");
    expect(text).not.toContain("ont fini le match");
  });

  it("says what to do next when the sheet is empty, instead of describing a match", () => {
    expect(retroChangesEmptyFr(0)).toContain("personne à remplacer");
  });

  it("never claims seven titulaires when fewer are filled in", () => {
    expect(retroChangesEmptyFr(3)).toContain("les 3 titulaires");
    expect(retroChangesEmptyFr(3)).not.toContain("sept");
  });

  it("agrees in number for a single titulaire", () => {
    const text = retroChangesEmptyFr(1);

    expect(text).toContain("le titulaire choisi");
    expect(text).not.toContain("titulaires");
  });

  it("counts the seven of a full sheet", () => {
    expect(retroChangesEmptyFr(7)).toBe(
      "Aucun changement : les 7 titulaires choisis ci-dessus ont fini le match.",
    );
  });

  it("treats a negative count like an empty sheet rather than printing it", () => {
    expect(retroChangesEmptyFr(-1)).toBe(retroChangesEmptyFr(0));
  });

  it("points at the composition card above, which is where the number comes from", () => {
    expect(retroChangesEmptyFr(7)).toContain("ci-dessus");
  });
});

describe("RETRO_NO_FACTS_FR", () => {
  it("writes its scoreline the way every other screen does (decisions 061 and 064)", () => {
    expect(RETRO_NO_FACTS_FR).toContain("0 – 0");
    expect(RETRO_NO_FACTS_FR).not.toContain("0-0");
  });

  it("does not name a card, a thing this app never records", () => {
    expect(RETRO_NO_FACTS_FR).not.toContain("carton");
  });

  it("says the empty sheet is a legitimate state, not a missing step", () => {
    expect(RETRO_NO_FACTS_FR).toContain("ça existe");
  });
});

describe("retroScoreLineFr", () => {
  it("never gets a 0 – 0 out of a sheet with no goal on it", () => {
    // Also the sheet holding a foul and nothing else: `goalActions` counts score-bearing rows
    // only, so a fact that cannot move the score leaves the card silent.
    expect(retroScoreLineFr({ goalActions: 0, goalsFor: 0, goalsAgainst: 0 })).toBeNull();
  });

  it("prints the derived scoreline once a goal has been entered", () => {
    expect(retroScoreLineFr({ goalActions: 4, goalsFor: 3, goalsAgainst: 1 })).toBe("3 – 1");
  });

  it("prints a real 0 – 0 the coach built, when the goals cancelled out", () => {
    // Two goals entered, one each way: there *is* something to state, and it is a draw.
    expect(retroScoreLineFr({ goalActions: 2, goalsFor: 1, goalsAgainst: 1 })).toBe("1 – 1");
    expect(retroScoreLineFr({ goalActions: 1, goalsFor: 0, goalsAgainst: 1 })).toBe("0 – 1");
  });

  it("writes its separator with the en dash of scoreLineFr, never a hyphen (decision 064)", () => {
    const line = retroScoreLineFr({ goalActions: 1, goalsFor: 2, goalsAgainst: 0 });

    expect(line).toBe(`2${SCORE_SEPARATOR_FR}0`);
    expect(line).toContain("–");
    expect(line).not.toContain("-");
  });

  it("decides whether to print, never what: the figures pass through untouched", () => {
    // Decision 047: the numbers are the reducer's. This function must not count anything.
    expect(retroScoreLineFr({ goalActions: 1, goalsFor: 7, goalsAgainst: 3 })).toBe(
      scoreLineFr(7, 3),
    );
  });

  it("treats a negative count like an empty sheet", () => {
    expect(retroScoreLineFr({ goalActions: -1, goalsFor: 1, goalsAgainst: 0 })).toBeNull();
  });
});

describe("RETRO_SCORE_EMPTY_FR", () => {
  it("makes no claim about the match: no team, no result, no figure", () => {
    expect(RETRO_SCORE_EMPTY_FR).not.toMatch(/\d/);
    expect(RETRO_SCORE_EMPTY_FR).not.toContain("–");
    expect(RETRO_SCORE_EMPTY_FR).not.toMatch(/Victoire|Défaite|Match nul|adversaire|équipe/);
  });

  it("never vouvoies (decision 074)", () => {
    expect(RETRO_SCORE_EMPTY_FR).not.toMatch(/\bvous\b|\bvotre\b/i);
  });

  it("says only that the sheet is empty: where the score comes from is the card's description", () => {
    // Printed two lines under « Déduit des buts que tu ajoutes ci-dessous. », so repeating that
    // clause here — which the first draft did — is the same sentence twice on one card at 390 px.
    expect(RETRO_SCORE_EMPTY_FR).toBe("Aucun but saisi pour l’instant.");
    expect(RETRO_SCORE_EMPTY_FR).not.toContain("ci-dessous");
  });
});

describe("retroRecordedSummaryFr", () => {
  it("agrees in number for the players count at 0, 1 and n", () => {
    expect(retroRecordedSummaryFr({ playersWithMinutes: 0, guessedStamps: 0 })).toBe(
      "Aucun joueur avec des minutes pour l’instant",
    );
    expect(retroRecordedSummaryFr({ playersWithMinutes: 1, guessedStamps: 0 })).toBe(
      "1 joueur avec des minutes",
    );
    expect(retroRecordedSummaryFr({ playersWithMinutes: 9, guessedStamps: 0 })).toBe(
      "9 joueurs avec des minutes",
    );
  });

  it("never prints « 1 joueurs », the string D52 quotes", () => {
    expect(retroRecordedSummaryFr({ playersWithMinutes: 1, guessedStamps: 0 })).not.toContain(
      "1 joueurs",
    );
    expect(retroRecordedSummaryFr({ playersWithMinutes: 0, guessedStamps: 0 })).not.toContain(
      "0 joueurs",
    );
  });

  it("drops the guessed-stamp clause entirely when every minute was typed", () => {
    const text = retroRecordedSummaryFr({ playersWithMinutes: 7, guessedStamps: 0 });

    expect(text).not.toContain("·");
    expect(text).not.toContain("sans minute précise");
  });

  it("agrees in number and in gender for one guessed stamp", () => {
    expect(retroRecordedSummaryFr({ playersWithMinutes: 7, guessedStamps: 1 })).toBe(
      "7 joueurs avec des minutes · 1 action sans minute précise, placée au mieux",
    );
  });

  it("agrees in number for several guessed stamps, participle included", () => {
    expect(retroRecordedSummaryFr({ playersWithMinutes: 7, guessedStamps: 3 })).toBe(
      "7 joueurs avec des minutes · 3 actions sans minute précise, placées au mieux",
    );
  });

  it("treats negative counts like zero rather than printing them", () => {
    expect(retroRecordedSummaryFr({ playersWithMinutes: -2, guessedStamps: -1 })).toBe(
      retroRecordedSummaryFr({ playersWithMinutes: 0, guessedStamps: 0 }),
    );
  });
});

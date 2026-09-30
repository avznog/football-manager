/**
 * The copy's tests.
 *
 * Wording is not usually worth a test. It is here, because four of these sentences exist to stop the
 * screen from stating something untrue, and each has a branch that is exactly the lie it was written
 * to prevent: a shrinkage sentence quoting a clamp as though it were a measurement, a « meilleure
 * équipe » heading over a seven the reader has edited, a « sur 0 note » under a player nobody rated.
 * Those branches are what is pinned below.
 */

import { describe, expect, it } from "vitest";

import type { ObservedFigure, ShrinkageReport } from "./best-seven";
import {
  CLEAN_SHEET_READINGS_FR,
  CRITERION_PARAM,
  DECLARED_POSTS_FR,
  DEFAULT_CRITERION,
  DEFAULT_DIRECTION,
  DIRECTION_PARAM,
  FORMATION_PARAM,
  cleanSheetReadingsFr,
  declaredPostsFr,
  emptySlotsFr,
  equipeTypeHref,
  excludedFromSquadFr,
  formatCriterionValue,
  formationOverrideFr,
  formationUsageFr,
  goalkeeperShrinkageSentenceFr,
  matchesWithoutCompositionFr,
  noBasisFr,
  observedFigureFr,
  optimumComparisonFr,
  outOfPositionNoteFr,
  parseCriterion,
  parseDirection,
  resetLabelFr,
  sevenHeadingFr,
  shrinkageSentenceFr,
  swapAnnouncementFr,
  viewerRelativeRatingsFr,
} from "./best-seven-copy";

const report = (overrides: Partial<ShrinkageReport> = {}): ShrinkageReport => ({
  squadMean: 0.5,
  priorStrength: 4,
  measured: 4,
  clamp: [2, 10],
  unit: "ratings",
  withinPlayerVariance: 1,
  betweenPlayerVariance: 0.25,
  source: "allPitch",
  ...overrides,
});

const observed = (overrides: Partial<ObservedFigure> = {}): ObservedFigure => ({
  rate: 9,
  numerator: 9,
  denominator: 1,
  denominatorUnit: "ratings",
  exposure: 1,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* The query string                                                           */
/* -------------------------------------------------------------------------- */

describe("reading the query string", () => {
  it("falls back to the defaults on anything it does not recognise", () => {
    expect(parseCriterion(undefined)).toBe(DEFAULT_CRITERION);
    expect(parseCriterion("bidon")).toBe(DEFAULT_CRITERION);
    expect(parseCriterion(["ratings", "goals"])).toBe("ratings");
    expect(parseDirection(undefined)).toBe(DEFAULT_DIRECTION);
    expect(parseDirection("meilleur")).toBe("best");
    expect(parseDirection("pire")).toBe("worst");
    expect(parseDirection("PIRE")).toBe("best");
  });

  it("opens on a criterion every reader can see", () => {
    // Decision 021 hides a ratings average from a reader who has not voted, so the default must not
    // be `ratings` or a non-voter's first visit is an empty screen he will read as a bug.
    expect(DEFAULT_CRITERION).not.toBe("ratings");
  });

  it("omits every default from the URL, and round-trips what it keeps", () => {
    expect(
      equipeTypeHref({
        competitionId: null,
        criterion: DEFAULT_CRITERION,
        direction: DEFAULT_DIRECTION,
        formationId: null,
      }),
    ).toBe("/stats/equipe-type");

    const href = equipeTypeHref({
      competitionId: "c1",
      criterion: "ratings",
      direction: "worst",
      formationId: "f1",
    });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("competition")).toBe("c1");
    expect(params.get(CRITERION_PARAM)).toBe("ratings");
    expect(params.get(FORMATION_PARAM)).toBe("f1");
    expect(parseDirection(params.get(DIRECTION_PARAM) ?? undefined)).toBe("worst");
  });
});

/* -------------------------------------------------------------------------- */
/* The figures                                                                */
/* -------------------------------------------------------------------------- */

describe("printing a figure", () => {
  it("writes each criterion in its own scale", () => {
    expect(formatCriterionValue("goals", 0.75)).toBe("0,75/h");
    expect(formatCriterionValue("assists", 1)).toBe("1,00/h");
    expect(formatCriterionValue("ratings", 7.04)).toBe("7,0");
    // The space before the `%` is the non-breaking one French typography requires, spelled as an
    // escape so a copy-paste cannot quietly turn it into an ordinary space.
    expect(formatCriterionValue("cleanSheet", 0.42)).toBe("42 %");
  });

  it("prints a dash, never a zero, for a figure nobody has", () => {
    expect(formatCriterionValue("goals", null)).toBe("—");
  });

  it("carries the denominator beside the raw figure", () => {
    expect(observedFigureFr("ratings", observed())).toBe("9,0 sur 1 note");
    expect(
      observedFigureFr("goals", {
        rate: 0.75,
        numerator: 3,
        denominator: 240,
        denominatorUnit: "minutes",
        exposure: 4,
      }),
    ).toBe("3 buts sur 240′");
    expect(
      observedFigureFr("cleanSheet", {
        rate: 0.5,
        numerator: 120,
        denominator: 240,
        denominatorUnit: "minutes",
        exposure: 240,
      }),
    ).toBe("120′ sur 240′");
  });

  it("says nothing rather than « sur 0 note » when the denominator is empty", () => {
    expect(observedFigureFr("ratings", observed({ rate: null, numerator: 0, denominator: 0 }))).toBeNull();
    expect(observedFigureFr("ratings", observed({ denominator: 0 }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The heading, decision 087                                                  */
/* -------------------------------------------------------------------------- */

describe("the heading", () => {
  it("stops claiming to be the optimum the moment the reader swaps anybody", () => {
    expect(sevenHeadingFr("best", false)).toBe("La meilleure équipe");
    expect(sevenHeadingFr("worst", false)).toBe("La pire équipe");
    expect(sevenHeadingFr("best", true)).toBe("Ton équipe");
    expect(sevenHeadingFr("worst", true)).toBe("Ton équipe");
  });

  it("keeps the optimum's own figure beside it, and offers the way back", () => {
    expect(optimumComparisonFr("best", "2,15/h")).toBe("La meilleure équipe : 2,15/h");
    expect(optimumComparisonFr("worst", "—")).toBe("La pire équipe : —");
    expect(resetLabelFr("best")).toBe("Revenir à la meilleure");
    expect(resetLabelFr("worst")).toBe("Revenir à la pire");
  });

  it("says out loud which two discs a tap moved", () => {
    const swap = swapAnnouncementFr({
      incoming: "Karim",
      outgoing: "Momo",
      positionCode: "AT",
      fromPositionCode: "MC",
    });
    expect(swap).toContain("Karim");
    expect(swap).toContain("Momo");
    expect(swap).toContain("échangé");

    expect(
      swapAnnouncementFr({
        incoming: "Karim",
        outgoing: "Momo",
        positionCode: "AT",
        fromPositionCode: null,
      }),
    ).toContain("remplace");

    expect(
      swapAnnouncementFr({
        incoming: "Karim",
        outgoing: null,
        positionCode: "AT",
        fromPositionCode: null,
      }),
    ).toContain("prend le poste");
  });
});

/* -------------------------------------------------------------------------- */
/* The four honesty sentences                                                 */
/* -------------------------------------------------------------------------- */

describe("honesty 1 — the posts are declarations", () => {
  it("says the app measures no time per post", () => {
    expect(DECLARED_POSTS_FR).toContain("déclaré");
    expect(DECLARED_POSTS_FR).toContain("ne mesure nulle part le temps passé à chaque poste");
  });

  it("never calls the pire équipe the best at anything", () => {
    // The whole sentence used to end « qui est le meilleur sur le critère choisi » whatever the
    // direction, and `?sens=pire` printed it under a seven of the *worst* seven men.
    expect(declaredPostsFr("best")).toContain("qui est le meilleur sur le critère choisi");
    expect(declaredPostsFr("worst")).not.toContain("meilleur");
    expect(declaredPostsFr("worst")).toContain("le moins en avant sur le critère choisi");
    expect(declaredPostsFr("worst")).toContain(DECLARED_POSTS_FR);
  });

  it("explains a « pas son poste » badge, and says nothing when there is none", () => {
    expect(outOfPositionNoteFr(0)).toBeNull();
    expect(outOfPositionNoteFr(1)).toContain("1 poste est tenu");
    expect(outOfPositionNoteFr(2)).toContain("2 postes sont tenus");
  });
});

describe("honesty 2 — a ratings seven belongs to one reader", () => {
  it("uses the prescribed wording, on the ratings criterion only", () => {
    const note = viewerRelativeRatingsFr("ratings");
    expect(note).toContain("d’après les matchs que tu as notés");
    expect(note).toContain("ne voit pas le même sept");

    // Goals, assists and minutes are the event log: everybody sees the same ones, so a caveat here
    // would be a caveat about something that is not happening.
    expect(viewerRelativeRatingsFr("goals")).toBeNull();
    expect(viewerRelativeRatingsFr("assists")).toBeNull();
    expect(viewerRelativeRatingsFr("cleanSheet")).toBeNull();
  });
});

describe("honesty 3 — what the shrinkage did", () => {
  it("quotes the measured prior strength in its own unit", () => {
    expect(shrinkageSentenceFr("ratings", report())).toContain("à hauteur de 4 notes");
    expect(
      shrinkageSentenceFr("goals", report({ unit: "sixtyMinutes", priorStrength: 3, measured: 3 })),
    ).toContain("à hauteur de 3,0 heures de jeu");
    expect(
      shrinkageSentenceFr("goals", report({ unit: "sixtyMinutes", priorStrength: 1, measured: 1 })),
    ).toContain("1,0 heure de jeu");
    expect(
      shrinkageSentenceFr(
        "cleanSheet",
        report({ unit: "minutes", priorStrength: 120, measured: 120 }),
      ),
    ).toContain("à hauteur de 120′");
  });

  it("prints no number at all when the prior strength could not be measured", () => {
    // The clamp's ceiling is not a measurement, and printing it would make the screen quote a number
    // it cannot justify — the one thing rule 3 returns `measured` separately in order to avoid.
    const sentence = shrinkageSentenceFr("ratings", report({ measured: null, priorStrength: 10 }));

    expect(sentence).toContain("le plus fort possible");
    expect(sentence).toContain("ne peut pas te dire de combien");
    expect(sentence).not.toMatch(/\d/);
  });

  it("states the keepers' own model in the same words, and only when there is one", () => {
    expect(goalkeeperShrinkageSentenceFr("cleanSheet", null)).toBeNull();
    const sentence = goalkeeperShrinkageSentenceFr(
      "cleanSheet",
      report({ unit: "minutes", priorStrength: 90, measured: 90, source: "goalkeeper" }),
    );
    expect(sentence).toContain("Pour le gardien");
    expect(sentence).toContain("à hauteur de 90′");
  });
});

describe("honesty 4 — which invincibilité", () => {
  it("names both of decision 011's readings, only on the criterion that has two", () => {
    expect(cleanSheetReadingsFr("cleanSheet")).toBe(CLEAN_SHEET_READINGS_FR);
    expect(cleanSheetReadingsFr("goals")).toBeNull();
    expect(CLEAN_SHEET_READINGS_FR).toContain("deux façons de compter l’invincibilité");
    expect(CLEAN_SHEET_READINGS_FR).toContain("dans les buts sans encaisser");
    expect(CLEAN_SHEET_READINGS_FR).toContain("sur le terrain sans encaisser");
  });

  it("never spells it a third way", () => {
    // The repo already has two spellings of this and `docs/ROADMAP.md` logs that as debt.
    expect(CLEAN_SHEET_READINGS_FR.toLowerCase()).not.toContain("clean sheet");
    expect(CLEAN_SHEET_READINGS_FR.toLowerCase()).not.toContain("cage inviolée");
  });
});

/* -------------------------------------------------------------------------- */
/* The shape, the squad and the missing cases                                 */
/* -------------------------------------------------------------------------- */

describe("the shape and the squad", () => {
  it("never names a formation without the matches behind it", () => {
    expect(formationUsageFr({ label: "1-3-2-1", matches: 7, matchesConsidered: 8 })).toBe(
      "1-3-2-1, utilisée dans 7 matchs sur les 8 matchs terminés de cette sélection.",
    );
    expect(formationUsageFr({ label: "1-3-2-1", matches: 8, matchesConsidered: 8 })).toContain(
      "tous ceux de cette sélection",
    );
  });

  it("claims no usage for a shape the reader chose himself", () => {
    expect(formationOverrideFr("2-3-1")).toContain("choisie par toi");
    expect(formationOverrideFr("2-3-1")).toContain("n’est pas la forme que l’équipe a le plus jouée");
  });

  it("says when the winning shape is a majority of what was drawn, not of what was played", () => {
    expect(matchesWithoutCompositionFr(0)).toBeNull();
    expect(matchesWithoutCompositionFr(1)).toContain("1 match terminé n’a aucune");
    expect(matchesWithoutCompositionFr(3)).toContain("3 matchs terminés n’ont aucune");
  });

  it("names who could not be chosen from, in singular and plural", () => {
    expect(excludedFromSquadFr({ departedWithData: 0, nonPlayers: 0 })).toBeNull();
    expect(excludedFromSquadFr({ departedWithData: 1, nonPlayers: 0 })).toContain("1 joueur parti a");
    expect(excludedFromSquadFr({ departedWithData: 2, nonPlayers: 0 })).toContain(
      "2 joueurs partis ont",
    );
    expect(excludedFromSquadFr({ departedWithData: 0, nonPlayers: 1 })).toContain(
      "1 membre de l’encadrement n’est pas joueur",
    );
  });

  it("admits an empty post rather than drawing six men as a seven", () => {
    expect(emptySlotsFr(0)).toBeNull();
    expect(emptySlotsFr(1)).toContain("1 poste reste vide");
    expect(emptySlotsFr(2)).toContain("2 postes restent vides");
  });

  it("says a seven with no basis is a placement, not a ranking", () => {
    expect(noBasisFr("goals")).toContain("Personne n’a encore de chiffre");
    expect(noBasisFr("goals")).toContain("placement par postes déclarés");
  });
});

/* -------------------------------------------------------------------------- */
/* The house rule the whole screen leans on                                   */
/* -------------------------------------------------------------------------- */

describe("the tutoiement (decision 074)", () => {
  it("never uses « vous » or « votre » anywhere in this screen's copy", () => {
    const everything = [
      declaredPostsFr("best"),
      declaredPostsFr("worst"),
      CLEAN_SHEET_READINGS_FR,
      viewerRelativeRatingsFr("ratings"),
      shrinkageSentenceFr("ratings", report()),
      shrinkageSentenceFr("ratings", report({ measured: null })),
      outOfPositionNoteFr(2),
      excludedFromSquadFr({ departedWithData: 2, nonPlayers: 1 }),
      emptySlotsFr(2),
      noBasisFr("cleanSheet"),
      matchesWithoutCompositionFr(2),
      formationOverrideFr("2-3-1"),
    ].join(" ");

    expect(everything).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
  });
});

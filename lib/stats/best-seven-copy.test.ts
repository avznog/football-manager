/**
 * The copy's tests.
 *
 * Wording is not usually worth a test. It is here, because four of these sentences exist to stop the
 * screen from stating something untrue, and each has a branch that is exactly the lie it was written
 * to prevent: a shrinkage sentence quoting a clamp as though it were a measurement, a « meilleure
 * équipe » heading over a seven the reader has edited, a « sur 0 note » under a player nobody rated.
 * Those branches are what is pinned below.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import type { ObservedFigure, ShrinkageReport } from "./best-seven";
import {
  CRITERION_PARAM,
  DECLARED_POSTS_FR,
  DEFAULT_SEVEN,
  KEEPER_REFUSED_BADGE_FR,
  SEVEN_CONTROL_LABEL_FR,
  SEVEN_OPTION_FR,
  SEVEN_RULE_FR,
  aggregationLabelFr,
  declaredPostsFr,
  emptySlotsFr,
  equipeTypeHref,
  excludedFromSquadFr,
  formatSevenFigure,
  keeperRuleFr,
  observedFigureFr,
  optimumComparisonFr,
  outOfPositionNoteFr,
  parseCompetitionId,
  parseSeven,
  resetLabelFr,
  sevenObservedFr,
  sevenSmoothingFr,
  squadMeanStandInShortFr,
  sevenHeadingFr,
  sevenQuestionKey,
  showsCompetitionSelect,
  shrinkageSentenceFr,
  squadMeanStandInFr,
  swapAnnouncementFr,
  type BestSevenQuery,
} from "./best-seven-copy";

const report = (overrides: Partial<ShrinkageReport> = {}): ShrinkageReport => ({
  squadMean: 0.5,
  priorStrength: 4,
  measured: 4,
  unmeasurable: null,
  clamp: [2, 10],
  unit: "ratedMatches",
  withinPlayerVariance: 1,
  betweenPlayerVariance: 0.25,
  source: "allPitch",
  ...overrides,
});

const observed = (overrides: Partial<ObservedFigure> = {}): ObservedFigure => ({
  rate: 9,
  numerator: 9,
  denominator: 1,
  denominatorUnit: "ratedMatches",
  exposure: 1,
  ...overrides,
});

/* -------------------------------------------------------------------------- */
/* The query string                                                           */
/* -------------------------------------------------------------------------- */

describe("reading the query string", () => {
  it("reads the four sevens, and falls back to the default on anything else", () => {
    expect(parseSeven("defensive")).toBe("defensive");
    expect(parseSeven("legende")).toBe("legende");
    expect(parseSeven("notes")).toBe("notes");
    expect(parseSeven(["notes", "legende"])).toBe("notes");
    expect(parseSeven(undefined)).toBe(DEFAULT_SEVEN);
    expect(parseSeven("bidon")).toBe(DEFAULT_SEVEN);
  });

  it("lands an old bookmark on the default seven rather than on an error", () => {
    // The four values of the criterion select before decision 171.
    for (const old of ["goals", "assists", "ratings", "cleanSheet"]) {
      expect(parseSeven(old)).toBe(DEFAULT_SEVEN);
    }
    expect(DEFAULT_SEVEN).toBe("offensive");
  });

  it("omits the default from the URL, and round-trips what it keeps", () => {
    expect(equipeTypeHref({ competitionId: null, seven: DEFAULT_SEVEN })).toBe("/stats/equipe-type");

    const href = equipeTypeHref({ competitionId: "c1", seven: "legende" });
    const params = new URLSearchParams(href.split("?")[1]);
    expect(params.get("competition")).toBe("c1");
    expect(parseSeven(params.get(CRITERION_PARAM) ?? undefined)).toBe("legende");
    // No direction any more, and one formation (decision 157): nothing else travels.
    expect([...params.keys()].sort()).toEqual(["competition", CRITERION_PARAM].sort());
  });

  /**
   * The no-JavaScript path: the controls are `<select>`s inside a `<form method="get">`, so a browser
   * with no JavaScript submits every name it holds, including `?critere=` and an old `?sens=`.
   */
  it("reads an empty value as « nothing chosen », on every parameter", () => {
    const competitions = [{ id: "c1" }, { id: "c2" }];

    expect(parseSeven("")).toBe(DEFAULT_SEVEN);
    expect(parseCompetitionId("", competitions)).toBeNull();

    const params = new URLSearchParams("critere=&sens=pire&competition=");
    expect(parseSeven(params.get(CRITERION_PARAM) ?? undefined)).toBe(DEFAULT_SEVEN);
    expect(parseCompetitionId(params.get("competition") ?? undefined, competitions)).toBeNull();
  });

  it("keeps a competition only if the team has it", () => {
    const competitions = [{ id: "c1" }, { id: "c2" }];
    expect(parseCompetitionId("c2", competitions)).toBe("c2");
    expect(parseCompetitionId(["c1", "c2"], competitions)).toBe("c1");
    // A stale bookmark from a deleted competition degrades to « toutes », never to an error.
    expect(parseCompetitionId("c9", competitions)).toBeNull();
    expect(parseCompetitionId(undefined, competitions)).toBeNull();
    expect(parseCompetitionId("c1", [])).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The key that throws the previous answer away                                */
/* -------------------------------------------------------------------------- */

describe("keying the pitch to the question", () => {
  const query: BestSevenQuery = { competitionId: null, seven: "offensive" };

  it("changes with every value that changes which seven is right", () => {
    const base = sevenQuestionKey(query);
    expect(sevenQuestionKey({ ...query, seven: "notes" })).not.toBe(base);
    expect(sevenQuestionKey({ ...query, competitionId: "c1" })).not.toBe(base);
  });

  it("is the same key for the same question, asked twice", () => {
    expect(sevenQuestionKey({ ...query })).toBe(sevenQuestionKey({ ...query }));
  });
});

/**
 * Decision 097's rule again, in the one place a unit test cannot reach: the function above is worth
 * nothing unless the page actually hands it to React as a `key`, and a component's identity is invisible
 * to Vitest, which collects `lib/**` and nothing under `app/`.
 *
 * What this guards is measured, not imagined. Without the `key`, choosing « La pire » navigated to
 * `?sens=pire` and the pitch kept the best seven under the heading « Ton équipe » — the reader credited
 * with a lineup he had never touched.
 */
describe("the page hands that key to the pitch", () => {
  const page = readFileSync(
    join(process.cwd(), "app", "(app)", "stats", "equipe-type", "page.tsx"),
    "utf8",
  );

  it("renders the pitch at all, so this scan is not walking an empty file", () => {
    expect(page).toContain("<SevenPitch");
  });

  it("gives every <SevenPitch> a key, built by sevenQuestionKey", () => {
    const tags = page.split("<SevenPitch").slice(1);
    expect(tags).toHaveLength(1);
    for (const tag of tags) {
      const end = tag.indexOf("/>");
      expect(end).toBeGreaterThan(0);
      const props = tag.slice(0, end);
      expect(props).toContain("key={");
      expect(props).toContain("sevenQuestionKey(");
    }
  });

  /**
   * The rejected alternative, pinned so it cannot creep back: an effect that copied `optimumBySlot` into
   * state would overwrite the reader's own swaps, which this screen allows on purpose.
   */
  it("does not sync the seven with an effect instead", () => {
    const pitch = readFileSync(
      join(process.cwd(), "app", "(app)", "stats", "equipe-type", "_components", "seven-pitch.tsx"),
      "utf8",
    );
    expect(pitch).not.toContain("useEffect");
  });
});

/* -------------------------------------------------------------------------- */
/* The controls, which are the only writers of that query string               */
/* -------------------------------------------------------------------------- */

describe("naming the controls", () => {
  it("labels every select, and tutoies nobody into « vous »", () => {
    const labels = Object.values(SEVEN_CONTROL_LABEL_FR);
    // Which seven, and the competition: the shape and the direction are gone (decisions 157, 171).
    expect(labels).toHaveLength(2);
    for (const label of labels) {
      expect(label).not.toMatch(/\bvo(tre|s)\b/i);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("names the four sevens of the cahier, each with its rule", () => {
    expect(Object.keys(SEVEN_OPTION_FR)).toEqual(["offensive", "defensive", "legende", "notes"]);
    expect(SEVEN_OPTION_FR.legende).toBe("7 de légende");
    expect(SEVEN_RULE_FR.offensive).toContain("buts par heure, puis de passes décisives");
    expect(SEVEN_RULE_FR.defensive).toContain("le moins de buts encaissés");
    expect(SEVEN_RULE_FR.legende).toContain("de l’attaque vers la défense");
    expect(SEVEN_RULE_FR.legende).toContain("moyenne des gardiens");
  });

  /**
   * The same rule, on the one control that broke it. Both empty states print « Choisis « Toutes » pour
   * voir la saison entière » whenever a competition is being filtered on, and the select used to appear
   * only for a team with two or more — so a single-competition team with a bookmarked `?competition=<id>`
   * read an instruction with no control under it and no way back to the season.
   */
  it("keeps the competition select for a reader who arrived filtered", () => {
    expect(showsCompetitionSelect({ competitionCount: 1, competitionId: "c1" })).toBe(true);
    // The case that made the sentence a lie: one competition, one filtered URL.
    expect(showsCompetitionSelect({ competitionCount: 1, competitionId: null })).toBe(false);
    // More than one is a choice worth offering whether or not anything is filtered.
    expect(showsCompetitionSelect({ competitionCount: 2, competitionId: null })).toBe(true);
    expect(showsCompetitionSelect({ competitionCount: 2, competitionId: "c2" })).toBe(true);
    // A team with no competitions at all has nothing to filter by, and `parseCompetitionId` has already
    // turned any id into null by the time this is asked.
    expect(showsCompetitionSelect({ competitionCount: 0, competitionId: null })).toBe(false);
  });

  /**
   * Decision 097's rule once more: the predicate above is worth nothing if the form keeps its own copy
   * of the condition, which is precisely the shape the defect had — `competitions.length > 1` typed into
   * the JSX, where no test could reach it.
   */
  it("asks that predicate instead of counting the competitions itself", () => {
    const controls = readFileSync(
      join(process.cwd(), "app", "(app)", "stats", "equipe-type", "_components", "controls.tsx"),
      "utf8",
    );
    expect(controls).toContain("showsCompetitionSelect({");
    expect(controls).not.toContain("competitions.length > 1");
  });
});

/* -------------------------------------------------------------------------- */
/* The figures                                                                */
/* -------------------------------------------------------------------------- */

describe("printing a figure", () => {
  it("writes each cell's figure in its own scale", () => {
    expect(formatSevenFigure("goals", 0.75)).toBe("0,75/h");
    expect(formatSevenFigure("ratings", 7.04)).toBe("7,0");
    // A conceded rate per 60 is read as minutes per goal, as on `/stats` (decision 162).
    expect(formatSevenFigure("keeperConceded", 2.5)).toBe("1 but/24′");
    expect(formatSevenFigure("outfieldConceded", 0)).toBe("aucun but");
    expect(formatSevenFigure("impact", 1.24)).toBe("+1,2/h");
    expect(formatSevenFigure("impact", -0.76)).toBe("−0,8/h");
  });

  it("prints a dash, never a zero, for a figure nobody has", () => {
    expect(formatSevenFigure("goals", null)).toBe("—");
    expect(formatSevenFigure("impact", null)).toBe("—");
  });

  it("prints the raw record beside it, and « aucun but encaissé » rather than infinity", () => {
    const base = { rate: 1, denominatorUnit: "minutes" as const, exposure: 1 };
    expect(sevenObservedFr("goals", { ...base, numerator: 3, denominator: 240, secondary: 1 })).toBe(
      "3 buts, 1 passe décisive sur 240′",
    );
    expect(
      sevenObservedFr("goals", { ...base, numerator: 3, denominator: 240, secondary: 1 }, true),
    ).toBe("3 buts · 1 p.d. · 240′");
    expect(sevenObservedFr("keeperConceded", { ...base, numerator: 0, denominator: 35 })).toBe(
      "aucun but encaissé en 35′",
    );
    expect(sevenObservedFr("outfieldConceded", { ...base, numerator: 2, denominator: 44 }, true)).toBe(
      "2 pris en 44′",
    );
    expect(sevenObservedFr("impact", { ...base, numerator: 5, denominator: 120, secondary: 2 })).toBe(
      "+5 / −2 en 120′",
    );
    expect(sevenObservedFr("impact", { ...base, numerator: 0, denominator: 0 })).toBeNull();
  });

  it("says whose average a man with no figure is wearing", () => {
    expect(squadMeanStandInShortFr("impact")).toBe("moyenne du poste");
    expect(squadMeanStandInShortFr("goals")).toBe("moyenne de l’équipe");
  });

  it("labels the team figure with the number of discs it actually used", () => {
    // « Moyenne des sept » under a mean of five is the label lying about its own denominator; a squad
    // short of the shape is the legitimate case (`emptySlotsFr` says so above the figure).
    expect(aggregationLabelFr("sum", 7)).toBe("Total des sept");
    expect(aggregationLabelFr("mean", 7)).toBe("Moyenne des sept");
    expect(aggregationLabelFr("mean", 5)).toBe("Moyenne sur 5 postes");
    expect(aggregationLabelFr("sum", 5)).toBe("Total sur 5 postes");
    expect(aggregationLabelFr("mean", 1)).toBe("Moyenne sur 1 poste");
  });

  it("carries the denominator beside the raw figure", () => {
    expect(observedFigureFr("ratings", observed())).toBe("9,0 sur 1 match noté");
    expect(observedFigureFr("ratings", observed({ denominator: 4 }))).toBe("9,0 sur 4 matchs notés");
  });

  it("says nothing rather than « sur 0 match noté » when the denominator is empty", () => {
    expect(observedFigureFr("ratings", observed({ rate: null, numerator: 0, denominator: 0 }))).toBeNull();
    expect(observedFigureFr("ratings", observed({ denominator: 0 }))).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* The heading, decision 087                                                  */
/* -------------------------------------------------------------------------- */

describe("the heading", () => {
  it("names the seven, and stops claiming it the moment the reader swaps anybody", () => {
    expect(sevenHeadingFr("offensive", false)).toBe("La meilleure attaque");
    expect(sevenHeadingFr("legende", false)).toBe("Le 7 de légende");
    expect(sevenHeadingFr("defensive", true)).toBe("Ton équipe");
  });

  it("keeps the optimum's own figure beside it, and offers the way back", () => {
    expect(optimumComparisonFr("notes", "7,2")).toBe("Le meilleur sept aux notes : 7,2");
    expect(resetLabelFr()).toBe("Revenir au sept proposé");
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
/* The honesty sentences                                                      */
/* -------------------------------------------------------------------------- */

describe("honesty 1 — the posts are the coach's", () => {
  it("says the posts are the ones the coach set, primary first", () => {
    expect(DECLARED_POSTS_FR).toContain("que le coach a indiqués");
    expect(DECLARED_POSTS_FR).toContain("son poste principal d’abord");
    expect(declaredPostsFr()).toBe(DECLARED_POSTS_FR);
    // S12 measures the time per post now: the old sentence denying it would be false.
    expect(DECLARED_POSTS_FR).not.toContain("ne mesure nulle part");
  });

  it("explains a « pas son poste » badge, and says nothing when there is none", () => {
    expect(outOfPositionNoteFr(0)).toBeNull();
    expect(outOfPositionNoteFr(1)).toContain("1 poste est tenu");
    expect(outOfPositionNoteFr(2)).toContain("2 postes sont tenus");
  });
});

describe("who may keep goal (decision 172)", () => {
  it("says who was considered, and in the légende who was refused and against what", () => {
    expect(keeperRuleFr({ seven: "notes", considered: 3, refused: 0, average: 2 })).toBeNull();
    expect(keeperRuleFr({ seven: "offensive", considered: 0, refused: 0, average: null })).toContain(
      "Personne n’a encore de minutes dans les buts",
    );
    const offensive = keeperRuleFr({ seven: "offensive", considered: 3, refused: 1, average: 2.5 })!;
    expect(offensive).toContain("3 joueurs ont joué au goal");
    // Only the légende refuses below-average keepers.
    expect(offensive).not.toContain("écarté");
    const legend = keeperRuleFr({ seven: "legende", considered: 3, refused: 1, average: 2.5 })!;
    expect(legend).toContain("1 est écarté du 7 de légende");
    expect(legend).toContain("plus que la moyenne des gardiens, 1 but/24′");
    expect(KEEPER_REFUSED_BADGE_FR).toBe("écarté du goal");
  });

  it("states each new seven's smoothing and its one surprising rule", () => {
    expect(sevenSmoothingFr("offensive")).toContain("départagés par leurs passes décisives");
    expect(sevenSmoothingFr("legende")).toContain("compté à la moyenne du poste");
    expect(sevenSmoothingFr("notes")).toBeNull();
  });
});

describe("honesty 2 — what the shrinkage did", () => {
  it("quotes the measured prior strength in its own unit", () => {
    expect(shrinkageSentenceFr("ratings", report())).toContain("à hauteur de 4 matchs notés");
    expect(
      shrinkageSentenceFr("ratings", report({ priorStrength: 1, measured: 1 })),
    ).toContain("à hauteur de 1 match noté");
    expect(
      shrinkageSentenceFr("goals", report({ unit: "sixtyMinutes", priorStrength: 3, measured: 3 })),
    ).toContain("à hauteur de 3,0 heures de jeu");
    expect(
      shrinkageSentenceFr(
        "cleanSheet",
        report({ unit: "minutes", priorStrength: 120, measured: 120 }),
      ),
    ).toContain("à hauteur de 120′");
  });

  it("pluralises the hour from two, the way French does", () => {
    // The guard used to be `> 1`, which printed « 1,6 heures » on the clamp's own floor and « 1,0
    // heures » at exactly one. And the plural follows the *printed* decimal, so 1,96 — which rounds to
    // « 2,0 » on screen — does not come out as « 2,0 heure ».
    const hours = (priorStrength: number) =>
      shrinkageSentenceFr("goals", report({ unit: "sixtyMinutes", priorStrength, measured: priorStrength }));

    expect(hours(1)).toContain("à hauteur de 1,0 heure de jeu");
    expect(hours(1.6)).toContain("à hauteur de 1,6 heure de jeu");
    expect(hours(1.9)).toContain("à hauteur de 1,9 heure de jeu");
    expect(hours(1.96)).toContain("à hauteur de 2,0 heures de jeu");
    expect(hours(2)).toContain("à hauteur de 2,0 heures de jeu");
    expect(hours(6)).toContain("à hauteur de 6,0 heures de jeu");
  });

  it("prints no number at all when the prior strength could not be measured", () => {
    // The clamp's ceiling is not a measurement, and printing it would make the screen quote a number
    // it cannot justify — the one thing rule 3 returns `measured` separately in order to avoid.
    const sentence = shrinkageSentenceFr(
      "ratings",
      report({ measured: null, unmeasurable: "noSpread", priorStrength: 10 }),
    );

    expect(sentence).toContain("le plus fort possible");
    expect(sentence).toContain("ne peut pas te dire de combien");
    expect(sentence).not.toMatch(/\d/);
  });

  it("gives the real reason, one sentence per cause, and never invents an écart", () => {
    const because = (unmeasurable: ShrinkageReport["unmeasurable"]) =>
      shrinkageSentenceFr("ratings", report({ measured: null, priorStrength: 10, unmeasurable }));

    // Nobody has a figure. « Les écarts entre les joueurs sont trop petits » was a reason the screen
    // made up: there are no joueurs with a figure to be close together.
    expect(because("noData")).toBe(
      "Les notes sont ramenées vers la moyenne de l’équipe — sauf qu’il n’y a pas de moyenne : " +
        "personne n’a encore le moindre chiffre sur ce critère dans cette sélection.",
    );
    expect(because("noData")).not.toContain("écart");

    // One player, so there is no écart at all rather than a small one.
    expect(because("onePlayer")).toBe(
      "Les notes sont ramenées vers la moyenne de l’équipe le plus fort possible : un seul joueur a " +
        "un chiffre sur ce critère, donc il n’y a aucun écart entre joueurs à mesurer.",
    );
    expect(because("onePlayer")).not.toContain("trop petits");

    // The one case the old wording was true of.
    expect(because("noSpread")).toContain("les écarts entre les joueurs sont trop petits");

    // Nobody rated twice. The écarts may be the widest the scale allows, so this must not claim they
    // are small: what is missing is how much one player's own note moves.
    expect(because("noRepeat")).toBe(
      "Les notes sont ramenées vers la moyenne de l’équipe le plus fort possible : personne n’a " +
        "encore été noté deux fois, donc l’appli ne peut pas mesurer de combien la note d’un joueur " +
        "bouge d’un match à l’autre — et c’est ce qu’il lui faudrait pour savoir combien de poids " +
        "donner à une note isolée.",
    );
    expect(because("noRepeat")).not.toContain("trop petits");
    expect(because("noRepeat")).not.toMatch(/\d/);

    // Four different sentences, not one with four names.
    expect(
      new Set([
        because("noData"),
        because("onePlayer"),
        because("noSpread"),
        because("noRepeat"),
      ]).size,
    ).toBe(4);
  });

  it("names the keepers, not the team, under a keepers' model", () => {
    const keeper = (unmeasurable: ShrinkageReport["unmeasurable"]) =>
      shrinkageSentenceFr(
        "cleanSheet",
        report({
          unit: "minutes",
          measured: unmeasurable === null ? 300 : null,
          priorStrength: 300,
          source: "goalkeeper",
          unmeasurable,
        }),
      );
    expect(keeper("onePlayer")).toContain("un seul joueur a gardé les buts");
    expect(keeper("noSpread")).toContain("vers la moyenne des gardiens");
    expect(keeper(null)).toContain("vers la moyenne des gardiens, à hauteur de 300′");
  });
});

describe("honesty 3 — a disc showing the squad's figure, not the man's", () => {
  it("says nothing when every man on the pitch has a figure of his own", () => {
    expect(squadMeanStandInFr(0)).toBeNull();
    expect(squadMeanStandInFr(-1)).toBeNull();
  });

  it("says how many, and that such a man is neither flattered nor punished", () => {
    // Decision 115 says a no-data player « heads neither the best seven nor the worst », which is true
    // and not the whole truth: he is regularly *in* one of them, at the squad's own average.
    const one = squadMeanStandInFr(1) as string;
    expect(one).toBe(
      "1 des sept n’a aucun chiffre cette saison à ce poste : il est affiché à la moyenne de " +
        "l’équipe, donc ni flatté ni puni pour ne pas avoir joué.",
    );

    const three = squadMeanStandInFr(3) as string;
    expect(three).toBe(
      "3 des sept n’ont aucun chiffre cette saison à ce poste : ils sont affichés à la moyenne de " +
        "l’équipe, donc ni flattés ni punis pour ne pas avoir joué.",
    );

    // The count is the denominator of the claim, and rule 2 of `aggregate.ts` forbids one without it.
    expect(one).toContain("1 des sept");
    expect(three).toContain("3 des sept");
  });
});

/* -------------------------------------------------------------------------- */
/* The squad and the missing cases                                            */
/* -------------------------------------------------------------------------- */

describe("the squad", () => {
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

});

/* -------------------------------------------------------------------------- */
/* The house rule the whole screen leans on                                   */
/* -------------------------------------------------------------------------- */

describe("the tutoiement (decision 074)", () => {
  it("never uses « vous » or « votre » anywhere in this screen's copy", () => {
    const everything = [
      declaredPostsFr(),
      ...Object.values(SEVEN_RULE_FR),
      keeperRuleFr({ seven: "legende", considered: 3, refused: 2, average: 2 }),
      keeperRuleFr({ seven: "defensive", considered: 0, refused: 0, average: null }),
      sevenSmoothingFr("offensive"),
      sevenSmoothingFr("defensive"),
      sevenSmoothingFr("legende"),
      shrinkageSentenceFr("ratings", report()),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noData" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "onePlayer" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noSpread" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noRepeat" })),
      squadMeanStandInFr(1),
      squadMeanStandInFr(3),
      outOfPositionNoteFr(2),
      excludedFromSquadFr({ departedWithData: 2, nonPlayers: 1 }),
      emptySlotsFr(2),
    ].join(" ");

    expect(everything).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
  });
});

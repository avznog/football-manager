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
  CLEAN_SHEET_READINGS_FR,
  CRITERION_PARAM,
  DECLARED_POSTS_FR,
  DEFAULT_CRITERION,
  DEFAULT_DIRECTION,
  DIRECTION_PARAM,
  DIRECTION_VALUES,
  FORMATION_PARAM,
  NO_FORMATION_FR,
  SEVEN_CONTROL_LABEL_FR,
  aggregationLabelFr,
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
  mostUsedFormationOptionFr,
  noBasisFr,
  observedFigureFr,
  optimumComparisonFr,
  outOfPositionNoteFr,
  parseCompetitionId,
  parseCriterion,
  parseDirection,
  resetLabelFr,
  resolveFormationOverride,
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

  /**
   * The no-JavaScript path, and the only reason these four cases exist.
   *
   * The controls are `<select>`s inside a `<form method="get">`, so a browser with no JavaScript submits
   * **every** name it holds — including the ones the reader left at their default, as `?critere=`.
   * `equipeTypeHref` never writes an empty value (it omits the key), so nothing else in the app can
   * produce that URL and no other test would ever visit it. One parser throwing or mistaking `""` for a
   * real id is a screen that works for everybody except the reader who needs the fallback most.
   */
  it("reads an empty value as « nothing chosen », on all four parameters", () => {
    const competitions = [{ id: "c1" }, { id: "c2" }];
    const formations = [
      { formationId: "f1", matches: 5 },
      { formationId: "f2", matches: 2 },
    ];

    expect(parseCriterion("")).toBe(DEFAULT_CRITERION);
    expect(parseDirection("")).toBe(DEFAULT_DIRECTION);
    expect(parseCompetitionId("", competitions)).toBeNull();
    expect(resolveFormationOverride("", formations, "f1")).toBeNull();

    // And the whole form at once, exactly as a `method="get"` submit of four untouched selects arrives.
    const params = new URLSearchParams("critere=&sens=&formation=&competition=");
    expect(parseCriterion(params.get(CRITERION_PARAM) ?? undefined)).toBe(DEFAULT_CRITERION);
    expect(parseDirection(params.get(DIRECTION_PARAM) ?? undefined)).toBe(DEFAULT_DIRECTION);
    expect(parseCompetitionId(params.get("competition") ?? undefined, competitions)).toBeNull();
    expect(
      resolveFormationOverride(params.get(FORMATION_PARAM) ?? undefined, formations, "f1"),
    ).toBeNull();
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

  it("refuses a shape the team has not played, and the most-played one", () => {
    const formations = [
      { formationId: "f1", matches: 5, label: "1-3-2-1" },
      { formationId: "f2", matches: 2, label: "2-3-1" },
      { formationId: "f3", matches: 0, label: "1-2-3" },
    ];

    expect(resolveFormationOverride("f2", formations, "f1")?.label).toBe("2-3-1");
    // Never the most-played shape: it is what `override ?? mostUsed` falls back to anyway, and calling
    // it an override makes `formationOverrideFr` print « Ce n'est pas la forme… » about the one that is.
    expect(resolveFormationOverride("f1", formations, "f1")).toBeNull();
    // Played nothing, so laying the seven out on it would be a shape this team does not use.
    expect(resolveFormationOverride("f3", formations, "f1")).toBeNull();
    expect(resolveFormationOverride("bidon", formations, "f1")).toBeNull();
    // With no most-played shape to protect, the same id *is* an honest override.
    expect(resolveFormationOverride("f1", formations, null)?.label).toBe("1-3-2-1");
  });
});

/* -------------------------------------------------------------------------- */
/* The key that throws the previous answer away                                */
/* -------------------------------------------------------------------------- */

describe("keying the pitch to the question", () => {
  const query: BestSevenQuery = {
    competitionId: null,
    criterion: "goals",
    direction: "best",
    formationId: null,
  };

  it("changes with every value that changes which seven is right", () => {
    const base = sevenQuestionKey(query, "f1");
    expect(sevenQuestionKey({ ...query, criterion: "ratings" }, "f1")).not.toBe(base);
    expect(sevenQuestionKey({ ...query, direction: "worst" }, "f1")).not.toBe(base);
    expect(sevenQuestionKey({ ...query, competitionId: "c1" }, "f1")).not.toBe(base);
    expect(sevenQuestionKey(query, "f2")).not.toBe(base);
  });

  it("is the same key for the same question, asked twice", () => {
    expect(sevenQuestionKey({ ...query }, "f1")).toBe(sevenQuestionKey({ ...query }, "f1"));
  });

  /**
   * « la plus jouée » and an explicit override of the *same* shape are one question, because
   * `resolveFormationOverride` has already collapsed them: the resolved id is what goes in, so the seven
   * on screen and the key agree about which shape it is laid out on.
   */
  it("reads the resolved shape, not the overridden one", () => {
    expect(sevenQuestionKey({ ...query, formationId: "f1" }, "f1")).toBe(
      sevenQuestionKey(query, "f1"),
    );
    // No shape at all is still a question — one the page answers with an empty state.
    expect(sevenQuestionKey(query, null)).not.toBe(sevenQuestionKey(query, "f1"));
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

describe("naming the four controls", () => {
  it("labels every select, and tutoies nobody into « vous »", () => {
    const labels = Object.values(SEVEN_CONTROL_LABEL_FR);
    expect(labels).toHaveLength(4);
    for (const label of labels) {
      expect(label).not.toMatch(/\bvo(tre|s)\b/i);
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("offers the most-played shape once, and says why it is the default", () => {
    expect(mostUsedFormationOptionFr("1-3-2-1")).toBe("1-3-2-1 (la plus jouée)");
    // Unreachable from the screen (no shape played means no select at all), but the option must still
    // not read « null (la plus jouée) » if it ever is.
    expect(mostUsedFormationOptionFr(null)).toBe("La plus jouée");
  });

  it("spells the direction the way the URL does, so a GET submit round-trips", () => {
    // The `<option value>`s *are* the query string on the no-JavaScript path: a second spelling of
    // « pire » in the component would be a filter that silently stops working without JavaScript.
    expect(parseDirection(DIRECTION_VALUES.worst)).toBe("worst");
    expect(parseDirection(DIRECTION_VALUES.best)).toBe("best");
  });

  it("never sends the reader to a control that is not on screen", () => {
    // The formation select only lists shapes the team has played, so the state this sentence describes
    // — none played — is exactly the state in which there is nothing to choose from.
    expect(NO_FORMATION_FR).not.toContain("ci-dessus");
    expect(NO_FORMATION_FR).not.toContain("ci-dessous");
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

  it("says nothing rather than « sur 0 match noté » when the denominator is empty", () => {
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
/* The honesty sentences                                                      */
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

  it("names the keepers, not the team, under the keepers' own model", () => {
    // Decision 011 fits two models and `CLEAN_SHEET_READINGS_FR` promises « les gardiens ne sont
    // comparés qu’entre eux », so « la moyenne de l’équipe » would name the wrong twelve people.
    const keeper = (unmeasurable: ShrinkageReport["unmeasurable"]) =>
      goalkeeperShrinkageSentenceFr(
        "cleanSheet",
        report({
          unit: "minutes",
          measured: unmeasurable === null ? 300 : null,
          priorStrength: 300,
          source: "goalkeeper",
          unmeasurable,
        }),
      );

    // Finding 4's own case: no minute was ever attributed to the goal, while the outfielders have a
    // full season. « Personne n’a de chiffre sur ce critère » would be false here.
    expect(keeper("noData")).toBe(
      "Pour le gardien, les minutes sans encaisser dans les buts sont ramenées vers la moyenne des " +
        "gardiens — sauf qu’il n’y a pas de moyenne : personne n’a de minutes comptées dans les buts, " +
        "et l’appli ne les compte que si une composition confirmée dit qui gardait.",
    );
    expect(keeper("onePlayer")).toContain("un seul joueur a gardé les buts");
    expect(keeper("onePlayer")).toContain("aucun écart entre gardiens");
    expect(keeper("noSpread")).toContain("vers la moyenne des gardiens");
    expect(keeper(null)).toContain("vers la moyenne des gardiens, à hauteur de 300′");
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

describe("honesty 3 — a disc showing the squad's figure, not the man's", () => {
  it("says nothing when every man on the pitch has a figure of his own", () => {
    expect(squadMeanStandInFr(0)).toBeNull();
    expect(squadMeanStandInFr(-1)).toBeNull();
  });

  it("says how many, and that such a man can be in either seven", () => {
    // Decision 115 says a no-data player « heads neither the best seven nor the worst », which is true
    // and not the whole truth: he is regularly *in* one of them, at the squad's own average.
    const one = squadMeanStandInFr(1) as string;
    expect(one).toBe(
      "1 des sept n’a aucun chiffre cette saison sur ce critère : il est affiché à la moyenne de " +
        "l’équipe, donc ni flatté ni puni pour ne pas avoir joué — il peut donc apparaître dans la " +
        "meilleure comme dans la pire équipe.",
    );

    const three = squadMeanStandInFr(3) as string;
    expect(three).toBe(
      "3 des sept n’ont aucun chiffre cette saison sur ce critère : ils sont affichés à la moyenne de " +
        "l’équipe, donc ni flattés ni punis pour ne pas avoir joué — ils peuvent donc apparaître dans " +
        "la meilleure comme dans la pire équipe.",
    );

    // The count is the denominator of the claim, and rule 2 of `aggregate.ts` forbids one without it.
    expect(one).toContain("1 des sept");
    expect(three).toContain("3 des sept");
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
    // « sur les 8 matchs terminés » said « matchs » twice; French puts the number alone after « sur les ».
    expect(formationUsageFr({ label: "1-3-2-1", matches: 7, matchesConsidered: 8 })).toBe(
      "1-3-2-1, utilisée dans 7 matchs sur les 8 terminés de cette sélection.",
    );
    expect(formationUsageFr({ label: "1-3-2-1", matches: 1, matchesConsidered: 4 })).toBe(
      "1-3-2-1, utilisée dans 1 match sur les 4 terminés de cette sélection.",
    );
  });

  it("does not say « tous ceux » about a single match", () => {
    expect(formationUsageFr({ label: "1-3-2-1", matches: 8, matchesConsidered: 8 })).toBe(
      "1-3-2-1, utilisée dans 8 matchs — tous ceux de cette sélection.",
    );
    expect(formationUsageFr({ label: "1-3-2-1", matches: 1, matchesConsidered: 1 })).toBe(
      "1-3-2-1, utilisée dans 1 match — le seul de cette sélection.",
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
      shrinkageSentenceFr("ratings", report()),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noData" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "onePlayer" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noSpread" })),
      shrinkageSentenceFr("ratings", report({ measured: null, unmeasurable: "noRepeat" })),
      goalkeeperShrinkageSentenceFr(
        "cleanSheet",
        report({ unit: "minutes", measured: null, unmeasurable: "noData", source: "goalkeeper" }),
      ),
      squadMeanStandInFr(1),
      squadMeanStandInFr(3),
      formationUsageFr({ label: "1-3-2-1", matches: 1, matchesConsidered: 1 }),
      formationUsageFr({ label: "1-3-2-1", matches: 1, matchesConsidered: 4 }),
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

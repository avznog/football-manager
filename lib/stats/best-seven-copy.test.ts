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
  CONTEXT_MAX_LENGTH,
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
  parseSevenContext,
  sevenSourceFr,
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
import { everyFr } from "./format";
import { minutesPerCount } from "./impact";

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
    // Decision 199: no rule names a « /h » any more — the attack's is a waiting time in minutes.
    expect(SEVEN_RULE_FR.offensive).not.toContain("par heure");
    // The attack is the team's goals while he is on, and the rule has to say so: « celui qui marque le
    // plus » would be a claim about a different figure from the one the discs carry.
    expect(SEVEN_RULE_FR.offensive).toContain("l’équipe marque le plus souvent quand il est sur le terrain");
    expect(SEVEN_RULE_FR.offensive).not.toContain("passes décisives");
    expect(SEVEN_RULE_FR.defensive).toContain("encaisse le moins souvent");
    expect(SEVEN_RULE_FR.legende).toContain("de l’attaque vers la défense");
    expect(SEVEN_RULE_FR.legende).toContain("moyenne des gardiens");
    // Five criteria, each named with the post it belongs to.
    for (const clause of [
      "en AT le plus de buts à lui",
      "en AIL les buts de l’équipe quand il y joue",
      "en MC la meilleure différence de buts à ce poste",
      "en DC le moins encaissé à ce poste",
      "au goal le moins encaissé",
    ]) {
      expect(SEVEN_RULE_FR.legende).toContain(clause);
    }
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
    // Decision 199: a rate of countable events is the wait between two, « X but every X minutes ».
    // And since decision 206 the **noun carries the polarity**: the légende puts a striker's scored
    // rate and a keeper's conceded rate on one pitch, where « 1 but toutes les 17′ » under the keeper
    // and « 1 but toutes les 91′ » under the striker read as the same claim and meant the opposite.
    expect(formatSevenFigure("goals", 0.45)).toBe("1 but marqué toutes les 133′");
    expect(formatSevenFigure("goals", 0.45, true)).toBe("1 but/133′");
    expect(formatSevenFigure("ratings", 7.04)).toBe("7,0");
    // A conceded rate per 60 is read as minutes per goal, as on `/stats` (decision 162) — and says so.
    expect(formatSevenFigure("keeperConceded", 2.5)).toBe("1 but encaissé toutes les 24′");
    // « pris » on the disc, not « encaissé »: four characters, and already the word the record line
    // under it uses. The caption's budget is 104 px.
    expect(formatSevenFigure("keeperConceded", 2.5, true)).toBe("1 pris/24′");
    expect(formatSevenFigure("outfieldConceded", 2.5, true)).toBe("1 pris/24′");
    expect(formatSevenFigure("outfieldConceded", 0)).toBe("aucun but encaissé");
    expect(formatSevenFigure("goals", 0)).toBe("aucun but");
    // The impact is a difference: no waiting time, so it names the stretch it is divided over. Raw
    // since decision 198, so the two counts and the minutes under the name reproduce it.
    expect(formatSevenFigure("impact", 6)).toBe("+6,0 pour 60′");
    expect(formatSevenFigure("impact", 0)).toBe("0,0 pour 60′");
  });

  /**
   * The whole point of decision 199 is that the app has **one** wording for a rate, so the équipe type
   * and `/stats` cannot drift apart. This asserts the seam rather than the string: the sentence is
   * `format.ts`'s own, handed « so many per sixty minutes », and the disc's abbreviation carries the
   * same number. Change the shared function and this fails here too, which is the point.
   */
  it("words a rate with format.ts's one sentence, and abbreviates the same number", () => {
    for (const rate of [0.45, 2.5, 6, 0.07]) {
      expect(formatSevenFigure("goals", rate)).toBe(`1 but marqué ${everyFr(60, rate)}`);
      expect(formatSevenFigure("keeperConceded", rate)).toBe(`1 but encaissé ${everyFr(60, rate)}`);
      expect(formatSevenFigure("goals", rate, true)).toBe(`1 but/${minutesPerCount(rate)}′`);
      expect(everyFr(60, rate)).toContain(`${minutesPerCount(rate)}′`);
    }
    expect(formatSevenFigure("impact", -0.76)).toBe("−0,8 pour 60′");
  });

  it("prints a dash, never a zero, for a figure nobody has", () => {
    expect(formatSevenFigure("goals", null)).toBe("—");
    expect(formatSevenFigure("impact", null)).toBe("—");
  });

  it("prints the raw record beside it, and « aucun but encaissé » rather than infinity", () => {
    const base = { rate: 1, denominatorUnit: "minutes" as const, exposure: 1 };
    // His own goals, with no assists any more: five in the whole season rank nobody, and « 0 passe
    // décisive » under a name was a figure about nothing.
    expect(sevenObservedFr("goals", { ...base, numerator: 3, denominator: 240 })).toBe("3 buts sur 240′");
    expect(sevenObservedFr("goals", { ...base, numerator: 3, denominator: 240 }, true)).toBe(
      "3 buts · 240′",
    );
    // The team's goals, which is a different claim and says so — and « dont X de lui », because a man
    // can lead this seven without having scored one of them.
    expect(
      sevenObservedFr("teamGoalsFor", { ...base, numerator: 12, denominator: 240, secondary: 2 }),
    ).toBe("12 buts de l’équipe sur 240′, dont 2 de lui");
    expect(
      sevenObservedFr("teamGoalsFor", { ...base, numerator: 12, denominator: 240 }, true),
    ).toBe("12 buts éq. · 240′");
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
    expect(squadMeanStandInShortFr("goals")).toBe("moyenne de l’équipe");
    // The keepers are their own population; the impact never reaches this caption at all since
    // decision 198 — a man with no minute at the post has no figure, not the post's mean.
    expect(squadMeanStandInShortFr("keeperConceded")).toBe("moyenne des gardiens");
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
    expect(legend).toContain("plus que la moyenne des gardiens, 1 but toutes les 24′");
    expect(KEEPER_REFUSED_BADGE_FR).toBe("écarté du goal");
  });

  it("states each new seven's smoothing and its one surprising rule", () => {
    // The attack's big figure is the team's goals, and the sentence has to say « pas forcément le
    // sien » or the disc reads as his own scoring record.
    expect(sevenSmoothingFr("offensive")).toContain("un but que l’équipe marque pendant qu’il est sur le terrain");
    expect(sevenSmoothingFr("offensive")).toContain("pas forcément le sien");
    expect(sevenSmoothingFr("offensive")).toContain("départagés par les buts qu’ils ont mis eux-mêmes");
    // Decision 199: the sentence reads the unit out loud before it explains the smoothing.
    expect(sevenSmoothingFr("offensive")).toContain("1 but toutes les X minutes de jeu");
    expect(sevenSmoothingFr("offensive")).toContain("lissé vers la moyenne de l’équipe");
    // Five criteria, so five clauses — and the AT one says why it is the only figure not read at the
    // post, because the schema holds no per-player goal per position.
    const legende = sevenSmoothingFr("legende")!;
    for (const clause of ["En AT", "En AIL", "En MC", "En DC et au goal"]) {
      expect(legende).toContain(clause);
    }
    expect(legende).toContain("les buts ne sont pas rattachés à un poste");
    // Decision 198: the MC figure is still the raw division, checkable by hand.
    expect(legende).toContain("ramenée à 60 minutes");
    expect(legende).toContain("brut, et le calcul se refait à la main");
    expect(legende).not.toContain("moyenne du poste");
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
      "1 des sept n’a aucun chiffre à lui sur ce critère dans cette sélection : il est affiché à la " +
        "moyenne de l’équipe, donc ni flatté ni puni pour ne pas en avoir encore.",
    );

    const three = squadMeanStandInFr(3) as string;
    expect(three).toBe(
      "3 des sept n’ont aucun chiffre à eux sur ce critère dans cette sélection : ils sont affichés " +
        "à la moyenne de l’équipe, donc ni flattés ni punis pour ne pas en avoir encore.",
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
  /** The three exclusions, each defaulting to « nobody », so a test names only the one it is about. */
  const excluded = (input: Partial<Parameters<typeof excludedFromSquadFr>[0]>) =>
    excludedFromSquadFr({ departedWithData: 0, nonPlayers: 0, withoutMinutes: 0, ...input });

  it("names who could not be chosen from, in singular and plural", () => {
    expect(excluded({})).toBeNull();
    expect(excluded({ departedWithData: 1 })).toContain("1 joueur parti a");
    expect(excluded({ departedWithData: 2 })).toContain("2 joueurs partis ont");
    expect(excluded({ nonPlayers: 1 })).toContain("1 membre de l’encadrement n’est pas joueur");
  });

  it("says who was left out for having no game time, and that it is the rule (decision 187)", () => {
    const one = excluded({ withoutMinutes: 1 }) as string;
    expect(one).toContain("1 joueur de l’effectif n’a aucune minute de jeu dans cette sélection");
    expect(one).toContain("le sept ne prend que ceux qui ont joué");
    expect(one).toContain("il en reste dehors");

    const two = excluded({ withoutMinutes: 2 }) as string;
    expect(two).toContain("2 joueurs de l’effectif n’ont aucune minute de jeu");
    expect(two).toContain("ils en restent dehors");

    // « dans cette sélection » is load-bearing: the exclusion is per competition, and the same man is
    // a candidate again under « Toutes ».
    expect(one).toContain("dans cette sélection");

    // The three exclusions are one sentence, separated by the screen's own « · ».
    const all = excluded({ departedWithData: 1, nonPlayers: 1, withoutMinutes: 1 }) as string;
    expect(all.split(" · ")).toHaveLength(3);
  });

  it("admits an empty post rather than drawing six men as a seven", () => {
    expect(emptySlotsFr({ count: 0, eligible: 7, withoutMinutes: 0 })).toBeNull();
    expect(emptySlotsFr({ count: 1, eligible: 6, withoutMinutes: 0 })).toBe(
      "1 poste reste vide : l’effectif ne compte pas encore assez de joueurs pour remplir la forme.",
    );
    expect(emptySlotsFr({ count: 2, eligible: 5, withoutMinutes: 0 })).toContain(
      "2 postes restent vides",
    );
  });

  it("blames the right cause when it is the game-time rule that emptied the post", () => {
    // A squad of twelve of whom four have played: « l’effectif ne compte pas assez de joueurs » would
    // be false, and would send the reader looking for eight men he already has.
    const thin = emptySlotsFr({ count: 3, eligible: 4, withoutMinutes: 8 }) as string;
    expect(thin).toContain("3 postes restent vides");
    expect(thin).toContain("4 joueurs seulement ont du temps de jeu dans cette sélection");
    expect(thin).not.toContain("l’effectif ne compte pas");

    expect(emptySlotsFr({ count: 7, eligible: 1, withoutMinutes: 9 })).toContain(
      "1 joueur seulement a du temps de jeu",
    );
    // Nobody at all: its own sentence, because « 0 joueur seulement a » is not French.
    expect(emptySlotsFr({ count: 7, eligible: 0, withoutMinutes: 9 })).toContain(
      "personne n’a encore de temps de jeu dans cette sélection",
    );
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
      excludedFromSquadFr({ departedWithData: 2, nonPlayers: 1, withoutMinutes: 2 }),
      emptySlotsFr({ count: 2, eligible: 5, withoutMinutes: 0 }),
      emptySlotsFr({ count: 3, eligible: 4, withoutMinutes: 8 }),
      emptySlotsFr({ count: 7, eligible: 0, withoutMinutes: 9 }),
    ].join(" ");

    expect(everything).not.toMatch(/\bvous\b|\bvotre\b|\bvos\b/i);
  });
});

/* -------------------------------------------------------------------------- */
/* Where the seven came from (decision 204)                                   */
/* -------------------------------------------------------------------------- */

/**
 * The model failures are the branches worth pinning, for the same reason the shrinkage sentence is:
 * a call to somebody else's machine fails in several ways, so these are sentences the owner will
 * actually read — and each one has to say both what happened *and* that the pitch above it is still a
 * real seven. No sentence may promise a delay the code cannot know: the model is paid by the call, so
 * a 429 is a busy minute, not a quota that lifts tomorrow.
 */
describe("sevenSourceFr", () => {
  it("names the model and the date of a cached answer", () => {
    const sentence = sevenSourceFr(
      { path: "cache", model: "google/gemini-2.5-flash-lite", computedAt: "x" },
      "le 12 octobre à 18:04",
    );
    expect(sentence).toContain("google/gemini-2.5-flash-lite");
    expect(sentence).toContain("le 12 octobre à 18:04");
  });

  it("names the model of a fresh answer and dates nothing", () => {
    expect(sevenSourceFr({ path: "model", model: "google/gemini-2.5-flash-lite" })).toContain("à l’instant");
  });

  it("calls a rate limit a busy moment rather than a daily quota, and never shows a code", () => {
    const sentence = sevenSourceFr({ path: "algorithm", failure: "rateLimited" });
    expect(sentence).toContain("minutes");
    expect(sentence).not.toContain("demain");
    expect(sentence).not.toContain("quota");
    expect(sentence).toContain("algorithme");
    expect(sentence).not.toMatch(/\b429\b|erreur|Error/);
  });

  it("says the model was too slow without naming a number of seconds", () => {
    const sentence = sevenSourceFr({ path: "algorithm", failure: "timedOut" });
    expect(sentence).toContain("trop de temps");
    expect(sentence).toContain("algorithme");
    expect(sentence).not.toMatch(/\d/);
    expect(sentence).not.toMatch(/erreur|Error|timeout|abort/i);
  });

  it("says the algorithm answered, whichever way the model failed", () => {
    for (const failure of ["rateLimited", "httpError", "timedOut", "invalidAnswer", "noKey"] as const) {
      expect(sevenSourceFr({ path: "algorithm", failure })).toContain("algorithme");
    }
  });

  it("tutoies the reader in every failure sentence and never vouvoies", () => {
    for (const failure of ["rateLimited", "httpError", "timedOut", "invalidAnswer", "noKey"] as const) {
      expect(sevenSourceFr({ path: "algorithm", failure })).not.toMatch(/\bvous\b|\bvotre\b/i);
    }
  });
});

describe("parseSevenContext", () => {
  it("degrades a missing, repeated or empty value to no context at all", () => {
    expect(parseSevenContext(undefined)).toBe("");
    expect(parseSevenContext("")).toBe("");
    expect(parseSevenContext("   ")).toBe("");
    expect(parseSevenContext(["sans Karim", "sans Momo"])).toBe("sans Karim");
  });

  it("collapses the whitespace a textarea leaves behind", () => {
    expect(parseSevenContext(" sans  Karim \n ni Momo ")).toBe("sans Karim ni Momo");
  });

  it("cuts an oversized value rather than refusing it", () => {
    const long = "a".repeat(CONTEXT_MAX_LENGTH + 200);
    expect(parseSevenContext(long)).toHaveLength(CONTEXT_MAX_LENGTH);
  });
});

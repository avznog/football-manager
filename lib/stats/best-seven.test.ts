import { describe, expect, it } from "vitest";

import {
  BEST_SEVEN_CRITERIA,
  BEST_SEVEN_TIE_BREAKS,
  PRIOR_STRENGTH_CLAMP,
  UNNUMBERED_JERSEY_RANK,
  type BestSevenCandidate,
  type BestSevenCriterion,
  type BestSevenSlot,
  type PositionDeclaration,
  type SquadCell,
  aggregateSeven,
  bestSeven,
  evaluateSquad,
  fitShrinkage,
  hasOwnExposure,
  shrink,
  solveAssignment,
} from "./best-seven";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

let nextId = 0;

function player(overrides: Partial<BestSevenCandidate> = {}): BestSevenCandidate {
  nextId += 1;
  return {
    id: `p${nextId}`,
    displayName: `Joueur ${nextId}`,
    jerseyNumber: nextId,
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
    ...overrides,
  };
}

function slot(
  id: string,
  positionCode: string,
  isGoalkeeper = positionCode === "GB",
): BestSevenSlot {
  return { id, positionCode, isGoalkeeper };
}

/** The real thing: `1-3-2-1`, the formation `db/reference.ts` seeds first. */
const CLASSIC_SEVEN: BestSevenSlot[] = [
  slot("s1", "GB"),
  slot("s2", "DG"),
  slot("s3", "DC"),
  slot("s4", "DD"),
  slot("s5", "MC"),
  slot("s6", "MC"),
  slot("s7", "AT"),
];

const everywhere = (preference: PositionDeclaration = "primary") =>
  Object.fromEntries(
    CLASSIC_SEVEN.map((s) => [s.positionCode, preference]),
  ) as Record<string, PositionDeclaration>;

/** Name of whoever got a slot, by slot id. */
function pickedName(result: ReturnType<typeof bestSeven>, slotId: string): string | null {
  const pick = result.picks.find((candidate) => candidate.slotId === slotId);
  return pick?.player?.displayName ?? null;
}

/**
 * The adjusted figure where the test has already asserted there is one. `adjusted` is `number | null`
 * on purpose (rule 1b), and a test that silently coerced the null away is how the « 0,0 » defect
 * survived a green suite — so the coercion is one named helper, used only after a non-null assertion.
 */
function figure(value: number | null): number {
  expect(value).not.toBeNull();
  return value as number;
}

/* -------------------------------------------------------------------------- */
/* Rule 2 — a thin figure is shrunk, not gated                                */
/* -------------------------------------------------------------------------- */

describe("shrinkage", () => {
  /** A squad of ordinary Sundays, so there is a mean for a thin figure to be pulled towards. */
  const ordinary = () => [
    player({ ratingAverage: 6.0, ratingCount: 9, ratingVariance: 1 }),
    player({ ratingAverage: 6.2, ratingCount: 9, ratingVariance: 1 }),
    player({ ratingAverage: 5.8, ratingCount: 9, ratingVariance: 1 }),
    player({ ratingAverage: 6.1, ratingCount: 9, ratingVariance: 1 }),
  ];

  it("ranks a one-match 9,0 below a twelve-match 7,4", () => {
    const flash = player({ displayName: "Éclair", ratingAverage: 9, ratingCount: 1 });
    const steady = player({
      displayName: "Régulier",
      ratingAverage: 7.4,
      ratingCount: 12,
      ratingVariance: 1,
    });
    const candidates = [...ordinary(), flash, steady];
    const evaluation = evaluateSquad(candidates, [slot("s", "AT")], "ratings");
    const adjustedOf = (name: string) =>
      evaluation.cells[candidates.findIndex((c) => c.displayName === name)][0].adjusted;

    expect(adjustedOf("Éclair")).toBeLessThan(figure(adjustedOf("Régulier")));
    // And the raw figure is still there to print next to it (decision 072).
    const flashCell = evaluation.cells[candidates.indexOf(flash)][0];
    expect(flashCell.observed).toMatchObject({ rate: 9, denominator: 1, denominatorUnit: "ratedMatches" });
  });

  it("does not gate: one rated match is still a candidate, it is merely disbelieved", () => {
    const flash = player({ displayName: "Éclair", ratingAverage: 10, ratingCount: 1 });
    const result = bestSeven({
      criterion: "ratings",
      direction: "best",
      slots: [slot("s", "AT")],
      candidates: [flash, ...ordinary()],
    });
    // `/stats` would drop him outright for being under MIN_RATED_MATCHES. Here he is ranked — and still
    // wins the slot, because a 10 shrunk towards 6 is above 6 — but he is ranked on a figure that
    // says how little is known, which is an answer rather than a refusal to answer.
    expect(pickedName(result, "s")).toBe("Éclair");
    expect(result.picks[0].adjusted).toBeLessThan(10);
    expect(result.picks[0].adjusted).toBeGreaterThan(result.shrinkage.squadMean as number);
    expect(result.picks[0].observed.rate).toBe(10);
  });

  it("lands a player with no data exactly on the squad mean", () => {
    const ghost = player({ displayName: "Fantôme" });
    const candidates = [...ordinary(), ghost];
    const evaluation = evaluateSquad(candidates, [slot("s", "AT")], "ratings");
    const cell = evaluation.cells[candidates.indexOf(ghost)][0];

    expect(evaluation.shrinkage.squadMean).not.toBeNull();
    expect(cell.adjusted).toBe(evaluation.shrinkage.squadMean);
    expect(cell.observed.rate).toBeNull();
  });

  it("lets a no-data player head neither the best nor the worst seven", () => {
    const ghost = player({ displayName: "Fantôme" });
    const good = player({ displayName: "Bon", ratingAverage: 8, ratingCount: 9, ratingVariance: 1 });
    const poor = player({
      displayName: "Faible",
      ratingAverage: 4,
      ratingCount: 9,
      ratingVariance: 1,
    });
    const candidates = [...ordinary(), ghost, good, poor];
    const one = [slot("s", "AT")];

    const best = bestSeven({ criterion: "ratings", direction: "best", slots: one, candidates });
    const worst = bestSeven({ criterion: "ratings", direction: "worst", slots: one, candidates });

    expect(pickedName(best, "s")).toBe("Bon");
    expect(pickedName(worst, "s")).toBe("Faible");
  });

  it("gives a no-data player no figure of his own, and says which discs those are", () => {
    // The other half of the sentence decision 115 overstates: he does not *head* either seven, but a
    // slot with two candidates gives it to him whenever the squad's mean beats the other man's figure.
    const ghost = player({ displayName: "Fantôme", jerseyNumber: 1, declarations: { AT: "primary" } });
    const belowAverage = player({
      displayName: "En dessous",
      jerseyNumber: 2,
      ratingAverage: 4,
      ratingCount: 9,
      ratingVariance: 1,
      declarations: { AT: "primary" },
    });
    const candidates = [...ordinary(), ghost, belowAverage];
    const one = [slot("s", "AT")];

    const worst = bestSeven({ criterion: "ratings", direction: "worst", slots: one, candidates });
    expect(pickedName(worst, "s")).toBe("En dessous");

    // Only those two declared the post, so the slot is theirs to share: the squad mean stands in for
    // the ghost, beats a real 4,0, and puts him *in* the best seven on a figure that is not his.
    const best = bestSeven({ criterion: "ratings", direction: "best", slots: one, candidates });
    expect(pickedName(best, "s")).toBe("Fantôme");
    expect(hasOwnExposure(best.picks[0].observed)).toBe(false);
    expect(best.picks[0].adjusted).toBe(best.shrinkage.squadMean);
    expect(best.picks[0].observed.rate).toBeNull();

    // And the predicate is true of anybody who has actually been rated.
    expect(hasOwnExposure(worst.picks[0].observed)).toBe(true);
  });

  it("protects the worst seven from twenty minutes and three conceded", () => {
    // Twenty minutes, the sheet broken immediately: a raw 0 % invincibility.
    const cameo = player({ displayName: "Cameo", minutes: 20, cleanMinutes: 0 });
    // A full season at a genuinely poor 30 %.
    const liability = player({ displayName: "Passoire", minutes: 540, cleanMinutes: 162 });
    const candidates = [
      cameo,
      liability,
      player({ minutes: 540, cleanMinutes: 400 }),
      player({ minutes: 480, cleanMinutes: 330 }),
      player({ minutes: 500, cleanMinutes: 360 }),
    ];
    const result = bestSeven({
      criterion: "cleanSheet",
      direction: "worst",
      slots: [slot("s", "DC")],
      candidates,
    });

    expect(pickedName(result, "s")).toBe("Passoire");
    // The cameo's raw figure is the worst in the squad, and it is still not believed.
    const cameoCell = evaluateSquad(candidates, [slot("s", "DC")], "cleanSheet").cells[0][0];
    expect(cameoCell.observed.rate).toBe(0);
    expect(cameoCell.adjusted).toBeGreaterThan(0.3);
  });

  it("is continuous: no exposure makes a figure appear or jump", () => {
    const model = { squadMean: 0.5, priorStrength: 120 };
    let previous = figure(shrink(1, 0, model));
    expect(previous).toBe(0.5);
    for (let minutes = 1; minutes <= 900; minutes += 1) {
      const current = figure(shrink(1, minutes, model));
      expect(current).toBeGreaterThan(previous);
      // A single extra minute never moves the figure by a percentage point: there is no threshold.
      expect(current - previous).toBeLessThan(0.01);
      previous = current;
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 3 — `m` is measured                                                   */
/* -------------------------------------------------------------------------- */

describe("the measured prior strength", () => {
  const rated = (average: number, count = 8, variance = 1) =>
    player({ ratingAverage: average, ratingCount: count, ratingVariance: variance });

  it("measures a value inside the clamp from a squad that has a real spread", () => {
    // Four players, within-player variance 1.0, means 5/6/6/7 over eight rated matches each.
    // Observed spread of the means is 0.5, of which 1.0/8 = 0.125 is sampling noise, so the real
    // between-player spread is 0.375 and m = 1.0 / 0.375 = 2.666…
    const report = fitShrinkage([rated(5), rated(6), rated(6), rated(7)], "ratings", "allPitch");

    expect(report.squadMean).toBeCloseTo(6, 10);
    expect(report.withinPlayerVariance).toBeCloseTo(1, 10);
    expect(report.betweenPlayerVariance).toBeCloseTo(0.375, 10);
    expect(report.measured).toBeCloseTo(1 / 0.375, 6);
    expect(report.priorStrength).toBeCloseTo(1 / 0.375, 6);
    expect(report.unit).toBe("ratedMatches");
  });

  it("is maximally sceptical about a uniform squad and trusting of a squad with gulfs", () => {
    const uniform = fitShrinkage([rated(6), rated(6), rated(6), rated(6)], "ratings", "allPitch");
    const gulfs = fitShrinkage(
      [rated(3, 8, 0.2), rated(5, 8, 0.2), rated(7, 8, 0.2), rated(9, 8, 0.2)],
      "ratings",
      "allPitch",
    );

    // Nothing separates the uniform squad but noise, so there is nothing to measure and the ceiling
    // of the clamp is used rather than a division by a negative variance.
    expect(uniform.measured).toBeNull();
    expect(uniform.priorStrength).toBe(PRIOR_STRENGTH_CLAMP.ratings[1]);
    expect(gulfs.priorStrength).toBeLessThan(uniform.priorStrength);
    expect(gulfs.priorStrength).toBe(PRIOR_STRENGTH_CLAMP.ratings[0]);
  });

  it("clamps every criterion into its declared bounds, however thin the season", () => {
    const thin = [
      player({ minutes: 30, goals: 3, assists: 1, cleanMinutes: 30, ratingAverage: 9, ratingCount: 1 }),
      player({ minutes: 30, goals: 0, assists: 0, cleanMinutes: 0, ratingAverage: 4, ratingCount: 1 }),
    ];
    for (const criterion of BEST_SEVEN_CRITERIA) {
      const report = fitShrinkage(thin, criterion, "allPitch");
      const [low, high] = PRIOR_STRENGTH_CLAMP[criterion];
      expect(report.priorStrength).toBeGreaterThanOrEqual(low);
      expect(report.priorStrength).toBeLessThanOrEqual(high);
    }
  });

  it("reports no squad mean at all when nobody has played", () => {
    const result = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: Array.from({ length: 7 }, () => player({ declarations: everywhere() })),
    });
    expect(result.hasBasis).toBe(false);
    expect(result.shrinkage.squadMean).toBeNull();
    expect(result.aggregate).toBeNull();
    expect(result.shrinkage.unmeasurable).toBe("noData");
    // The seven is still named — on declared positions and the tie-breaks alone.
    expect(result.picks.every((pick) => pick.player !== null)).toBe(true);
    // And **every disc says « — »**, not « 0,00/h ». This is the assertion that was missing: the old
    // suite checked only the aggregate, so seven discs printing a fabricated zero passed it.
    expect(result.picks.map((pick) => pick.adjusted)).toEqual([...Array(7)].map(() => null));
    expect(result.values.every((value) => value === null)).toBe(true);
  });

  it("prints no figure at all on a selection where nobody has a rating to show (rule 1b)", () => {
    // A competition whose matches are all still waiting on their notes has no mean anywhere, which is
    // how this reached a real screen: seven discs, « 0,0 » each, on a 0–10 scale, under a team figure
    // that correctly said « — ». Decision 137 changed the cause and not the case.
    const result = bestSeven({
      criterion: "ratings",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: Array.from({ length: 9 }, () =>
        player({ minutes: 480, goals: 2, declarations: everywhere() }),
      ),
    });

    expect(result.shrinkage.squadMean).toBeNull();
    expect(result.hasBasis).toBe(false);
    expect(result.picks.every((pick) => pick.adjusted === null)).toBe(true);
    expect(result.aggregate).toBeNull();
    // `shrink` itself, since that is where the zero was written.
    expect(shrink(9, 5, { squadMean: null, priorStrength: 4 })).toBeNull();
    expect(shrink(null, 0, { squadMean: null, priorStrength: 4 })).toBeNull();
  });

  it("names which of the four reasons it could not measure anything", () => {
    // Nobody at all: there is no mean either, and the honest sentence is « personne n’a de chiffre ».
    const noData = fitShrinkage([player(), player()], "ratings", "allPitch");
    expect(noData.squadMean).toBeNull();
    expect(noData.unmeasurable).toBe("noData");

    // One rated player among unrated ones: a mean, and nothing whatever to compare it to. The old copy
    // called this « les écarts entre les joueurs sont trop petits », which invents an écart.
    const onePlayer = fitShrinkage([rated(6), player(), player()], "ratings", "allPitch");
    expect(onePlayer.squadMean).toBeCloseTo(6, 10);
    expect(onePlayer.unmeasurable).toBe("onePlayer");

    // Several players, and nothing but noise between them: the one case the old sentence was true of.
    const noSpread = fitShrinkage([rated(6), rated(6), rated(6)], "ratings", "allPitch");
    expect(noSpread.unmeasurable).toBe("noSpread");

    // Ratings everywhere but never two for one man, so decision 021's variance is nowhere. Its own
    // cause, and 4 against 8 is why: the écart between these two is as wide as the scale allows, so
    // « les écarts sont trop petits » would be flatly false. What is missing is the other moment.
    const noRepeat = fitShrinkage(
      [
        player({ ratingAverage: 4, ratingCount: 1 }),
        player({ ratingAverage: 8, ratingCount: 1 }),
      ],
      "ratings",
      "allPitch",
    );
    expect(noRepeat.squadMean).toBeCloseTo(6, 10);
    expect(noRepeat.unmeasurable).toBe("noRepeat");
    // And it is reachable for ratings alone: the other three criteria model their within-player noise
    // from the squad mean, so they never need a second observation of one player.
    expect(fitShrinkage([player({ goals: 1, minutes: 60 })], "goals", "allPitch").unmeasurable).toBe(
      "onePlayer",
    );

    // A single keeper is `onePlayer` on the keepers' model, whatever the outfielders did.
    const oneKeeper = fitShrinkage(
      [
        player({ minutes: 600, cleanMinutes: 300, gkMinutes: 600, gkCleanMinutes: 400 }),
        player({ minutes: 600, cleanMinutes: 300 }),
      ],
      "cleanSheet",
      "goalkeeper",
    );
    expect(oneKeeper.unmeasurable).toBe("onePlayer");
  });

  it("carries a cause exactly when it carries no measurement", () => {
    const squads: BestSevenCandidate[][] = [
      [],
      [player()],
      [rated(6)],
      [rated(6), rated(6)],
      [rated(5), rated(7)],
      [rated(5), rated(6), rated(6), rated(7)],
      [player({ minutes: 300, goals: 2 }), player({ minutes: 600, goals: 9 })],
      [player({ minutes: 300, cleanMinutes: 100 }), player({ minutes: 600, cleanMinutes: 500 })],
    ];
    for (const squad of squads) {
      for (const criterion of BEST_SEVEN_CRITERIA) {
        for (const source of ["allPitch", "goalkeeper"] as const) {
          const report = fitShrinkage(squad, criterion, source);
          expect(report.unmeasurable === null).toBe(report.measured !== null);
        }
      }
    }
  });

  it("carries the prior strength out to the screen, in its own unit", () => {
    const result = bestSeven({
      criterion: "ratings",
      direction: "best",
      slots: [slot("s", "AT")],
      candidates: [rated(5), rated(6), rated(6), rated(7)],
    });
    expect(result.shrinkage.unit).toBe("ratedMatches");
    expect(result.shrinkage.priorStrength).toBeCloseTo(1 / 0.375, 6);
    expect(result.shrinkage.clamp).toEqual(PRIOR_STRENGTH_CLAMP.ratings);
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 4 — decision 011's two clean-sheet pairs                              */
/* -------------------------------------------------------------------------- */

describe("the goalkeeper's clean-sheet pair (decision 011)", () => {
  const keeperSquad = () => [
    player({
      displayName: "Gardien",
      minutes: 600,
      cleanMinutes: 300,
      gkMinutes: 600,
      gkCleanMinutes: 480,
      declarations: everywhere(),
    }),
    player({
      displayName: "Doublure",
      minutes: 300,
      cleanMinutes: 150,
      gkMinutes: 300,
      gkCleanMinutes: 60,
      declarations: everywhere(),
    }),
    ...Array.from({ length: 6 }, () =>
      player({ minutes: 500, cleanMinutes: 300, declarations: everywhere() }),
    ),
  ];

  it("scores the GB slot on gkCleanMinutes / gkMinutes, and says so", () => {
    const result = bestSeven({
      criterion: "cleanSheet",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: keeperSquad(),
    });
    const goalkeeper = result.picks[0];

    expect(goalkeeper.slotId).toBe("s1");
    expect(goalkeeper.figureSource).toBe("goalkeeper");
    expect(pickedName(result, "s1")).toBe("Gardien");
    expect(goalkeeper.observed).toMatchObject({ numerator: 480, denominator: 600 });
    expect(result.picks.slice(1).every((pick) => pick.figureSource === "allPitch")).toBe(true);
    expect(result.goalkeeperShrinkage?.source).toBe("goalkeeper");
    // Two populations, two means: the keepers' record is not the outfielders'.
    expect(result.goalkeeperShrinkage?.squadMean).not.toBe(result.shrinkage.squadMean);
  });

  it("fits no second model for a criterion decision 011 reads only one way", () => {
    for (const criterion of ["goals", "assists", "ratings"] as const) {
      const result = bestSeven({
        criterion,
        direction: "best",
        slots: CLASSIC_SEVEN,
        candidates: keeperSquad(),
      });
      expect(result.goalkeeperShrinkage).toBeNull();
      expect(result.picks.every((pick) => pick.figureSource === "allPitch")).toBe(true);
    }
  });

  it("refuses a GB figure when no minute was ever attributed to the goal", () => {
    // Reachable on real data: `gkMinutes` is written only when a confirmed composition tells the reducer
    // which slot is the goal, so a season run in game mode without one leaves every `gkMinutes` at 0
    // while `minutes` and `cleanMinutes` are real. `hasBasis` used to be an OR across the two models, so
    // the field model vouched for the GB disc and it printed « 0 % » — averaged in with six real figures.
    const candidates = Array.from({ length: 8 }, (_, index) =>
      player({
        minutes: 500,
        cleanMinutes: 200 + index * 20,
        gkMinutes: 0,
        gkCleanMinutes: 0,
        declarations: everywhere(),
      }),
    );
    const result = bestSeven({
      criterion: "cleanSheet",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(result.hasBasis).toBe(true);
    expect(result.goalkeeperHasBasis).toBe(false);
    expect(result.goalkeeperShrinkage?.squadMean).toBeNull();
    expect(result.goalkeeperShrinkage?.unmeasurable).toBe("noData");
    // The GB slot is still filled — a seven has to be complete — with no figure under it.
    expect(result.picks[0].player).not.toBeNull();
    expect(result.picks[0].adjusted).toBeNull();
    // And the team figure refuses to average six real proportions as though they were seven.
    expect(result.picks.slice(1).every((pick) => pick.adjusted !== null)).toBe(true);
    expect(result.aggregate).toBeNull();
  });

  it("gates the two models apart: no field data, a real keeper", () => {
    // The mirror case, and the reason `hasBasis` is not an AND either.
    const candidates = Array.from({ length: 8 }, (_, index) =>
      player({
        minutes: 0,
        cleanMinutes: 0,
        gkMinutes: index < 2 ? 300 : 0,
        gkCleanMinutes: index < 2 ? 100 * (index + 1) : 0,
        declarations: everywhere(),
      }),
    );
    const result = bestSeven({
      criterion: "cleanSheet",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(result.hasBasis).toBe(false);
    expect(result.goalkeeperHasBasis).toBe(true);
    expect(result.picks[0].adjusted).not.toBeNull();
    expect(result.picks.slice(1).every((pick) => pick.adjusted === null)).toBe(true);
    expect(result.aggregate).toBeNull();
  });

  it("reports no second gate for a criterion with no second model", () => {
    for (const criterion of ["goals", "assists", "ratings"] as const) {
      const result = bestSeven({
        criterion,
        direction: "best",
        slots: CLASSIC_SEVEN,
        candidates: keeperSquad(),
      });
      // Null means « not applicable », and must never be read as false.
      expect(result.goalkeeperHasBasis).toBeNull();
    }
  });

  it("lands an outfielder who never kept goal on the keepers' mean, not on zero", () => {
    const candidates = keeperSquad();
    const evaluation = evaluateSquad(candidates, CLASSIC_SEVEN, "cleanSheet");
    const outfielder = evaluation.cells[candidates.findIndex((c) => c.gkMinutes === 0)][0];

    expect(outfielder.figureSource).toBe("goalkeeper");
    expect(outfielder.adjusted).toBe(evaluation.goalkeeperShrinkage?.squadMean);
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 5 — the exact assignment                                              */
/* -------------------------------------------------------------------------- */

/**
 * The greedy pass this file exists not to be: walk the slots in order and give each one the best
 * remaining candidate for it. It is what anybody writes first, and it is what the DP is measured
 * against below — on the answer it produces, not on a number written down by hand.
 */
function greedyAssignment(cells: readonly (readonly SquadCell[])[], slotCount: number): number[] {
  const rank = { primary: 2, secondary: 1, none: 0 } as const;
  const taken = new Set<number>();
  const chosen: number[] = [];
  for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
    let best = -1;
    for (let candidate = 0; candidate < cells.length; candidate += 1) {
      if (taken.has(candidate)) continue;
      const cell = cells[candidate][slotIndex];
      if (best < 0) {
        best = candidate;
        continue;
      }
      const incumbent = cells[best][slotIndex];
      if (
        rank[cell.fit] > rank[incumbent.fit] ||
        (rank[cell.fit] === rank[incumbent.fit] &&
          (cell.adjusted ?? 0) > (incumbent.adjusted ?? 0))
      ) {
        best = candidate;
      }
    }
    if (best >= 0) taken.add(best);
    chosen.push(best);
  }
  return chosen;
}

describe("choosing the seven", () => {
  it("beats greedy when two slots want the same man (positions)", () => {
    const slots = [slot("gb", "GB"), slot("at", "AT")];
    // Polyvalent is the better scorer and declares both posts; Spécialiste only ever plays in goal.
    const polyvalent = player({
      displayName: "Polyvalent",
      minutes: 300,
      goals: 6,
      declarations: { GB: "primary", AT: "primary" },
    });
    const specialist = player({
      displayName: "Spécialiste",
      minutes: 300,
      goals: 1,
      declarations: { GB: "primary" },
    });
    const candidates = [polyvalent, specialist];

    const evaluation = evaluateSquad(candidates, slots, "goals");
    const greedy = greedyAssignment(evaluation.cells, slots.length);
    const exact = solveAssignment(evaluation.cells, candidates, slots.length);

    // Greedy gives the goalkeeper's slot to the better scorer and leaves the striker's slot to a man
    // who never asked for it.
    expect(greedy).toEqual([0, 1]);
    expect(evaluation.cells[greedy[1]][1].fit).toBe("none");
    // The DP swaps them: two declared posts instead of one.
    expect(exact.slotToCandidate).toEqual([1, 0]);
    expect(exact.objective.declared).toBe(2);

    const result = bestSeven({ criterion: "goals", direction: "best", slots, candidates });
    expect(pickedName(result, "gb")).toBe("Spécialiste");
    expect(pickedName(result, "at")).toBe("Polyvalent");
    expect(result.outOfPositionCount).toBe(0);
  });

  it("beats greedy when two slots want the same man (the criterion total)", () => {
    // Rule 4 is what makes a cell depend on its slot, so `cleanSheet` is where a genuine 2×2
    // assignment appears: Complet is the better keeper *and* the better outfielder, so a greedy pass
    // over the slots takes him for the gloves and leaves a 10 % defender at the back.
    const slots = [slot("gb", "GB"), slot("dc", "DC")];
    const complete = player({
      displayName: "Complet",
      minutes: 600,
      cleanMinutes: 540,
      gkMinutes: 600,
      gkCleanMinutes: 600,
      declarations: { GB: "primary", DC: "primary" },
    });
    const keeperOnly = player({
      displayName: "Gardien pur",
      minutes: 600,
      cleanMinutes: 60,
      gkMinutes: 600,
      gkCleanMinutes: 540,
      declarations: { GB: "primary", DC: "primary" },
    });
    const candidates = [complete, keeperOnly];

    const evaluation = evaluateSquad(candidates, slots, "cleanSheet");
    const greedy = greedyAssignment(evaluation.cells, slots.length);
    const exact = solveAssignment(evaluation.cells, candidates, slots.length);
    const totalOf = (assignment: readonly number[]) =>
      assignment.reduce(
        (total, candidate, slotIndex) =>
          total + figure(evaluation.cells[candidate][slotIndex].adjusted),
        0,
      );

    expect(greedy).toEqual([0, 1]);
    expect(exact.slotToCandidate).toEqual([1, 0]);
    // Both fill two declared posts, so the criterion total decides — and greedy's is worse.
    expect(totalOf(exact.slotToCandidate)).toBeGreaterThan(totalOf(greedy));

    const result = bestSeven({ criterion: "cleanSheet", direction: "best", slots, candidates });
    expect(pickedName(result, "gb")).toBe("Gardien pur");
    expect(pickedName(result, "dc")).toBe("Complet");
  });

  it("prefers a primary post to a secondary one, and either to none", () => {
    const slots = [slot("at", "AT")];
    const candidates = [
      player({ displayName: "Second choix", minutes: 300, goals: 9, declarations: { AT: "secondary" } }),
      player({ displayName: "Titulaire", minutes: 300, goals: 3, declarations: { AT: "primary" } }),
      player({ displayName: "Hors poste", minutes: 300, goals: 30, declarations: { GB: "primary" } }),
    ];
    const result = bestSeven({ criterion: "goals", direction: "best", slots, candidates });

    // Three goals in his own post beats nine out of his second and thirty out of nowhere: positions
    // come before the total, which is the whole of « il faut faire attention aux postes ».
    expect(pickedName(result, "at")).toBe("Titulaire");
    expect(result.picks[0].fit).toBe("primary");
  });

  it("fills a post nobody declared rather than refusing, and badges it", () => {
    const candidates = Array.from({ length: 7 }, (_, index) =>
      player({
        displayName: `J${index}`,
        minutes: 300,
        goals: 2,
        declarations: index === 0 ? { GB: "primary" } : { MC: "primary" },
      }),
    );
    const result = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(result.picks.every((pick) => pick.player !== null)).toBe(true);
    // Two slots are MC, one is GB: four men end up somewhere they never asked for.
    expect(result.outOfPositionCount).toBe(4);
    expect(result.picks.filter((pick) => pick.fit === "none")).toHaveLength(4);
  });

  it("leaves a slot empty rather than inventing a player", () => {
    const result = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: [
        player({ minutes: 300, goals: 3, declarations: everywhere() }),
        player({ minutes: 300, goals: 1, declarations: everywhere() }),
      ],
    });
    expect(result.picks.filter((pick) => pick.player !== null)).toHaveLength(2);
    expect(result.values).toHaveLength(2);
    expect(result.picks.filter((pick) => pick.player === null).length).toBe(5);
  });

  it("assigns each man once, even when he is the best answer everywhere", () => {
    const ace = player({ displayName: "As", minutes: 600, goals: 20, declarations: everywhere() });
    const rest = Array.from({ length: 6 }, () =>
      player({ minutes: 300, goals: 1, declarations: everywhere() }),
    );
    const result = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: [ace, ...rest],
    });
    const ids = result.picks.map((pick) => pick.player?.id);
    expect(new Set(ids).size).toBe(7);
    expect(ids.filter((id) => id === ace.id)).toHaveLength(1);
  });
});

/* -------------------------------------------------------------------------- */
/* The tie-breaks                                                             */
/* -------------------------------------------------------------------------- */

describe("tie-breaks", () => {
  it("states its order once, and follows it", () => {
    expect(BEST_SEVEN_TIE_BREAKS).toEqual(["minutesPlayed", "jerseyNumber"]);
  });

  it("prefers the man who has played, when the figures are identical", () => {
    // Both score 0.6 per 60, which is also the squad mean, so both adjust to exactly the same value.
    const slots = [slot("at", "AT")];
    const regular = player({
      displayName: "Régulier",
      minutes: 200,
      goals: 2,
      jerseyNumber: 11,
      declarations: { AT: "primary" },
    });
    const occasional = player({
      displayName: "Occasionnel",
      minutes: 100,
      goals: 1,
      jerseyNumber: 4,
      declarations: { AT: "primary" },
    });
    const candidates = [occasional, regular];
    const evaluation = evaluateSquad(candidates, slots, "goals");
    expect(evaluation.cells[0][0].adjusted).toBeCloseTo(figure(evaluation.cells[1][0].adjusted), 12);

    const result = bestSeven({ criterion: "goals", direction: "best", slots, candidates });
    expect(pickedName(result, "at")).toBe("Régulier");
  });

  it("falls through to the lower jersey number, and puts an unnumbered player last", () => {
    const slots = [slot("at", "AT")];
    const make = (name: string, jerseyNumber: number | null) =>
      player({
        displayName: name,
        jerseyNumber,
        minutes: 100,
        goals: 1,
        declarations: { AT: "primary" },
      });
    const nine = make("Neuf", 9);
    const four = make("Quatre", 4);
    const none = make("Sans numéro", null);

    const winnerOf = (candidates: BestSevenCandidate[]) =>
      pickedName(bestSeven({ criterion: "goals", direction: "best", slots, candidates }), "at");

    expect(winnerOf([nine, four])).toBe("Quatre");
    expect(winnerOf([none, nine])).toBe("Neuf");
    expect(UNNUMBERED_JERSEY_RANK).toBeGreaterThan(99);
  });
});

/* -------------------------------------------------------------------------- */
/* Rule 6 — the worst seven                                                   */
/* -------------------------------------------------------------------------- */

describe("the worst seven", () => {
  /** Already in `bestSeven`'s own candidate order, so indices line up with `solveAssignment`. */
  const squad = (): BestSevenCandidate[] => [
    player({ displayName: "A", jerseyNumber: 1, minutes: 600, goals: 9, declarations: everywhere() }),
    player({ displayName: "B", jerseyNumber: 2, minutes: 600, goals: 2, declarations: everywhere() }),
    player({ displayName: "C", jerseyNumber: 3, minutes: 500, goals: 7, declarations: everywhere() }),
    player({ displayName: "D", jerseyNumber: 4, minutes: 500, goals: 0, declarations: everywhere() }),
    player({ displayName: "E", jerseyNumber: 5, minutes: 400, goals: 5, declarations: everywhere() }),
    player({ displayName: "F", jerseyNumber: 6, minutes: 400, goals: 1, declarations: everywhere() }),
    player({ displayName: "G", jerseyNumber: 7, minutes: 300, goals: 4, declarations: everywhere() }),
    player({ displayName: "H", jerseyNumber: 8, minutes: 300, goals: 3, declarations: everywhere() }),
    player({ displayName: "I", jerseyNumber: 9, minutes: 200, goals: 6, declarations: everywhere() }),
  ];

  it("is exactly the best seven of the negated criterion", () => {
    const candidates = squad();
    const evaluation = evaluateSquad(candidates, CLASSIC_SEVEN, "goals");
    const negated = evaluation.cells.map((row) =>
      row.map((cell) => ({ ...cell, adjusted: cell.adjusted === null ? null : -cell.adjusted })),
    );
    const viaNegation = solveAssignment(negated, candidates, CLASSIC_SEVEN.length, "best");
    const worst = bestSeven({
      criterion: "goals",
      direction: "worst",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(worst.picks.map((pick) => pick.player?.displayName)).toEqual(
      viaNegation.slotToCandidate.map((index) => candidates[index].displayName),
    );
  });

  it("reports the team figure un-negated, so the screen prints a real number", () => {
    const candidates = squad();
    const worst = bestSeven({
      criterion: "goals",
      direction: "worst",
      slots: CLASSIC_SEVEN,
      candidates,
    });
    const best = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(worst.values.every((value) => value !== null && value > 0)).toBe(true);
    expect(worst.aggregate).toBeGreaterThan(0);
    expect(worst.aggregate as number).toBeLessThan(best.aggregate as number);
  });
});

/* -------------------------------------------------------------------------- */
/* The team figure, and recomputing it after a swap                           */
/* -------------------------------------------------------------------------- */

describe("aggregateSeven", () => {
  it("sums the counting rates and averages the per-player scales", () => {
    expect(aggregateSeven([1, 2, 3], "goals")).toBe(6);
    expect(aggregateSeven([1, 2, 3], "assists")).toBe(6);
    expect(aggregateSeven([6, 7, 8], "ratings")).toBe(7);
    expect(aggregateSeven([0.2, 0.4, 0.6], "cleanSheet")).toBeCloseTo(0.4, 12);
  });

  it("is null on nothing, never zero (aggregate.ts rule 1)", () => {
    for (const criterion of BEST_SEVEN_CRITERIA) {
      expect(aggregateSeven([], criterion)).toBeNull();
    }
  });

  it("refuses to total a partial seven", () => {
    // Five of seven summed and labelled as seven is the defect this returns null for, not a workaround
    // for the nulls: it is a number about a team that was never on a pitch.
    expect(aggregateSeven([1, 2, null, 4, 5, 6, 7], "goals")).toBeNull();
    expect(aggregateSeven([6, 7, null], "ratings")).toBeNull();
    expect(aggregateSeven([null], "cleanSheet")).toBeNull();
    // Skipping them would have produced these, and neither is a figure about the seven drawn.
    expect(aggregateSeven([1, 2, 4, 5, 6, 7], "goals")).toBe(25);
    expect(aggregateSeven([6, 7], "ratings")).toBe(6.5);
  });

  it("is what the result reports, so a client swap needs no shrinkage of its own", () => {
    const candidates = Array.from({ length: 9 }, (_, index) =>
      player({
        minutes: 200 + index * 40,
        goals: index,
        declarations: everywhere(),
      }),
    );
    const result = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });

    expect(result.aggregate).toBeCloseTo(aggregateSeven(result.values, "goals") as number, 12);
    // What the client does when the coach swaps the man in slot 3 for somebody it already has a
    // figure for: replace one number and call the same function.
    const swapped = [...result.values];
    swapped[2] = 0.123;
    expect(aggregateSeven(swapped, "goals")).toBeCloseTo(
      (result.aggregate as number) - figure(result.values[2]) + 0.123,
      12,
    );
  });
});

/* -------------------------------------------------------------------------- */
/* The property                                                               */
/* -------------------------------------------------------------------------- */

/** A tiny LCG, so "random" squads are the same squads on every machine and in CI. */
function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

/**
 * The criterion's rate and exposure, written out independently of the module so the property below
 * is not checking the module against itself.
 */
function figureOf(candidate: BestSevenCandidate, criterion: BestSevenCriterion) {
  const { minutes, ratingCount } = candidate;
  switch (criterion) {
    case "goals":
      return { rate: minutes > 0 ? candidate.goals / (minutes / 60) : null, exposure: minutes / 60 };
    case "assists":
      return {
        rate: minutes > 0 ? candidate.assists / (minutes / 60) : null,
        exposure: minutes / 60,
      };
    case "ratings":
      return { rate: ratingCount > 0 ? candidate.ratingAverage : null, exposure: ratingCount };
    case "cleanSheet":
      return { rate: minutes > 0 ? candidate.cleanMinutes / minutes : null, exposure: minutes };
  }
}

/** Add exposure whose rate is exactly the squad mean — a performance that says nothing new. */
function addAverageStint(
  candidate: BestSevenCandidate,
  criterion: BestSevenCriterion,
  squadMean: number,
): BestSevenCandidate {
  switch (criterion) {
    case "goals":
      return {
        ...candidate,
        minutes: candidate.minutes + 120,
        goals: candidate.goals + squadMean * 2,
      };
    case "assists":
      return {
        ...candidate,
        minutes: candidate.minutes + 120,
        assists: candidate.assists + squadMean * 2,
      };
    case "ratings": {
      const count = candidate.ratingCount + 3;
      const total = (candidate.ratingAverage ?? 0) * candidate.ratingCount + squadMean * 3;
      return { ...candidate, ratingCount: count, ratingAverage: total / count };
    }
    case "cleanSheet":
      return {
        ...candidate,
        minutes: candidate.minutes + 120,
        cleanMinutes: candidate.cleanMinutes + squadMean * 120,
      };
  }
}

describe("property: an average performance can only move a figure towards the squad mean", () => {
  it.each(BEST_SEVEN_CRITERIA)("holds for %s over forty random squads", (criterion) => {
    const random = lcg(20260930);
    for (let trial = 0; trial < 40; trial += 1) {
      const candidates = Array.from({ length: 3 + Math.floor(random() * 10) }, () => {
        const minutes = Math.round(random() * 700);
        const ratingCount = Math.floor(random() * 12);
        return player({
          minutes,
          goals: Math.floor(random() * 9),
          assists: Math.floor(random() * 6),
          cleanMinutes: Math.round(minutes * random()),
          ratingAverage: ratingCount > 0 ? Math.round(random() * 100) / 10 : null,
          ratingCount,
          ratingVariance: ratingCount >= 2 ? Math.round(random() * 300) / 100 : null,
        });
      });

      // The model is fitted once and held: the question is what the shrinkage does to a player, not
      // what a new performance does to the measurement of `m`.
      const model = fitShrinkage(candidates, criterion, "allPitch");
      if (model.squadMean === null) continue;
      const mean = model.squadMean;

      for (const candidate of candidates) {
        const before = figureOf(candidate, criterion);
        const after = figureOf(addAverageStint(candidate, criterion, mean), criterion);
        // The model has a mean here (checked above), so neither shrink can be null.
        const distanceBefore = Math.abs(figure(shrink(before.rate, before.exposure, model)) - mean);
        const distanceAfter = Math.abs(figure(shrink(after.rate, after.exposure, model)) - mean);

        expect(distanceAfter).toBeLessThanOrEqual(distanceBefore + 1e-12);
        // And strictly towards it whenever there was anywhere to move from.
        if (distanceBefore > 1e-9) expect(distanceAfter).toBeLessThan(distanceBefore);
      }
    }
  });
});

/* -------------------------------------------------------------------------- */
/* What the screen is handed                                                  */
/* -------------------------------------------------------------------------- */

describe("the output a screen can be honest with", () => {
  it("carries the raw figure and its denominator next to the adjusted one (decision 072)", () => {
    const flash = player({
      displayName: "Éclair",
      ratingAverage: 9,
      ratingCount: 1,
      declarations: everywhere(),
    });
    const candidates = [
      flash,
      ...Array.from({ length: 6 }, () =>
        player({ ratingAverage: 6, ratingCount: 9, ratingVariance: 1, declarations: everywhere() }),
      ),
    ];
    const result = bestSeven({
      criterion: "ratings",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });
    const pick = result.picks.find((p) => p.player?.displayName === "Éclair");

    expect(pick).toBeDefined();
    // « 7,0 » and « 9,0 sur 1 note », both on screen, neither on hover.
    expect(pick?.observed.rate).toBe(9);
    expect(pick?.observed.denominator).toBe(1);
    expect(pick?.observed.denominatorUnit).toBe("ratedMatches");
    expect(pick?.adjusted).toBeLessThan(9);
    expect(pick?.adjusted).toBeGreaterThan(6);
  });

  it("echoes the slots back in order, with the criterion and the direction", () => {
    const result = bestSeven({
      criterion: "assists",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: Array.from({ length: 8 }, () =>
        player({ minutes: 300, assists: 2, declarations: everywhere() }),
      ),
    });
    expect(result.picks.map((pick) => pick.slotId)).toEqual(CLASSIC_SEVEN.map((s) => s.id));
    expect(result.picks.map((pick) => pick.positionCode)).toEqual(
      CLASSIC_SEVEN.map((s) => s.positionCode),
    );
    expect(result.criterion).toBe("assists");
    expect(result.direction).toBe("best");
    expect(result.aggregation).toBe("sum");
    expect(result.candidatesConsidered).toBe(8);
  });

  it("is deterministic: the same squad in a different order names the same seven", () => {
    const candidates = Array.from({ length: 12 }, (_, index) =>
      player({
        minutes: 100 + (index % 4) * 100,
        goals: index % 5,
        jerseyNumber: index + 1,
        declarations: everywhere(index % 2 === 0 ? "primary" : "secondary"),
      }),
    );
    const forwards = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates,
    });
    const backwards = bestSeven({
      criterion: "goals",
      direction: "best",
      slots: CLASSIC_SEVEN,
      candidates: [...candidates].reverse(),
    });

    expect(backwards.picks.map((pick) => pick.player?.id)).toEqual(
      forwards.picks.map((pick) => pick.player?.id),
    );
  });
});

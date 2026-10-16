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
    goalsForWhileOn: 0,
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

  it("puts the man the team scores most with up front, and the keeper who concedes least in goal", () => {
    const result = solveSeven("offensive", {
      slots,
      candidates: [
        player({ displayName: "Déclencheur", minutes: 600, goals: 0, goalsForWhileOn: 20, declarations: { AT: "primary" } }),
        player({ displayName: "Suiveur", minutes: 600, goals: 5, goalsForWhileOn: 6, declarations: { AT: "primary" } }),
        keeper("Passoire", 300, 15),
        keeper("Mur", 300, 3),
      ],
    });
    expect(pickedName(result, "at")).toBe("Déclencheur");
    expect(pickedName(result, "gb")).toBe("Mur");
    expect(result.picks.find((pick) => pick.slotId === "at")?.cell?.figure).toBe("teamGoalsFor");
    expect(result.picks.find((pick) => pick.slotId === "gb")?.cell?.figure).toBe("keeperConceded");
  });

  /**
   * The whole point of the change. « Il faut que ce soit les joueurs, qui, lorsqu'à chaque poste,
   * l'équipe marque le plus » — so the man who scores most himself loses to the man the team scores
   * most with, and the disc carries the team's record rather than his own.
   */
  it("ranks on the team's goals, not his own, when the two disagree", () => {
    const candidates = [
      player({ displayName: "Buteur solitaire", minutes: 600, goals: 12, goalsForWhileOn: 13, declarations: { AT: "primary" } }),
      player({ displayName: "Fait jouer", minutes: 600, goals: 1, goalsForWhileOn: 25, declarations: { AT: "primary" } }),
    ];
    const result = solveSeven("offensive", { slots: [slot("at", "AT")], candidates });
    expect(pickedName(result, "at")).toBe("Fait jouer");
    // And the old criterion would have said the opposite: he is the better scorer of the two.
    const cellOf = (name: string) => result.cells[result.candidates.findIndex((c) => c.id === name)][0];
    expect(cellOf("Fait jouer").observed.numerator).toBe(25);
    expect(cellOf("Fait jouer").observed.secondary).toBe(1);
    expect(cellOf("Buteur solitaire").adjusted!).toBeLessThan(cellOf("Fait jouer").adjusted!);
  });

  /** A squad of ten, so the shrinkage has a real squad to measure a prior strength from. */
  const squadOfTen = (thin: SevenCandidate) => [
    thin,
    player({ displayName: "Toute la saison", minutes: 600, goalsForWhileOn: 60, declarations: { AT: "primary" } }),
    ...Array.from({ length: 8 }, (_, index) =>
      player({ displayName: `Banal ${index}`, minutes: 600, goalsForWhileOn: 28 + index, declarations: { AT: "primary" } }),
    ),
  ];

  /**
   * « Si je joue 5 mn, et qu'il y a 8 buts, ça n'est pas représentatif. » The shrinkage is the answer
   * and it is continuous — no minimum-minutes gate, which the owner refused (decision 187).
   *
   * A plausible thin record loses: two team goals in five minutes is eight times the squad's rate and
   * still ends up below a whole season at twice it.
   */
  it("does not let a thin record win the attack on a rate it cannot support", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: squadOfTen(
        player({ displayName: "Cinq minutes", minutes: 5, goalsForWhileOn: 2, declarations: { AT: "primary" } }),
      ),
    });
    expect(pickedName(result, "at")).toBe("Toute la saison");
  });

  /**
   * The owner's own arithmetic, as a limit rather than as a promise.
   *
   * Eight team goals in five minutes is 96 per 60 — a rate no 7-a-side match has ever produced — and the
   * shrinkage pulls it 89 % of the way back to the squad, to about 10,7. That is the « relativiser »
   * he asked for, and it is **not** enough to put him behind a full season at 6,0: a prior worth one to
   * six 60-minute blocks cannot absorb an outlier that large. The guard against it is the one he chose
   * himself — the real record is printed under the name, « 8 buts de l'équipe sur 5′ », so a reader can
   * see what the figure rests on. Pinned here so that nobody reads the sentence above as a stronger
   * claim than the code makes.
   */
  it("pulls a five-minute record almost all the way back, without pretending it vanishes", () => {
    const thin = player({ displayName: "Cinq minutes", minutes: 5, goalsForWhileOn: 8, declarations: { AT: "primary" } });
    const result = solveSeven("offensive", { slots: [slot("at", "AT")], candidates: squadOfTen(thin) });
    const cell = result.cells[result.candidates.findIndex((c) => c.id === "Cinq minutes")][0];
    expect(cell.observed.rate).toBeCloseTo(96);
    expect(cell.adjusted!).toBeLessThan(12);
    expect(cell.observed.numerator).toBe(8);
    expect(cell.observed.denominator).toBe(5);
  });

  it("lets his own goals decide between two men the screen prints alike", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Sans but", minutes: 600, goals: 0, goalsForWhileOn: 10, declarations: { AT: "primary" } }),
        player({ displayName: "Avec buts", minutes: 600, goals: 6, goalsForWhileOn: 10, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Avec buts");
  });

  it("does not let his own goals outweigh a team rate the screen prints higher", () => {
    const result = solveSeven("offensive", {
      slots: [slot("at", "AT")],
      candidates: [
        player({ displayName: "Buteur", minutes: 600, goals: 20, goalsForWhileOn: 21, declarations: { AT: "primary" } }),
        player({ displayName: "Catalyseur", minutes: 600, goals: 0, goalsForWhileOn: 40, declarations: { AT: "primary" } }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Catalyseur");
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
  /**
   * Decision 198: the impact is the raw division, here as on `/stats`. Over a short season the squad's
   * own difference is negative, and the shrinkage this replaces dragged a `+1 / −0` spell below a long
   * record that conceded twice as much as it scored. The owner read the result and rejected it.
   */
  it("ranks a post on the raw goal difference, short spells included", () => {
    const result = solveSeven("legende", {
      slots: [slot("mc", "MC")],
      candidates: [
        player({
          displayName: "Dix minutes",
          minutes: 600,
          declarations: { MC: "primary" },
          positions: [at("MC", 10, 1, 0)],
        }),
        player({
          displayName: "Toute la saison",
          minutes: 600,
          declarations: { MC: "primary" },
          positions: [at("MC", 600, 10, 20)],
        }),
      ],
    });
    const cellOf = (name: string) => result.cells[result.candidates.findIndex((c) => c.id === name)][0];
    // +1 in ten minutes is +6,0 for 60′ — reproducible by hand, and it leads.
    expect(cellOf("Dix minutes").adjusted).toBeCloseTo(6);
    expect(cellOf("Toute la saison").adjusted).toBeCloseTo(-1);
    expect(pickedName(result, "mc")).toBe("Dix minutes");
  });

  it("is exactly zero at MC where nothing happened either way", () => {
    const result = solveSeven("legende", {
      slots: [slot("mc", "MC")],
      candidates: [
        player({
          displayName: "Six minutes",
          minutes: 600,
          declarations: { MC: "primary" },
          positions: [at("MC", 6, 0, 0)],
        }),
      ],
    });
    expect(result.cells[0][0].adjusted).toBe(0);
  });

  /* ---- one criterion per post: one test each --------------------------------- */

  it("ranks AT on his own goals per outfield minute, not on anything measured at the post", () => {
    const result = solveSeven("legende", {
      slots: [slot("at", "AT")],
      candidates: [
        // The team scores far more with him at AT, and that is not what this post is judged on:
        // `match_player_positions` holds no per-player goal, so « plus de buts marqués » is his own.
        player({
          displayName: "Porté par l’équipe",
          minutes: 600,
          goals: 2,
          declarations: { AT: "primary" },
          positions: [at("AT", 600, 40, 5)],
        }),
        player({
          displayName: "Vrai buteur",
          minutes: 600,
          goals: 14,
          declarations: { AT: "primary" },
          positions: [at("AT", 600, 15, 5)],
        }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Vrai buteur");
    const pick = result.picks.find((p) => p.slotId === "at");
    expect(pick?.cell?.figure).toBe("goals");
    // The record is his goals over his outfield minutes, which is the denominator the copy promises.
    expect(pick?.cell?.observed.numerator).toBe(14);
    expect(pick?.cell?.observed.denominator).toBe(600);
  });

  it("ranks AIL on the team's goals while he holds that post", () => {
    const result = solveSeven("legende", {
      slots: [slot("ail", "AIL")],
      candidates: [
        player({
          displayName: "Buteur ailleurs",
          minutes: 600,
          goals: 20,
          declarations: { AIL: "primary" },
          positions: [at("AIL", 600, 8, 4)],
        }),
        player({
          displayName: "Équipe qui marque",
          minutes: 600,
          goals: 0,
          declarations: { AIL: "primary" },
          positions: [at("AIL", 600, 30, 4)],
        }),
      ],
    });
    expect(pickedName(result, "ail")).toBe("Équipe qui marque");
    const pick = result.picks.find((p) => p.slotId === "ail");
    expect(pick?.cell?.figure).toBe("teamGoalsFor");
    expect(pick?.cell?.observed.numerator).toBe(30);
  });

  it("ranks DC on the goals the team conceded at that post, fewest first", () => {
    const result = solveSeven("legende", {
      slots: [slot("dc", "DC")],
      candidates: [
        // A better goal difference at DC, and more conceded there: the old criterion took him, the
        // owner's « celui qui a le moins de buts pris » does not.
        player({
          displayName: "Grosse différence",
          minutes: 600,
          declarations: { DC: "primary" },
          positions: [at("DC", 600, 30, 12)],
        }),
        player({
          displayName: "Rempart",
          minutes: 600,
          declarations: { DC: "primary" },
          positions: [at("DC", 600, 2, 3)],
        }),
      ],
    });
    expect(pickedName(result, "dc")).toBe("Rempart");
    const pick = result.picks.find((p) => p.slotId === "dc");
    expect(pick?.cell?.figure).toBe("outfieldConceded");
    expect(pick?.cell?.observed.numerator).toBe(3);
  });

  it("ranks MC on the goal difference at that post", () => {
    const result = solveSeven("legende", {
      slots: [slot("mc", "MC")],
      candidates: [
        player({
          displayName: "Organisateur",
          minutes: 600,
          declarations: { MC: "primary" },
          positions: [at("MC", 600, 20, 5)],
        }),
        // Concedes less at MC, but the team scores almost nothing with him there: the difference is
        // what « meilleur organisateur » was delegated to, and it prefers the first.
        player({
          displayName: "Stérile",
          minutes: 600,
          declarations: { MC: "primary" },
          positions: [at("MC", 600, 2, 2)],
        }),
      ],
    });
    expect(pickedName(result, "mc")).toBe("Organisateur");
    expect(result.picks[0].cell?.figure).toBe("impact");
  });

  it("fills the attack first, even when the total would rather have him at the back", () => {
    const result = solveSeven("legende", {
      slots: [slot("dc", "DC"), slot("at", "AT")],
      candidates: [
        // Star scores more than Second and also concedes far less at DC. The sum of the two posts
        // wants Star at DC; « en commençant par l'attaque » wants Star up front.
        player({
          displayName: "Star",
          minutes: 6000,
          goals: 300,
          declarations: { AT: "primary", DC: "secondary" },
          positions: [at("AT", 3000, 150, 50), at("DC", 3000, 200, 2)],
        }),
        player({
          displayName: "Second",
          minutes: 6000,
          goals: 290,
          declarations: { AT: "primary", DC: "secondary" },
          positions: [at("AT", 3000, 140, 50), at("DC", 3000, 50, 100)],
        }),
      ],
    });
    expect(pickedName(result, "at")).toBe("Star");
    expect(pickedName(result, "dc")).toBe("Second");
    expect(result.picks.find((pick) => pick.slotId === "at")?.cell?.figure).toBe("goals");
    expect(result.picks.find((pick) => pick.slotId === "dc")?.cell?.figure).toBe("outfieldConceded");
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

  /**
   * Decision 198 took the shrinkage out of the impact, which also took away the post's mean: the man
   * who has never held the post has no figure there at all now, where he used to be credited the
   * post's own average. So the seven says so — a `null` under his name rather than a number that is
   * not his — and it places the man who *has* played the post first even when that man's record is
   * negative. A bare `0` for « never played » would have promoted him above every real record below
   * zero, which is how a seven claiming « le meilleur à ce poste » ends up showing a « — ».
   */
  it("gives a man with no minutes at a post no figure at all, and prefers the man who played it", () => {
    const result = solveSeven("legende", {
      slots: [slot("mc", "MC")],
      candidates: [
        player({ displayName: "Habitué", minutes: 600, declarations: { MC: "primary" }, positions: [at("MC", 600, 2, 10)] }),
        player({ displayName: "Nouveau", minutes: 600, declarations: { MC: "primary" } }),
      ],
    });
    const cellOf = (name: string) => result.cells[result.candidates.findIndex((c) => c.id === name)][0];
    expect(cellOf("Nouveau").observed.denominator).toBe(0);
    expect(cellOf("Nouveau").adjusted).toBeNull();
    // Habitué is at −0,8 per 60 and still goes in: measured beats unmeasured.
    expect(cellOf("Habitué").adjusted).toBeCloseTo(-0.8);
    expect(pickedName(result, "mc")).toBe("Habitué");
  });

  it("gives no figure at AIL or DC either to a man who never held the post", () => {
    for (const [code, figure] of [
      ["AIL", "teamGoalsFor"],
      ["DC", "outfieldConceded"],
    ] as const) {
      const result = solveSeven("legende", {
        slots: [slot("s", code)],
        candidates: [
          player({ displayName: "Habitué", minutes: 600, declarations: { [code]: "primary" }, positions: [at(code, 600, 1, 30)] }),
          player({ displayName: "Nouveau", minutes: 600, declarations: { [code]: "primary" } }),
        ],
      });
      const cellOf = (name: string) => result.cells[result.candidates.findIndex((c) => c.id === name)][0];
      expect(cellOf("Nouveau").adjusted, code).toBeNull();
      expect(cellOf("Habitué").adjusted, code).not.toBeNull();
      expect(cellOf("Habitué").figure, code).toBe(figure);
      // Even a dreadful record at the post beats having never held it — the same house rule as MC,
      // and the reason the DC key is negated rather than left as « fewest is a small number ».
      expect(pickedName(result, "s"), code).toBe("Habitué");
    }
  });

  /**
   * « Si le gardien est aussi le meilleur attaquant, prendre le deuxième meilleur gardien. »
   *
   * No code answers this: the bitmask DP of `best-seven.ts` assigns exactly, so one man takes one slot
   * and the rest of the seven is re-optimised around him. The test is here to pin that the owner's rule
   * falls out of the existing machine, and to catch the day somebody replaces it with a greedy fill.
   */
  it("gives the goal to the second-best keeper when the best one is also the best striker", () => {
    const result = solveSeven("legende", {
      slots: [slot("gb", "GB"), slot("at", "AT")],
      candidates: [
        // Best keeper of the squad *and* the best scorer by a distance.
        player({
          displayName: "Phénomène",
          minutes: 1200,
          goals: 40,
          gkMinutes: 600,
          concededWhileGk: 2,
          declarations: { GB: "primary", AT: "primary" },
          positions: [at("AT", 600, 45, 10)],
        }),
        player({
          displayName: "Deuxième gardien",
          minutes: 600,
          goals: 0,
          gkMinutes: 600,
          concededWhileGk: 6,
          declarations: { GB: "primary" },
        }),
        player({ displayName: "Troisième gardien", minutes: 600, gkMinutes: 600, concededWhileGk: 40, declarations: { GB: "primary" } }),
      ],
    });
    // The lexicographic keys put AT first, so he goes up front and the goal falls to the next keeper.
    expect(pickedName(result, "at")).toBe("Phénomène");
    expect(pickedName(result, "gb")).toBe("Deuxième gardien");
    // Complete and valid: seven would be seven here too — two slots, two different men, no empty one.
    expect(result.picks.every((pick) => pick.player !== null)).toBe(true);
    expect(new Set(result.picks.map((pick) => pick.player?.id)).size).toBe(2);
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

import { describe, expect, it } from "vitest";

import {
  NO_VALUE_FR,
  appearancesLineFr,
  cleanShareFr,
  cleanSharePercentFr,
  concededEveryFr,
  concededRateFr,
  concededRateLineFr,
  concededRecordFr,
  formatDecimal,
  formatSignedDecimal,
  impactRecordFr,
  formatMinutes,
  formatPercent,
  formatRating,
  formatRecord,
  formatSigned,
  formEntryLabelFr,
  pendingRatingMatchesNoteFr,
  pendingRatingsNoteFr,
  matchCount,
  plural,
  resultLabelOf,
  resultLetterOf,
} from "./format";

describe("formatMinutes", () => {
  it("writes a football minute with a prime", () => {
    expect(formatMinutes(312)).toBe("312′");
    expect(formatMinutes(0)).toBe("0′");
  });
});

describe("formatDecimal", () => {
  it("uses a comma, as French does", () => {
    expect(formatDecimal(6.25, 2)).toBe("6,25");
    expect(formatDecimal(7)).toBe("7,0");
  });
});

describe("formatRating", () => {
  it("shows one decimal", () => {
    expect(formatRating(6.6666)).toBe("6,7");
    expect(formatRating(0)).toBe("0,0");
  });

  it("shows a dash when nobody has rated — never 0,0", () => {
    expect(formatRating(null)).toBe(NO_VALUE_FR);
  });
});

describe("formatPercent", () => {
  it("rounds and keeps a non-breaking space before the sign", () => {
    expect(formatPercent(0.8)).toBe("80 %");
    expect(formatPercent(2 / 3)).toBe("67 %");
    expect(formatPercent(0)).toBe("0 %");
  });

  it("shows a dash rather than 0 % for an unknown rate", () => {
    expect(formatPercent(null)).toBe(NO_VALUE_FR);
  });
});

describe("formatSigned", () => {
  it("signs a goal difference both ways", () => {
    expect(formatSigned(3)).toBe("+3");
    expect(formatSigned(-1)).toBe("-1");
    expect(formatSigned(0)).toBe("0");
  });
});

describe("formatRecord", () => {
  it("fits a whole season's record on one line", () => {
    expect(formatRecord(2, 1, 0)).toBe("2 V · 1 N · 0 D");
  });
});

describe("results", () => {
  it("has a letter and a label for each outcome", () => {
    expect(resultLetterOf("win")).toBe("V");
    expect(resultLetterOf("draw")).toBe("N");
    expect(resultLetterOf("loss")).toBe("D");
    expect(resultLabelOf("win")).toBe("Victoire");
    expect(resultLabelOf("draw")).toBe("Match nul");
    expect(resultLabelOf("loss")).toBe("Défaite");
  });
});

describe("formEntryLabelFr", () => {
  it("says the result, the score, whose ground it was and when", () => {
    expect(
      formEntryLabelFr({
        result: "loss",
        scoreFr: "0 – 2",
        fixtureFr: "à CS Morvan",
        dayFr: "dim. 14/09/2026",
      }),
    ).toBe("Défaite 0 – 2 à CS Morvan, dim. 14/09/2026");
  });
});

describe("plural", () => {
  it("adds an s only past one", () => {
    expect(plural(0, "but")).toBe("0 but");
    expect(plural(1, "but")).toBe("1 but");
    expect(plural(2, "but")).toBe("2 buts");
  });

  it("takes an irregular plural", () => {
    expect(plural(3, "match", "matchs")).toBe("3 matchs");
    expect(matchCount(1)).toBe("1 match");
    expect(matchCount(4)).toBe("4 matchs");
  });
});

describe("appearancesLineFr", () => {
  /** Karim's demo season: seven sheets, six matches with minutes. */
  const karim = { selected: 7, starter: 7, substitute: 0, supporter: 0, goalkeeper: 0 };

  it("leads with the sheet total, which is what explains « Matchs 6 » above it", () => {
    expect(appearancesLineFr(karim, { withSheetTotal: true })).toBe(
      "7 matchs sur la feuille · 7 fois titulaire",
    );
  });

  it("omits the sheet total for the profile card, whose header already prints it", () => {
    expect(appearancesLineFr(karim)).toBe("7 fois titulaire");
  });

  it("says « fois » rather than agreeing the noun, so a plural is never wrong", () => {
    expect(
      appearancesLineFr({ selected: 6, starter: 1, substitute: 5, supporter: 0, goalkeeper: 2 }),
    ).toBe("1 fois titulaire · 5 fois remplaçant · 2 fois gardien");
  });

  it("drops the roles nobody has, and the singular reads as French", () => {
    expect(
      appearancesLineFr({ selected: 1, starter: 0, substitute: 0, supporter: 1, goalkeeper: 0 }),
    ).toBe("1 fois supporter");
  });

  it("is null for a player who has never been on a sheet, so the card prints nothing", () => {
    const none = { selected: 0, starter: 0, substitute: 0, supporter: 0, goalkeeper: 0 };
    expect(appearancesLineFr(none)).toBeNull();
    expect(appearancesLineFr(none, { withSheetTotal: true })).toBeNull();
  });
});

describe("pendingRatingMatchesNoteFr", () => {
  /** Nothing waiting: the averages are complete, and a note would invent a reason for a figure. */
  it("says nothing when every match's notes are in", () => {
    expect(pendingRatingMatchesNoteFr(0)).toBeNull();
  });

  /**
   * The same sentence for every reader — the whole of decision 137 in this file. It must not reproach
   * anybody and must not depend on what the reader has written: the old wording did both.
   */
  it("names the matches and says the means arrive together", () => {
    const note = pendingRatingMatchesNoteFr(2);
    expect(note).toBe(
      "2 matchs ne sont pas comptés ici : toutes les notes ne sont pas encore rentrées. " +
        "Les moyennes arriveront d’un coup.",
    );
    expect(note).not.toContain("tu n’as pas");
    expect(note).not.toContain("débloquent");
  });

  it("agrees with one match", () => {
    expect(pendingRatingMatchesNoteFr(1)).toContain("1 match n’est pas compté ici");
  });
});

describe("pendingRatingsNoteFr", () => {
  it("says nothing when none of his matches is waiting", () => {
    expect(pendingRatingsNoteFr(0, true)).toBeNull();
  });

  /** Second person on one's own profile, third on somebody else's — as everywhere else (074). */
  it("says « tes notes » or « ses notes », and blames nobody", () => {
    expect(pendingRatingsNoteFr(2, true)).toBe(
      "Tes notes sur 2 matchs ne sont pas encore sorties : elles arrivent quand tout le monde a noté.",
    );
    expect(pendingRatingsNoteFr(1, false)).toContain("Ses notes sur 1 match");
  });
});


describe("the rate and impact copy (decisions 162 and 177)", () => {
  it("states the raw rate as a whole number of minutes, never below one", () => {
    expect(concededEveryFr(72, 3)).toBe("toutes les 24′");
    expect(concededEveryFr(71, 3)).toBe("toutes les 24′");
    expect(concededEveryFr(1, 5)).toBe("toutes les 1′");
    expect(concededEveryFr(35, 0)).toBe("jamais");
  });

  it("prints the ranked rate over the record it is, never infinity", () => {
    expect(concededRateFr(3, 120)).toEqual({
      rate: "1 but toutes les 40′",
      record: "3 buts encaissés en 120′",
    });
    expect(concededRateFr(1, 20)).toEqual({
      rate: "1 but toutes les 20′",
      record: "1 but encaissé en 20′",
    });
    expect(concededRateFr(0, 35)).toEqual({ rate: "aucun but encaissé", record: "en 35′" });
  });

  it("prints a conceded rate with the minutes it is a rate over (decision 184)", () => {
    expect(concededRateLineFr(4, 120)).toBe("1 but toutes les 30′ sur 120′");
    expect(concededRateLineFr(1, 8)).toBe("1 but toutes les 8′ sur 8′");
    // Rounding never pushes the rate below a minute, and the denominator says it is eight minutes.
    expect(concededRateLineFr(8, 8)).toBe("1 but toutes les 1′ sur 8′");
  });

  it("refuses a conceded rate it cannot compute, and prints the record instead", () => {
    // Nobody conceded: no division, and the sentence the cahier asks for in place of ∞.
    expect(concededRateLineFr(0, 35)).toBe("aucun but encaissé en 35′");
    expect(concededRateLineFr(0, 0)).toBe("aucun but encaissé en 0′");
    // Minutes are floored, so a forty-second stint that conceded is `0′`: no « toutes les 0′ », and
    // no rate invented out of a rounding either.
    expect(concededRateLineFr(1, 0)).toBe("1 but encaissé en 0′");
  });

  it("turns clean minutes into a share of the minutes they are a share of (decision 184)", () => {
    expect(cleanShareFr(85, 120)).toBe("71 % de 120′ jouées");
    expect(cleanShareFr(120, 120)).toBe("100 % de 120′ jouées");
    expect(cleanShareFr(0, 60)).toBe("0 % de 60′ jouées");
    // Six clean minutes are 100 %, and the denominator beside it is the whole point.
    expect(cleanShareFr(6, 6)).toBe("100 % de 6′ jouées");
  });

  it("has no invincibility share for a man who has not played", () => {
    expect(cleanShareFr(0, 0)).toBeNull();
    expect(cleanSharePercentFr(0, 0)).toBeNull();
  });

  it("prints the share alone where the denominator is already beside it", () => {
    expect(cleanSharePercentFr(20, 30)).toBe("67 %");
    // A keeper's share is `gkCleanMinutes / gkMinutes`, and an outfielder's `cleanMinutes / minutes`:
    // the same function, never the difference of the two (rule 10 of `aggregate.ts`).
    expect(cleanSharePercentFr(30, 30)).toBe("100 %");
  });

  it("says « aucun but encaissé » in the record rather than infinity", () => {
    expect(concededRecordFr(0, 35)).toBe("aucun but encaissé en 35′");
    expect(concededRecordFr(1, 20)).toBe("1 but encaissé en 20′");
    expect(concededRecordFr(3, 72)).toBe("3 buts encaissés en 72′");
  });

  it("signs an impact, and never prints « −0,0 »", () => {
    expect(formatSignedDecimal(1.24)).toBe("+1,2");
    expect(formatSignedDecimal(-0.76)).toBe("−0,8");
    expect(formatSignedDecimal(-0.04)).toBe("0,0");
    expect(impactRecordFr(5, 2, 120)).toBe("+5 / −2 en 120′");
  });
});

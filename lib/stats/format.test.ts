import { describe, expect, it } from "vitest";

import {
  ATTENDANCE_NOT_FILTERED_FR,
  NO_VALUE_FR,
  appearancesLineFr,
  attendanceHintFr,
  formatAttendance,
  formatDecimal,
  formatMinutes,
  formatPercent,
  formatRating,
  formatRecord,
  formatSigned,
  formEntryLabelFr,
  hiddenRatingsNoteFr,
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

describe("formatAttendance", () => {
  it("always carries its denominator (decision 020)", () => {
    expect(formatAttendance(8, 10, 0.8)).toBe("8/10 · 80 %");
    expect(formatAttendance(0, 2, 0)).toBe("0/2 · 0 %");
  });

  it("shows a dash for a player nobody marked — not 0/0, not 0 %", () => {
    expect(formatAttendance(0, 0, null)).toBe(NO_VALUE_FR);
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
        dayFr: "dim. 14 sept.",
      }),
    ).toBe("Défaite 0 – 2 à CS Morvan, dim. 14 sept.");
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

describe("attendanceHintFr", () => {
  /** The usual case: every figure on the card covers the same season, so the hint only has to say
   *  what the denominator counts (decision 020). */
  it("names the denominator when nothing is filtered", () => {
    expect(attendanceHintFr(false)).toBe("séances pointées");
  });

  /**
   * The « Coupe » tab left a player's card showing five dashes — no matches, minutes, goals, assists
   * or rating in this selection — and one number, « 1/2 · 50 % », which was the whole season's. The
   * hint is what tells the reader that this one figure is outside the chip he tapped.
   */
  it("says the rate covers the whole season when a competition filter is on", () => {
    expect(attendanceHintFr(true)).toBe("séances pointées, toute la saison");
    expect(attendanceHintFr(true)).toContain("toute la saison");
  });

  /** The two must differ, or the figure is unqualified on the screen where it needs qualifying. */
  it("never says the same thing in both states", () => {
    expect(attendanceHintFr(true)).not.toBe(attendanceHintFr(false));
  });
});

describe("ATTENDANCE_NOT_FILTERED_FR", () => {
  /**
   * Shared by the per-player cards and « Présence aux entraînements », so it cannot say « cette
   * carte » — on a player's card the filter applies to everything *except* the presence.
   */
  it("says why the figure ignores the filter, without naming a card", () => {
    expect(ATTENDANCE_NOT_FILTERED_FR).toContain("ne s’applique pas à la présence");
    expect(ATTENDANCE_NOT_FILTERED_FR).toContain("n’appartient à aucune compétition");
    expect(ATTENDANCE_NOT_FILTERED_FR).not.toContain("cette carte");
  });
});

describe("hiddenRatingsNoteFr", () => {
  /** Nothing held back: the dash beside it means what it says, and a note would invent a reason. */
  it("says nothing when the reader has earned every match", () => {
    expect(hiddenRatingsNoteFr(0, 4, false)).toBeNull();
  });

  /**
   * Ali's own profile: every note he has received sits in a match he has not rated, so the card shows
   * « — ». The old sentence announced two matches « exclus de cette moyenne » under no moyenne at all.
   */
  it("explains a missing average rather than excluding matches from it", () => {
    const note = hiddenRatingsNoteFr(2, 0, true);
    expect(note).toBe(
      "Tes notes sur 2 matchs restent cachées tant que tu n’as pas noté tes coéquipiers : " +
        "c’est pourquoi il n’y a pas de moyenne.",
    );
    expect(note).not.toContain("exclus de cette moyenne");
  });

  /** Somebody else's profile, same gate, same reason — it is always the reader who has not voted. */
  it("says « ses notes » on another player's profile", () => {
    expect(hiddenRatingsNoteFr(1, 0, false)).toContain("Ses notes sur 1 match");
    expect(hiddenRatingsNoteFr(1, 0, true)).toContain("Tes notes sur 1 match");
  });

  /** With something visible, the average is real and the sentence says what it covers. */
  it("bounds an average that exists instead of denying it", () => {
    expect(hiddenRatingsNoteFr(1, 4, false)).toBe(
      "Ses notes sur 1 match restent cachées tant que tu n’as pas noté tes coéquipiers. " +
        "La moyenne ne porte que sur les matchs que tu as notés.",
    );
  });
});


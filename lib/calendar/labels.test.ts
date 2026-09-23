import { describe, expect, it } from "vitest";

import {
  attendanceCountFr,
  entryModeBadgeFr,
  matchLengthHintFr,
  periodsLabel,
  resultLabel,
  resultLetter,
  scoreLineFr,
} from "./labels";

describe("entryModeBadgeFr", () => {
  it("says so for a match typed up afterwards", () => {
    expect(entryModeBadgeFr("retro", { recorded: true })).toBe("saisi après le match");
  });

  /**
   * A badge on every match of the season would be noise, and the caller renders nothing at all on
   * `null` — so if this ever starts returning a string, every card in the calendar grows a label
   * nobody needs.
   */
  it("says nothing about a match that was followed live", () => {
    expect(entryModeBadgeFr("live", { recorded: true })).toBeNull();
  });

  /**
   * The state the demo season is in for FC des Deux-Ponts: `entry_mode = retro`, nine men on the
   * sheet, an empty log. The label describes a log, so with no log there is nothing to describe —
   * « saisi après le match » there would be a claim about an afternoon nobody has typed up yet.
   */
  it("says nothing when there is no log to have been entered", () => {
    expect(entryModeBadgeFr("retro", { recorded: false })).toBeNull();
    expect(entryModeBadgeFr("live", { recorded: false })).toBeNull();
  });
});

describe("the labels the match header shares with the calendar", () => {
  it("names the result from the two goal counts", () => {
    expect(resultLabel(3, 1)).toBe("Victoire");
    expect(resultLabel(1, 1)).toBe("Match nul");
    expect(resultLabel(0, 2)).toBe("Défaite");
    expect(resultLetter(3, 1)).toBe("V");
  });

  it("spells the periods the way the owner writes them", () => {
    expect(periodsLabel(2, 30)).toBe("2×30 minutes");
  });

  /*
   * The one thing worth asserting about a scoreline is what it does *not* do. Both scoreboards used
   * to put the home side first, so an away win read « 0 – 2 » in 36 px numerals over a 12 px caption
   * that truncated — and, on the recap, over a timeline that had written the same match « 2 – 0 ».
   * There is deliberately no orientation argument; if one is ever added, this test is the reason it
   * should not be.
   */
  it("always writes our goals first, home or away", () => {
    expect(scoreLineFr(2, 0)).toBe("2 – 0");
    expect(scoreLineFr(0, 2)).toBe("0 – 2");
    // An en dash, not a hyphen: it is a score, not a range of two numbers.
    expect(scoreLineFr(1, 1)).toContain("–");
    expect(scoreLineFr(1, 1)).not.toContain("-");
  });
});

describe("attendanceCountFr", () => {
  /**
   * The line the demo season's 29 August session prints. Fourteen players were marked that night and
   * thirteen are in the squad today, because one had left by September — so « sur 14 » is right and
   * only looks wrong. « pointés » is the word that says the denominator is the list the coach ticked
   * and not the size of the team (decision 020).
   */
  it("names what the denominator counts", () => {
    expect(attendanceCountFr(11, 14)).toBe("11 présents sur 14 pointés");
  });

  it("keeps both halves singular when both are one", () => {
    expect(attendanceCountFr(1, 1)).toBe("1 présent sur 1 pointé");
    expect(attendanceCountFr(0, 13)).toBe("0 présent sur 13 pointés");
  });
});

describe("matchLengthHintFr", () => {
  /**
   * The default, and the one a coach actually needs told: the second period of a 2×30 runs 30′→60′,
   * because this app never resets the clock at half time (decision 009).
   */
  it("states the total and where the last period starts", () => {
    expect(matchLengthHintFr(2, 30)).toBe(
      "2×30 minutes : 60 minutes de jeu, et la 2ᵉ période va de la 30ᵉ à la 60ᵉ minute.",
    );
    expect(matchLengthHintFr(4, 15)).toBe(
      "4×15 minutes : 60 minutes de jeu, et la 4ᵉ période va de la 45ᵉ à la 60ᵉ minute.",
    );
  });

  it("says nothing about a second half when there is one period", () => {
    const hint = matchLengthHintFr(1, 40);
    expect(hint).toBe("1×40 minutes : 40 minutes de jeu.");
    expect(hint).not.toContain("période");
  });

  /**
   * An emptied field gives `Number("") === 0` and a half-typed one `NaN`. Computing « 0×30 minutes :
   * 0 minutes de jeu » from either would be the form stating something false about the match being
   * created, which is the whole reason this sentence is built by a function with a test.
   */
  it("refuses a pair it cannot read rather than invent a duration", () => {
    expect(matchLengthHintFr(0, 30)).toBeNull();
    expect(matchLengthHintFr(2, 0)).toBeNull();
    expect(matchLengthHintFr(Number.NaN, 30)).toBeNull();
    expect(matchLengthHintFr(2, Number.NaN)).toBeNull();
    expect(matchLengthHintFr(2.5, 30)).toBeNull();
  });
});

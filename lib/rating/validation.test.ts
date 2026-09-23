import { describe, expect, it } from "vitest";

import {
  RATING_COMMENT_MAX,
  ratingCommentSchema,
  ratingScoreSchema,
  readRatingEntries,
  submitRatingsSchema,
} from "./validation";

const HUGO = "11111111-1111-4111-8111-111111111111";
const KARIM = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const TEAM = "44444444-4444-4444-8444-444444444444";

describe("ratingScoreSchema", () => {
  it("accepts the whole range, as the strings a radio submits", () => {
    for (const value of ["0", "5", "10"]) {
      expect(ratingScoreSchema.parse(value)).toBe(Number(value));
    }
  });

  it("refuses anything the column could not hold", () => {
    expect(ratingScoreSchema.safeParse("11").success).toBe(false);
    expect(ratingScoreSchema.safeParse("-1").success).toBe(false);
    expect(ratingScoreSchema.safeParse("7.5").success).toBe(false);
    expect(ratingScoreSchema.safeParse("beaucoup").success).toBe(false);
  });

  it("explains a half-note as a whole-number problem, not a range problem", () => {
    const result = ratingScoreSchema.safeParse("7.5");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("entier");
  });
});

describe("ratingCommentSchema", () => {
  it("turns an empty or blank comment into null", () => {
    expect(ratingCommentSchema.parse("")).toBeNull();
    expect(ratingCommentSchema.parse("   ")).toBeNull();
    expect(ratingCommentSchema.parse(undefined)).toBeNull();
  });

  it("trims what is kept", () => {
    expect(ratingCommentSchema.parse("  énorme match  ")).toBe("énorme match");
  });

  it("refuses a comment longer than the limit", () => {
    expect(ratingCommentSchema.safeParse("a".repeat(RATING_COMMENT_MAX)).success).toBe(true);
    expect(ratingCommentSchema.safeParse("a".repeat(RATING_COMMENT_MAX + 1)).success).toBe(false);
  });
});

describe("readRatingEntries", () => {
  function formData(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }

  it("pairs each score with its comment", () => {
    const entries = readRatingEntries(
      formData({
        teamId: TEAM,
        matchId: MATCH,
        [`score:${HUGO}`]: "8",
        [`comment:${HUGO}`]: "arrêt décisif",
        [`score:${KARIM}`]: "6",
      }).entries(),
    );

    expect(entries).toEqual([
      { ratedMemberId: HUGO, score: "8", comment: "arrêt décisif" },
      { ratedMemberId: KARIM, score: "6", comment: undefined },
    ]);
  });

  it("skips a player nobody rated yet, so a half-filled form still saves", () => {
    const entries = readRatingEntries(
      formData({ [`score:${HUGO}`]: "8", [`score:${KARIM}`]: "" }).entries(),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.ratedMemberId).toBe(HUGO);
  });

  it("drops a comment that has no note to hang on", () => {
    const entries = readRatingEntries(formData({ [`comment:${KARIM}`]: "bof" }).entries());
    expect(entries).toEqual([]);
  });

  it("keeps a bad score so it can be reported rather than silently ignored", () => {
    const entries = readRatingEntries(formData({ [`score:${HUGO}`]: "42" }).entries());
    expect(entries).toEqual([{ ratedMemberId: HUGO, score: "42", comment: undefined }]);
  });

  it("ignores fields that are not a score or a comment", () => {
    expect(
      readRatingEntries(formData({ teamId: TEAM, matchId: MATCH, "score:": "8" }).entries()),
    ).toEqual([]);
  });
});

describe("submitRatingsSchema", () => {
  it("accepts a well-formed partial submission", () => {
    const parsed = submitRatingsSchema.safeParse({
      teamId: TEAM,
      matchId: MATCH,
      entries: [{ ratedMemberId: HUGO, score: "8", comment: "" }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.entries[0]).toEqual({ ratedMemberId: HUGO, score: 8, comment: null });
    }
  });

  it("refuses a submission with nothing in it", () => {
    const parsed = submitRatingsSchema.safeParse({ teamId: TEAM, matchId: MATCH, entries: [] });
    expect(parsed.success).toBe(false);
  });

  it("refuses an id that is not a membership id", () => {
    const parsed = submitRatingsSchema.safeParse({
      teamId: TEAM,
      matchId: MATCH,
      entries: [{ ratedMemberId: "hugo", score: "8" }],
    });
    expect(parsed.success).toBe(false);
  });

  it("refuses a match or team that is not a uuid", () => {
    expect(
      submitRatingsSchema.safeParse({
        teamId: "mine",
        matchId: MATCH,
        entries: [{ ratedMemberId: HUGO, score: "8" }],
      }).success,
    ).toBe(false);
  });

  // `submitRatings` shows the player the first issue's message, because the Zod paths
  // (`entries.3.score`) match no field in the form and so cannot be rendered next to one. Every
  // message therefore has to be French — a stray Zod default would read "Invalid UUID" on screen.
  it("never reports a problem in English", () => {
    const parsed = submitRatingsSchema.safeParse({
      teamId: "mine",
      matchId: "ours",
      entries: [
        { ratedMemberId: "hugo", score: "8" },
        { ratedMemberId: HUGO, score: "42" },
        { ratedMemberId: KARIM, score: "7", comment: "x".repeat(500) },
      ],
    });

    expect(parsed.success).toBe(false);
    const messages = parsed.error?.issues.map((issue) => issue.message) ?? [];
    expect(messages.length).toBeGreaterThan(0);
    // A whitelist rather than a regexp: "invalide" contains "invalid", so any test for English
    // words would either miss real leaks or fail on correct French.
    const authored = [
      "Ce formulaire est invalide, recharge la page.",
      "Choisis une note de 0 à 10.",
      "Une note est un nombre entier.",
      "Une note va de 0 à 10.",
      "Ce commentaire est trop long.",
      "Mets au moins une note avant d’enregistrer.",
      "Trop de notes dans ce formulaire.",
    ];
    expect([...new Set(messages)].filter((message) => !authored.includes(message))).toEqual([]);
  });
});

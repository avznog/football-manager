import { describe, expect, it } from "vitest";

import { ratingScoreSchema, readRatingEntries, submitRatingsSchema } from "./validation";

const HUGO = "11111111-1111-4111-8111-111111111111";
const KARIM = "22222222-2222-4222-8222-222222222222";
const MATCH = "33333333-3333-4333-8333-333333333333";
const TEAM = "44444444-4444-4444-8444-444444444444";

describe("ratingScoreSchema", () => {
  it("accepts the whole range in half-points, as the strings a range input submits", () => {
    for (const value of ["0", "0.5", "5", "7.5", "10"]) {
      expect(ratingScoreSchema.parse(value)).toBe(Number(value));
    }
  });

  it("refuses anything the column could not hold", () => {
    expect(ratingScoreSchema.safeParse("11").success).toBe(false);
    expect(ratingScoreSchema.safeParse("-1").success).toBe(false);
    expect(ratingScoreSchema.safeParse("10.5").success).toBe(false);
    expect(ratingScoreSchema.safeParse("beaucoup").success).toBe(false);
  });

  it("refuses a note off the half-step, and says which step", () => {
    // `ratings_score_half_step` would refuse the row; this is the message that gets there first.
    const result = ratingScoreSchema.safeParse("7.2");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("demi-points");
  });

  it("tells somebody who typed a French comma to choose a note", () => {
    // Nothing in the app sends « 7,5 » — a range input emits `7.5`. A hand-built request does.
    const result = ratingScoreSchema.safeParse("7,5");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toContain("Choisis une note");
  });
});

describe("readRatingEntries", () => {
  function formData(fields: Record<string, string>): FormData {
    const data = new FormData();
    for (const [key, value] of Object.entries(fields)) data.append(key, value);
    return data;
  }

  it("reads one entry per slider, half-points included", () => {
    const entries = readRatingEntries(
      formData({
        teamId: TEAM,
        matchId: MATCH,
        [`score:${HUGO}`]: "8",
        [`score:${KARIM}`]: "6.5",
      }).entries(),
    );

    expect(entries).toEqual([
      { ratedMemberId: HUGO, score: "8" },
      { ratedMemberId: KARIM, score: "6.5" },
    ]);
  });

  it("skips a control that submitted nothing rather than reading it as a zero", () => {
    const entries = readRatingEntries(
      formData({ [`score:${HUGO}`]: "8", [`score:${KARIM}`]: "" }).entries(),
    );

    expect(entries).toHaveLength(1);
    expect(entries[0]?.ratedMemberId).toBe(HUGO);
  });

  it("ignores the comment field the form no longer has", () => {
    // The column is dropped and the `Textarea` is gone. A stale client posting one gets it dropped
    // here rather than having its whole submission rejected.
    const entries = readRatingEntries(
      formData({ [`score:${HUGO}`]: "8", [`comment:${HUGO}`]: "arrêt décisif" }).entries(),
    );
    expect(entries).toEqual([{ ratedMemberId: HUGO, score: "8" }]);
  });

  it("keeps a bad score so it can be reported rather than silently ignored", () => {
    const entries = readRatingEntries(formData({ [`score:${HUGO}`]: "42" }).entries());
    expect(entries).toEqual([{ ratedMemberId: HUGO, score: "42" }]);
  });

  it("ignores fields that are not a score", () => {
    expect(
      readRatingEntries(formData({ teamId: TEAM, matchId: MATCH, "score:": "8" }).entries()),
    ).toEqual([]);
  });
});

describe("submitRatingsSchema", () => {
  it("accepts a well-formed submission", () => {
    const parsed = submitRatingsSchema.safeParse({
      teamId: TEAM,
      matchId: MATCH,
      entries: [{ ratedMemberId: HUGO, score: "8.5" }],
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.entries[0]).toEqual({ ratedMemberId: HUGO, score: 8.5 });
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
        { ratedMemberId: KARIM, score: "7.2" },
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
      "Une note va de 0 à 10.",
      "Une note va par demi-points : 7 ou 7,5, pas 7,2.",
      "Mets au moins une note avant d’enregistrer.",
      "Trop de notes dans ce formulaire.",
    ];
    expect([...new Set(messages)].filter((message) => !authored.includes(message))).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";

import {
  archiveCompetitionSchema,
  competitionLabelSchema,
  createCompetitionSchema,
  renameCompetitionSchema,
} from "./validation";

const TEAM = "11111111-1111-4111-8111-111111111111";
const COMPETITION = "22222222-2222-4222-8222-222222222222";

describe("competitionLabelSchema", () => {
  it("trims what the coach typed", () => {
    expect(competitionLabelSchema.parse("  Championnat D3  ")).toBe("Championnat D3");
  });

  it("accepts the names a real team uses", () => {
    for (const label of ["Coupe du Crédit Mutuel", "Championnat D3", "Tournoi de la Pentecôte"]) {
      expect(competitionLabelSchema.safeParse(label).success).toBe(true);
    }
  });

  it("refuses an empty or one-letter name", () => {
    expect(competitionLabelSchema.safeParse("   ").success).toBe(false);
    expect(competitionLabelSchema.safeParse("C").success).toBe(false);
  });

  it("refuses a name that would not fit the dropdown", () => {
    expect(competitionLabelSchema.safeParse("x".repeat(41)).success).toBe(false);
    expect(competitionLabelSchema.safeParse("x".repeat(40)).success).toBe(true);
  });

  it("speaks French", () => {
    const result = competitionLabelSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("nom");
  });
});

describe("createCompetitionSchema", () => {
  it("takes a team and a label", () => {
    expect(createCompetitionSchema.parse({ teamId: TEAM, labelFr: " Coupe " })).toEqual({
      teamId: TEAM,
      labelFr: "Coupe",
    });
  });

  it("refuses a teamId that is not a uuid", () => {
    expect(createCompetitionSchema.safeParse({ teamId: "t1", labelFr: "Coupe" }).success).toBe(
      false,
    );
  });
});

describe("renameCompetitionSchema", () => {
  it("needs the row as well as the team", () => {
    expect(
      renameCompetitionSchema.safeParse({
        teamId: TEAM,
        competitionId: COMPETITION,
        labelFr: "Championnat D3",
      }).success,
    ).toBe(true);
    expect(
      renameCompetitionSchema.safeParse({ teamId: TEAM, labelFr: "Championnat D3" }).success,
    ).toBe(false);
  });
});

describe("archiveCompetitionSchema", () => {
  /** A form posts words, not booleans: `"false"` must not arrive as a truthy string. */
  it("reads the word the form posted as a boolean", () => {
    expect(
      archiveCompetitionSchema.parse({
        teamId: TEAM,
        competitionId: COMPETITION,
        archived: "true",
      }).archived,
    ).toBe(true);
    expect(
      archiveCompetitionSchema.parse({
        teamId: TEAM,
        competitionId: COMPETITION,
        archived: "false",
      }).archived,
    ).toBe(false);
  });

  it("refuses anything else, rather than guess", () => {
    expect(
      archiveCompetitionSchema.safeParse({
        teamId: TEAM,
        competitionId: COMPETITION,
        archived: "on",
      }).success,
    ).toBe(false);
  });
});

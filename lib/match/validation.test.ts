import { describe, expect, it } from "vitest";

import {
  createMatchSchema,
  kickoffSchema,
  matchSideSchema,
  opponentNameSchema,
  periodMinutesSchema,
  periodsCountSchema,
  venueSchema,
} from "./validation";

const TEAM_ID = "11111111-1111-4111-8111-111111111111";
const COMPETITION_ID = "22222222-2222-4222-8222-222222222222";

function form(overrides: Record<string, unknown> = {}) {
  return {
    teamId: TEAM_ID,
    opponentName: "Étoile du Parc",
    kickoffAt: "2026-09-27T10:30",
    isHome: "home",
    venue: "Stade des Tilleuls",
    competitionId: COMPETITION_ID,
    periodsCount: "2",
    periodMinutes: "30",
    ...overrides,
  };
}

describe("opponentNameSchema", () => {
  it("trims and accepts a real name", () => {
    expect(opponentNameSchema.parse("  FC Rivière  ")).toBe("FC Rivière");
  });

  it("refuses an empty or one-letter name", () => {
    expect(opponentNameSchema.safeParse("").success).toBe(false);
    expect(opponentNameSchema.safeParse("A").success).toBe(false);
  });

  it("refuses a name that would break the layout", () => {
    expect(opponentNameSchema.safeParse("x".repeat(61)).success).toBe(false);
  });

  it("speaks French", () => {
    const result = opponentNameSchema.safeParse("");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toContain("adversaire");
  });
});

describe("kickoffSchema", () => {
  it("turns a Paris wall clock into an instant", () => {
    expect(kickoffSchema.parse("2026-09-27T10:30").toISOString()).toBe(
      "2026-09-27T08:30:00.000Z",
    );
  });

  it("refuses an empty value and an impossible date", () => {
    expect(kickoffSchema.safeParse("").success).toBe(false);
    expect(kickoffSchema.safeParse("2026-02-31T10:00").success).toBe(false);
    expect(kickoffSchema.safeParse("demain matin").success).toBe(false);
  });

  it("accepts a date in the past — a coach may enter a match after the fact", () => {
    expect(kickoffSchema.safeParse("2020-01-01T15:00").success).toBe(true);
  });
});

describe("matchSideSchema", () => {
  it("maps the words onto the boolean column", () => {
    expect(matchSideSchema.parse("home")).toBe(true);
    expect(matchSideSchema.parse("away")).toBe(false);
  });

  it("refuses a missing value rather than guessing", () => {
    expect(matchSideSchema.safeParse(undefined).success).toBe(false);
    expect(matchSideSchema.safeParse("on").success).toBe(false);
  });
});

describe("venueSchema", () => {
  it("turns a blank field into null", () => {
    expect(venueSchema.parse("")).toBeNull();
    expect(venueSchema.parse("   ")).toBeNull();
    expect(venueSchema.parse(undefined)).toBeNull();
  });

  it("keeps a filled one, trimmed", () => {
    expect(venueSchema.parse("  Stade des Tilleuls ")).toBe("Stade des Tilleuls");
  });
});

describe("periodsCountSchema and periodMinutesSchema", () => {
  it("coerce the strings a form submits", () => {
    expect(periodsCountSchema.parse("2")).toBe(2);
    expect(periodMinutesSchema.parse("30")).toBe(30);
  });

  it("refuse values that are not a format of football", () => {
    expect(periodsCountSchema.safeParse("0").success).toBe(false);
    expect(periodsCountSchema.safeParse("5").success).toBe(false);
    expect(periodsCountSchema.safeParse("2.5").success).toBe(false);
    expect(periodMinutesSchema.safeParse("4").success).toBe(false);
    expect(periodMinutesSchema.safeParse("61").success).toBe(false);
  });
});

describe("createMatchSchema", () => {
  it("parses a complete form into the shape the insert wants", () => {
    const parsed = createMatchSchema.parse(form());
    expect(parsed).toEqual({
      teamId: TEAM_ID,
      opponentName: "Étoile du Parc",
      kickoffAt: new Date("2026-09-27T08:30:00.000Z"),
      isHome: true,
      venue: "Stade des Tilleuls",
      competitionId: COMPETITION_ID,
      periodsCount: 2,
      periodMinutes: 30,
    });
  });

  it("falls back to 2×30 when the format fields are absent", () => {
    const parsed = createMatchSchema.parse(
      form({ periodsCount: undefined, periodMinutes: undefined }),
    );
    expect(parsed.periodsCount).toBe(2);
    expect(parsed.periodMinutes).toBe(30);
  });

  it("refuses a teamId that is not a uuid", () => {
    expect(createMatchSchema.safeParse(form({ teamId: "team-1" })).success).toBe(false);
  });

  it("reports every bad field at once, so the form can show them all", () => {
    const result = createMatchSchema.safeParse(
      form({ opponentName: "", kickoffAt: "nope", competitionId: "amical" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("opponentName");
      expect(fields).toContain("kickoffAt");
      expect(fields).toContain("competitionId");
    }
  });

  // Which competitions exist is no longer a fact about the schema: they are rows of the team's own
  // table (decision 107), so all this can check is the shape. That the id belongs to *this* team is
  // checked in `lib/match/actions.ts`, against the database, where the answer actually lives.
  it("takes a competition id and refuses anything that is not one", () => {
    expect(createMatchSchema.safeParse(form({ competitionId: COMPETITION_ID })).success).toBe(true);
    expect(createMatchSchema.safeParse(form({ competitionId: "league" })).success).toBe(false);
    expect(createMatchSchema.safeParse(form({ competitionId: undefined })).success).toBe(false);
  });

  it("speaks French about a missing competition", () => {
    const result = createMatchSchema.safeParse(form({ competitionId: undefined }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain("compétition");
    }
  });
});

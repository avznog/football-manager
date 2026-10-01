import { describe, expect, it } from "vitest";

import { POSITION_CODES } from "@/db/reference";
import {
  INJURY_NOTE_MAX,
  declareInjurySchema,
  isUuid,
  resolveInjurySchema,
  updatePositionsSchema,
} from "./validation";

const TEAM = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";
const INJURY = "33333333-3333-4333-8333-333333333333";

describe("isUuid", () => {
  it("accepts a uuid in either case", () => {
    expect(isUuid(TEAM)).toBe(true);
    expect(isUuid(TEAM.toUpperCase())).toBe(true);
  });

  it("rejects anything a route segment could otherwise smuggle into a query", () => {
    expect(isUuid("nimportequoi")).toBe(false);
    expect(isUuid("")).toBe(false);
    expect(isUuid(`${TEAM} or 1=1`)).toBe(false);
  });
});

describe("updatePositionsSchema", () => {
  it("reads the picker's fields", () => {
    const result = updatePositionsSchema.parse({
      teamId: TEAM,
      memberId: MEMBER,
      primary: "MC",
      secondary: ["MOC", "AT"],
    });
    expect(result).toEqual({
      teamId: TEAM,
      memberId: MEMBER,
      primary: "MC",
      secondary: ["MOC", "AT"],
    });
  });

  it("reads an empty primary as « aucun poste principal »", () => {
    expect(
      updatePositionsSchema.parse({ teamId: TEAM, memberId: MEMBER, primary: "", secondary: [] })
        .primary,
    ).toBeNull();
  });

  it("refuses a position outside the seven-a-side vocabulary", () => {
    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        primary: "LIBERO",
        secondary: [],
      }).success,
    ).toBe(false);
    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        primary: "",
        secondary: ["MC", "ARRIERE"],
      }).success,
    ).toBe(false);
  });

  it("refuses a member id that is not a uuid", () => {
    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: "moi",
        primary: "",
        secondary: [],
      }).success,
    ).toBe(false);
  });

  it("keeps accepting every stored code, not just the ones the picker offers", () => {
    for (const code of POSITION_CODES) {
      expect(
        updatePositionsSchema.safeParse({
          teamId: TEAM,
          memberId: MEMBER,
          primary: code,
          secondary: [code],
        }).success,
      ).toBe(true);
    }
  });

  // The player reads these, so no English default and no internal code may reach the screen.
  it("says in French that a stale form is the problem, without blaming the player", () => {
    const issues = (
      updatePositionsSchema.safeParse({
        teamId: "pas-une-equipe",
        memberId: "moi",
        primary: "",
        secondary: [],
      }).error?.issues ?? []
    ).map((issue) => issue.message);

    expect(issues).toEqual([
      "Ce formulaire est invalide, recharge la page.",
      "Ce formulaire est invalide, recharge la page.",
    ]);
  });

  it("names an unknown position in French, in both fields", () => {
    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        primary: "LIBERO",
        secondary: [],
      }).error?.issues[0].message,
    ).toBe("Poste inconnu.");

    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        primary: "",
        secondary: ["ARRIERE"],
      }).error?.issues[0].message,
    ).toBe("Poste inconnu.");
  });

  it("refuses more positions than there are, in French and without listing them", () => {
    expect(
      updatePositionsSchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        primary: "",
        secondary: [...POSITION_CODES, "MC"],
      }).error?.issues[0].message,
    ).toBe("Trop de postes dans ce formulaire.");
  });

  it("leaks no position code and no field name in any message", () => {
    const messages = [
      updatePositionsSchema.safeParse({
        teamId: "x",
        memberId: "x",
        primary: "LIBERO",
        secondary: ["ARRIERE", ...POSITION_CODES],
      }).error?.issues ?? [],
    ]
      .flat()
      .map((issue) => issue.message);

    expect(messages.length).toBeGreaterThan(0);
    for (const message of messages) {
      // Zod's own defaults, which is what every one of these used to say.
      expect(message).not.toMatch(/Invalid|Too big|expected/);
      expect(message).not.toMatch(/teamId|memberId|primary|secondary/);
      for (const code of POSITION_CODES) {
        expect(message).not.toContain(code);
      }
    }
  });
});

describe("declareInjurySchema", () => {
  const base = { teamId: TEAM, memberId: MEMBER, startedOn: "2026-09-22" };

  it("accepts a start date on its own", () => {
    const result = declareInjurySchema.parse({ ...base, expectedReturnOn: "", note: "" });
    expect(result).toEqual({
      teamId: TEAM,
      memberId: MEMBER,
      startedOn: "2026-09-22",
      expectedReturnOn: null,
      note: null,
    });
  });

  it("keeps a trimmed note and an expected return", () => {
    const result = declareInjurySchema.parse({
      ...base,
      expectedReturnOn: "2026-10-06",
      note: "  Entorse de la cheville.  ",
    });
    expect(result.note).toBe("Entorse de la cheville.");
    expect(result.expectedReturnOn).toBe("2026-10-06");
  });

  it("refuses an invalid date", () => {
    expect(
      declareInjurySchema.safeParse({
        ...base,
        startedOn: "2026-02-30",
        expectedReturnOn: "",
        note: "",
      }).success,
    ).toBe(false);
  });

  it("refuses a return before the start, on that field", () => {
    const result = declareInjurySchema.safeParse({
      ...base,
      expectedReturnOn: "2026-09-01",
      note: "",
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(["expectedReturnOn"]);
    expect(result.error?.issues[0].message).toContain("retour prévu");
  });

  it("accepts a return on the day the injury started", () => {
    expect(
      declareInjurySchema.safeParse({ ...base, expectedReturnOn: base.startedOn, note: "" })
        .success,
    ).toBe(true);
  });

  it("refuses a note nobody will read", () => {
    expect(
      declareInjurySchema.safeParse({
        ...base,
        expectedReturnOn: "",
        note: "x".repeat(INJURY_NOTE_MAX + 1),
      }).success,
    ).toBe(false);
  });
});

describe("resolveInjurySchema", () => {
  it("defaults the resolution date to null, i.e. today", () => {
    expect(
      resolveInjurySchema.parse({
        teamId: TEAM,
        memberId: MEMBER,
        injuryId: INJURY,
        resolvedOn: "",
      }).resolvedOn,
    ).toBeNull();
  });

  it("accepts an explicit day", () => {
    expect(
      resolveInjurySchema.parse({
        teamId: TEAM,
        memberId: MEMBER,
        injuryId: INJURY,
        resolvedOn: "2026-09-30",
      }).resolvedOn,
    ).toBe("2026-09-30");
  });

  it("needs the injury it is closing", () => {
    expect(
      resolveInjurySchema.safeParse({
        teamId: TEAM,
        memberId: MEMBER,
        injuryId: "",
        resolvedOn: "",
      }).success,
    ).toBe(false);
  });
});

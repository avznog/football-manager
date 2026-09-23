import { describe, expect, it } from "vitest";

import {
  DEFAULT_COMPETITIONS,
  DEFAULT_COMPETITION_LABEL,
  defaultCompetitionRows,
} from "./defaults";

const TEAM = "11111111-1111-4111-8111-111111111111";

describe("the defaults a new team starts with", () => {
  it("is the four the enum used to hold, in French", () => {
    expect(DEFAULT_COMPETITIONS.map((c) => c.labelFr)).toEqual([
      "Championnat",
      "Coupe",
      "Amical",
      "Tournoi",
    ]);
  });

  /**
   * The migration that created the table wrote exactly these four words per team, and the match
   * form's default is the lowest `sort`. If this drifts, a team seeded today and a team migrated in
   * 2026 no longer read the same, for no reason a coach could see.
   */
  it("puts the league first, which is what a new match lands on", () => {
    expect(DEFAULT_COMPETITIONS[0].sort).toBe(0);
    expect(DEFAULT_COMPETITION_LABEL).toBe("Championnat");
  });

  it("orders them without ties, so the dropdown is stable", () => {
    const sorts = DEFAULT_COMPETITIONS.map((c) => c.sort);
    expect(new Set(sorts).size).toBe(sorts.length);
    expect([...sorts].sort((a, b) => a - b)).toEqual(sorts);
  });

  it("builds one insertable row per default, all for the same team", () => {
    const rows = defaultCompetitionRows(TEAM);
    expect(rows).toHaveLength(DEFAULT_COMPETITIONS.length);
    expect(rows.every((row) => row.teamId === TEAM)).toBe(true);
    expect(rows[0]).toEqual({ teamId: TEAM, labelFr: "Championnat", sort: 0 });
  });

  it("has no duplicate label, which the unique index would refuse", () => {
    const labels = defaultCompetitionRows(TEAM).map((row) => row.labelFr);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

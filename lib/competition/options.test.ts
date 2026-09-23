import { describe, expect, it } from "vitest";

import {
  type CompetitionSummary,
  competitionLabelOf,
  competitionOptions,
  defaultCompetitionId,
  statsFilterOptions,
} from "./options";

function competition(
  id: string,
  labelFr: string,
  extra: Partial<CompetitionSummary> = {},
): CompetitionSummary {
  return { id, labelFr, sort: 0, archived: false, matchCount: 0, ...extra };
}

describe("competitionOptions", () => {
  it("offers the live ones, lowest sort first", () => {
    const options = competitionOptions([
      competition("c2", "Coupe", { sort: 1 }),
      competition("c1", "Championnat", { sort: 0 }),
    ]);
    expect(options.map((option) => option.labelFr)).toEqual(["Championnat", "Coupe"]);
  });

  it("breaks a tie on the label, in French", () => {
    const options = competitionOptions([
      competition("c2", "Étoile"),
      competition("c1", "Amical"),
      competition("c3", "Zone"),
    ]);
    expect(options.map((option) => option.labelFr)).toEqual(["Amical", "Étoile", "Zone"]);
  });

  it("hides an archived competition", () => {
    const options = competitionOptions([
      competition("c1", "Championnat"),
      competition("c2", "Coupe 2024", { archived: true }),
    ]);
    expect(options.map((option) => option.id)).toEqual(["c1"]);
  });

  /**
   * The case this function exists for: opening « Modifier » on last autumn's cup match must not
   * silently re-file it under the championship when the form is saved.
   */
  it("keeps the archived one the edited match already points at, and says it is archived", () => {
    const options = competitionOptions(
      [competition("c1", "Championnat"), competition("c2", "Coupe 2024", { archived: true })],
      "c2",
    );
    expect(options.map((option) => option.id)).toEqual(["c1", "c2"]);
    expect(options[1].labelFr).toBe("Coupe 2024 (archivée)");
  });

  it("does not mutate what it was given", () => {
    const all = [competition("c2", "Coupe", { sort: 1 }), competition("c1", "Championnat")];
    competitionOptions(all);
    expect(all.map((row) => row.id)).toEqual(["c2", "c1"]);
  });
});

describe("defaultCompetitionId", () => {
  it("is the first option, which is the league", () => {
    const options = competitionOptions([
      competition("c2", "Coupe", { sort: 1 }),
      competition("c1", "Championnat", { sort: 0 }),
    ]);
    expect(defaultCompetitionId(options)).toBe("c1");
  });

  it("is null when the team has none, so the form can say so", () => {
    expect(defaultCompetitionId([])).toBeNull();
  });
});

describe("statsFilterOptions", () => {
  it("only offers a chip for a competition that has matches", () => {
    const options = statsFilterOptions([
      competition("c1", "Championnat", { matchCount: 7 }),
      competition("c2", "Coupe 2026", { matchCount: 0, sort: 1 }),
    ]);
    expect(options.map((option) => option.id)).toEqual(["c1"]);
  });

  it("keeps an archived competition that was played in: a season is read by it", () => {
    const options = statsFilterOptions([
      competition("c1", "Championnat", { matchCount: 7 }),
      competition("c2", "Coupe 2024", { matchCount: 2, sort: 1, archived: true }),
    ]);
    expect(options.map((option) => option.labelFr)).toEqual([
      "Championnat",
      "Coupe 2024 (archivée)",
    ]);
  });
});

describe("competitionLabelOf", () => {
  const options = statsFilterOptions([competition("c1", "Championnat", { matchCount: 3 })]);

  it("finds the label of a filter that is on", () => {
    expect(competitionLabelOf(options, "c1")).toBe("Championnat");
  });

  it("is null for « toutes compétitions »", () => {
    expect(competitionLabelOf(options, null)).toBeNull();
  });

  /** A bookmarked URL for a competition deleted since must read as « toutes », never as an error. */
  it("is null for an id that names nothing any more", () => {
    expect(competitionLabelOf(options, "gone")).toBeNull();
  });
});

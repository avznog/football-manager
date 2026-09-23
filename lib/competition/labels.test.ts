import { describe, expect, it } from "vitest";

import {
  competitionArchiveActionFr,
  competitionDeleteRefusedFr,
  competitionDeletionFr,
  competitionMatchCountFr,
  competitionStateFr,
  competitionsCardFr,
  noCompetitionFr,
  noCompetitionYetFr,
} from "./labels";

describe("competitionMatchCountFr", () => {
  it("says nothing rather than « 0 match »", () => {
    expect(competitionMatchCountFr(0)).toBe("aucun match");
  });

  it("pluralises the way a coach writes it", () => {
    expect(competitionMatchCountFr(1)).toBe("1 match");
    expect(competitionMatchCountFr(7)).toBe("7 matchs");
  });
});

describe("competitionStateFr", () => {
  it("is just the count while the competition is live", () => {
    expect(competitionStateFr({ matchCount: 3, archived: false })).toBe("3 matchs");
  });

  /** A coach who cannot find « Coupe » in the match form must be able to read why from here. */
  it("says an archived one has left the match form", () => {
    expect(competitionStateFr({ matchCount: 3, archived: true })).toContain("archivée");
    expect(competitionStateFr({ matchCount: 3, archived: true })).toContain("3 matchs");
  });
});

describe("competitionDeletionFr", () => {
  it("allows the deletion of a competition nothing points at, and says so", () => {
    const deletion = competitionDeletionFr("Tournoi", 0);
    expect(deletion.allowed).toBe(true);
    expect(deletion.warningFr).toContain("Aucun match");
    expect(deletion.warningFr).toContain("Tournoi");
  });

  /**
   * Decisions 098 and 099: the control names what it would take with it, counted from the data. The
   * count is the whole point — « supprime les matchs liés » would be both vague and false, since the
   * matches survive and it is their competition that would be lost.
   */
  it("refuses as soon as one match points at it, counted, and names archiving instead", () => {
    const one = competitionDeletionFr("Coupe", 1);
    expect(one.allowed).toBe(false);
    expect(one.warningFr).toContain("1 match");
    expect(one.warningFr).toContain("est rattaché");
    expect(one.warningFr).toContain("Archive-la");

    const many = competitionDeletionFr("Championnat", 7);
    expect(many.allowed).toBe(false);
    expect(many.warningFr).toContain("7 matchs");
    expect(many.warningFr).toContain("sont rattachés");
    expect(many.warningFr).toContain("ces 7 matchs");
  });

  it("refuses with the same words the card showed, so nothing changes under the coach", () => {
    expect(competitionDeleteRefusedFr("Coupe", 4)).toBe(
      competitionDeletionFr("Coupe", 4).warningFr,
    );
  });
});

describe("competitionArchiveActionFr", () => {
  it("offers to archive a live one and to bring an archived one back", () => {
    expect(competitionArchiveActionFr(false).labelFr).toBe("Archiver");
    expect(competitionArchiveActionFr(false).hintFr).toContain("matchs déjà joués");
    expect(competitionArchiveActionFr(true).labelFr).toBe("Réactiver");
  });
});

describe("the wording of the card and of an empty list", () => {
  it("tutoies, as every sentence in the app does (decision 074)", () => {
    const sentences = [
      competitionsCardFr().descriptionFr,
      noCompetitionFr(),
      noCompetitionYetFr(),
      competitionDeletionFr("Coupe", 2).warningFr,
      competitionArchiveActionFr(false).hintFr,
    ];
    for (const sentence of sentences) {
      expect(sentence).not.toMatch(/\b[Vv]ous\b|\b[Vv]otre\b|\b[Vv]os\b/);
    }
  });

  it("tells the coach where to go rather than leaving an empty dropdown", () => {
    expect(noCompetitionFr()).toContain("Équipe");
    expect(noCompetitionYetFr()).toContain("aucun match ne peut être programmé");
  });
});

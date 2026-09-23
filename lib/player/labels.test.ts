import { describe, expect, it } from "vitest";

import { jerseyHintFr, noPlayerSheetTitleFr, removeMemberCardFr } from "./labels";

describe("noPlayerSheetTitleFr", () => {
  it("does not head « Fiche joueur » a card whose body says the member is not one", () => {
    expect(noPlayerSheetTitleFr()).toBe("Pas de fiche joueur");
  });
});

describe("jerseyHintFr", () => {
  it("says « le joueur » only about a player", () => {
    expect(jerseyHintFr(true)).toContain("le joueur");
    expect(jerseyHintFr(false)).not.toContain("joueur");
  });

  it("tells a member of the encadrement why the field is theirs to leave empty", () => {
    expect(jerseyHintFr(false)).toContain("encadrement");
  });
});

describe("removeMemberCardFr", () => {
  it("does not call a member of the encadrement « le joueur »", () => {
    const card = removeMemberCardFr("Coach", false);

    expect(card.descriptionFr).not.toContain("joueur");
    expect(card.titleFr).toBe("Retirer de l’équipe");
  });

  it("promises a non-player nothing they never had", () => {
    const card = removeMemberCardFr("Coach", false);

    // `can()` refuses every self action to `isPlayer = false`, so neither of these was ever theirs.
    expect(card.descriptionFr).not.toContain("disponibilités");
    expect(card.descriptionFr).not.toContain("feuille de match");
  });

  it("tells a player exactly what they lose", () => {
    const card = removeMemberCardFr("Ali", true);

    expect(card.titleFr).toBe("Retirer de l’effectif");
    expect(card.descriptionFr).toContain("disponibilités");
    expect(card.descriptionFr).toContain("feuille de match");
  });

  it("never uses « convoqué », a word the app has no concept for", () => {
    for (const card of [removeMemberCardFr("Ali", true), removeMemberCardFr("Coach", false)]) {
      expect(card.descriptionFr).not.toContain("convoqu");
    }
  });

  it("promises on both sides that nothing is deleted, because the removal is soft", () => {
    for (const card of [removeMemberCardFr("Ali", true), removeMemberCardFr("Coach", false)]) {
      // Capitalised on one side and not the other, hence the shared fragment.
      expect(card.descriptionFr).toContain("n’est effacé");
    }
  });

  it("names the member in the button, so the destructive tap is unambiguous", () => {
    expect(removeMemberCardFr("Ali", true).buttonFr).toBe("Retirer Ali de l’effectif");
    expect(removeMemberCardFr("Coach", false).buttonFr).toBe("Retirer Coach de l’équipe");
  });
});

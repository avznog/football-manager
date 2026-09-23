import { describe, expect, it } from "vitest";

import { inviteCardFr, invitesReadOnlyFr, staffCardFr } from "./labels";

describe("inviteCardFr", () => {
  /** The card's own `<select>` offers « Coach », so its title may not promise « des joueurs ». */
  it("names both roles the form can mint a code for", () => {
    const card = inviteCardFr();
    expect(card.titleFr).toBe("Inviter un joueur ou un coach");
    expect(card.titleFr).toContain("coach");
  });

  /** « Le joueur choisit lui-même son mot de passe » was false of a coach invite. */
  it("says « la personne », which is true of either", () => {
    expect(inviteCardFr().descriptionFr).toContain("La personne choisit elle-même");
    expect(inviteCardFr().descriptionFr).not.toContain("Le joueur choisit");
  });
});

describe("staffCardFr", () => {
  /**
   * The demo season: Karim is coach and player, so « Encadrement » lists one non-playing coach and
   * the reader has to be told where the other one is.
   */
  it("says where a coach who plays is listed instead", () => {
    expect(staffCardFr(1)).toEqual({
      titleFr: "Encadrement",
      descriptionFr: "1 coach joue aussi, et apparaît dans l’effectif.",
    });
  });

  it("agrees with itself in the plural", () => {
    expect(staffCardFr(3).descriptionFr).toBe(
      "3 coachs jouent aussi, et apparaissent dans l’effectif.",
    );
  });

  /** Nothing to explain on a team whose coaches all stand on the touchline. */
  it("explains nothing when the list is the whole staff", () => {
    expect(staffCardFr(0).descriptionFr).toBeUndefined();
  });
});

describe("invitesReadOnlyFr", () => {
  /** The same narrowing as the title, in the sentence a player reads instead of it. */
  it("does not claim a coach only invites players", () => {
    expect(invitesReadOnlyFr()).toBe("Seul un coach peut envoyer une invitation.");
    expect(invitesReadOnlyFr()).not.toContain("joueurs");
  });
});


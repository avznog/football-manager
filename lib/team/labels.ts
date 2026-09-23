/**
 * What `/equipe` says about itself.
 *
 * The two sentences here were string literals in the page and in `invite-manager.tsx`, and both
 * described something narrower than what they sat on: one card offered a coach code under the title
 * « Inviter des joueurs », and one heading stood over the staff without mentioning the coach who is
 * in the squad list instead. They are functions so a test can read them — Vitest collects `lib/**`
 * and nothing under `app/`.
 */

/**
 * The invite card, whose own `<select>` offers « Joueur » and « Coach ».
 *
 * It was titled « Inviter des joueurs », described as « Le joueur choisit lui-même son mot de
 * passe », and contradicted by the first control inside it: a coach code is minted by the same form
 * and `createInvite` has taken a role since M0. The title now names both, and the sentence says
 * « la personne », which is true of either.
 *
 * Static, not derived from the selected role: the select is a client control and a title that
 * flickered as it changed would be worse than one that covers both. What matters is that nothing
 * here is false before the coach has touched anything.
 */
export function inviteCardFr(): { titleFr: string; descriptionFr: string } {
  return {
    titleFr: "Inviter un joueur ou un coach",
    descriptionFr:
      "Génère un code et envoie-le sur WhatsApp. La personne choisit elle-même son mot de passe.",
  };
}

/**
 * The « Encadrement » card, which lists the members who do not play.
 *
 * Every row under it is staff, so the heading is true of them — but the team's most visible coach is
 * usually a coach who plays, and he is in « Effectif », one card up, with a « coach » badge. A reader
 * asking who runs the team read a list of one and was not told it was a list of one *kind*.
 *
 * So the card explains its own boundary, the way the training page explains a denominator larger than
 * the list under it (decision 076): « 1 coach joue aussi, et apparaît dans l'effectif. » Nothing is
 * said when there is nothing to explain.
 */
export function staffCardFr(playingCoachCount: number): {
  titleFr: string;
  descriptionFr: string | undefined;
} {
  if (playingCoachCount === 0) {
    return { titleFr: "Encadrement", descriptionFr: undefined };
  }

  return {
    titleFr: "Encadrement",
    descriptionFr:
      playingCoachCount === 1
        ? "1 coach joue aussi, et apparaît dans l’effectif."
        : `${playingCoachCount} coachs jouent aussi, et apparaissent dans l’effectif.`,
  };
}

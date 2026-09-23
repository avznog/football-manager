/**
 * The wording of the profile screen's squad-administration card.
 *
 * It lives here rather than in the page for the reason every `…Fr()` module in `lib/` exists:
 * `vitest.config.ts` collects `lib/**` and nothing under `app/`, so a sentence inlined in a Server
 * Component is a sentence no test can read. The defect this module was extracted for was invisible
 * for exactly that reason.
 */

/**
 * The heading of the card that stands in for the positions-and-injuries panel.
 *
 * It was « Fiche joueur » over one sentence saying « Ce membre fait partie de l'encadrement », so
 * the heading and its own only line disagreed about the one fact the card exists to state. The
 * body is right — a non-player has no postes and no blessures to follow — so the heading moved.
 */
export function noPlayerSheetTitleFr(): string {
  return "Pas de fiche joueur";
}

/**
 * The hint under « Numéro de maillot ».
 *
 * A member of the encadrement is not « le joueur », and the form is shown on their profile because
 * `/equipe` prints the number next to their name whoever they are.
 */
export function jerseyHintFr(isPlayer: boolean): string {
  return isPlayer
    ? "Laisse vide si le joueur n’a pas de numéro fixe."
    : "Laisse vide : un membre de l’encadrement n’a pas de maillot.";
}

/** What « Retirer … » says, and what it may promise, for one member of the team. */
export type RemoveMemberCard = {
  titleFr: string;
  descriptionFr: string;
  /** Used both as the button's text and as its `aria-label`, so they can never drift apart. */
  buttonFr: string;
};

/**
 * The « Retirer de l'effectif » card, told apart by whether the member plays.
 *
 * Two things were untrue on it, and both only for the encadrement — the demo team's own
 * `admin` / « Coach » is a member with `is_player = false`, and a second coach, so the card is shown
 * on their profile and said this about them:
 *
 *   « Le joueur ne pourra plus déclarer ses disponibilités ni être convoqué. »
 *
 * They are not a joueur, and neither half of that sentence was ever true of them:
 * `can()` refuses every `SELF_ACTIONS` entry to a member with `isPlayer = false` — « Only players
 * act as players. A non-playing coach has nothing to declare. » — and the selection list on
 * `/match/[id]` filters `isPlayer` before it is drawn. Removing them takes away the team, not a
 * place in it. Same rule as decision 087's heading: the sentence has to hold for the member it is
 * shown about, not for the twenty who look like them.
 *
 * And « convoqué » is a word this app does not own. There is no convocation anywhere in the data
 * model — that was decided before the first line was written — and the eleven other places that
 * name the same thing say « feuille de match ». Decision 085's rule, applied to a verb: two screens
 * describing one state describe it in the same words, or the reader believes they are two states.
 */
export function removeMemberCardFr(displayName: string, isPlayer: boolean): RemoveMemberCard {
  if (!isPlayer) {
    return {
      titleFr: "Retirer de l’équipe",
      descriptionFr:
        "Ce membre de l’encadrement perdra l’accès à l’équipe. Rien n’est effacé : son compte et " +
        "toute la saison sont conservés.",
      buttonFr: `Retirer ${displayName} de l’équipe`,
    };
  }

  return {
    titleFr: "Retirer de l’effectif",
    descriptionFr:
      "Ce joueur ne pourra plus déclarer ses disponibilités ni être mis sur une feuille de match. " +
      "Les matchs qu’il a joués gardent son nom : rien n’est effacé.",
    buttonFr: `Retirer ${displayName} de l’effectif`,
  };
}

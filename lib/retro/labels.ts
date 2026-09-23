/**
 * The French of the retro-entry sheet's empty states.
 *
 * Here rather than in the component for the reason that keeps repeating: Vitest collects nothing
 * under `app/`, and these two sentences are statements about a form's contents — exactly the kind
 * of copy that goes false when the contents change.
 */

import { scoreLineFr } from "@/lib/calendar/labels";

/**
 * « Aucun changement : les 7 titulaires choisis ci-dessus ont fini le match. »
 *
 * The card used to say « les sept titulaires ont fini le match » unconditionally, on a form whose
 * composition was seven empty `— personne —` selects and whose own footer said « 0 joueurs avec
 * des minutes ». Seven players who had finished a match nobody had named: the same defect as
 * decision 060, where « ne change rien sur le terrain » was printed over an empty pitch.
 *
 * So the sentence counts what the coach has actually filled in, and when he has filled in nothing
 * it says what to do instead of describing a match. « ci-dessus » points at the composition card,
 * which is where the number comes from.
 */
export function retroChangesEmptyFr(startersChosen: number): string {
  if (startersChosen <= 0) {
    return (
      "Aucun changement. La composition de départ est vide : sans titulaire, il n’y a personne à " +
      "remplacer."
    );
  }
  if (startersChosen === 1) {
    return "Aucun changement : le titulaire choisi ci-dessus a fini le match.";
  }
  return `Aucun changement : les ${startersChosen} titulaires choisis ci-dessus ont fini le match.`;
}

/**
 * « Rien pour l'instant. Un 0 – 0 sans rien à signaler, ça existe. »
 *
 * Deliberately not « sans carton » : this app records no cards at all (`docs/PLAN.md`), so naming
 * one would promise a field that does not exist.
 *
 * The scoreline comes from `scoreLineFr` like every other one in the app (decisions 061 and 064).
 * It was written `0-0` by hand, with a hyphen, a few hundred pixels below the same screen's derived
 * « 0 – 0 » — the two-dashes-on-one-screen defect 064 exists to have removed, in a file that
 * already imported the function.
 */
export const RETRO_NO_FACTS_FR =
  `Rien pour l’instant. Un ${scoreLineFr(0, 0)} sans rien à signaler, ça existe.`;

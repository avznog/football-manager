/**
 * The French of the retro-entry sheet's empty states.
 *
 * Here rather than in the component for the reason that keeps repeating: Vitest collects nothing
 * under `app/`, and these sentences are statements about a form's contents — exactly the kind
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

/**
 * The sentence the Score card prints when there is no scoreline to print yet.
 *
 * It describes **the form**, never a match (decision 083): it names no team, no result and no
 * figure, because an untouched sheet knows nothing about the match and the big « 0 – 0 » it replaces
 * was claiming to.
 *
 * One sentence, and deliberately not two. It was drafted as « … Le score se déduit des buts que tu
 * ajoutes ci-dessous. », which at 390 px sits two lines under the card's own description — « Déduit
 * des buts que tu ajoutes ci-dessous. » — and repeats it word for word. Where the score comes from
 * is the description's job, and it says it whether the sheet is empty or not; this line's only job is
 * to say that the sheet is empty.
 */
export const RETRO_SCORE_EMPTY_FR = "Aucun but saisi pour l’instant.";

/**
 * Whether the Score card has a scoreline to show, and what it says if so.
 *
 * **It decides only whether to print, never what** — `goalsFor` and `goalsAgainst` arrive already
 * derived by `reduceMatch` and are handed straight to `scoreLineFr`, so decision 047 (« the score
 * on this screen is derived, there is no score input ») stays literally true, and so does 064's
 * single writer.
 *
 * `goalActions` is the count of **score-bearing rows on the sheet** — the four of
 * `SCORING_EVENT_TYPES`. Not « any content at all »: a sheet holding one foul and no goal shows no
 * scoreline, which is right, because a 0 – 0 on this screen is *asserted* by pressing
 * « Enregistrer », not reached by opening the form. That is also what makes this agree with its
 * neighbour `RETRO_NO_FACTS_FR` (« Un 0 – 0 sans rien à signaler, ça existe. ») instead of one
 * printing a scoreline the other apologises for.
 *
 * Every other screen in the app already guards this — the recap's scoreboard prints « ? – ? », the
 * calendar's event parts return null, the match page gates on the score. The retro form was the
 * odd one out: its card rendered a 36 px « 0 – 0 » under « Score » on a sheet nobody had touched.
 */
export function retroScoreLineFr(input: {
  goalActions: number;
  goalsFor: number;
  goalsAgainst: number;
}): string | null {
  if (input.goalActions <= 0) return null;
  return scoreLineFr(input.goalsFor, input.goalsAgainst);
}

/**
 * « 3 joueurs avec des minutes · 2 actions sans minute précise, placées au mieux »
 *
 * UX audit D52: the component built this by hand and printed « 1 joueurs », with an
 * `action${s > 1 ? "s" : ""}` chain for the second clause — one line from `retroChangesEmptyFr`,
 * which exists because of that exact string. So it moves in beside its neighbour.
 *
 * Both counts come from the preview the reducer produced, so this sentence is a summary of a
 * derived state and never of a match: at zero it says there are no minutes yet rather than that
 * nobody played.
 */
export function retroRecordedSummaryFr(input: {
  playersWithMinutes: number;
  guessedStamps: number;
}): string {
  const players =
    input.playersWithMinutes <= 0
      ? "Aucun joueur avec des minutes pour l’instant"
      : input.playersWithMinutes === 1
        ? "1 joueur avec des minutes"
        : `${input.playersWithMinutes} joueurs avec des minutes`;

  if (input.guessedStamps <= 0) return players;

  const stamps =
    input.guessedStamps === 1
      ? "1 action sans minute précise, placée au mieux"
      : `${input.guessedStamps} actions sans minute précise, placées au mieux`;

  return `${players} · ${stamps}`;
}

/**
 * The French of the retro-entry sheet's empty states.
 *
 * Here rather than in the component for the reason that keeps repeating: Vitest collects nothing
 * under `app/`, and these sentences are statements about a form's contents — exactly the kind
 * of copy that goes false when the contents change.
 */

import { scoreLineFr } from "@/lib/calendar/labels";

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
 * The one empty state of the one « Actions du match » list — buts, changements and the rest in a
 * single card, now that a substitution is just another thing that happened in the match.
 *
 * It replaces two sentences that each described one of the two cards, and it keeps the only thing
 * that distinguished them: **before the starting seven is named, the list has nothing it can
 * usefully hold.** « X sort, Y entre » needs somebody on the pitch to take off, which is what
 * `retroChangesEmptyFr` used to say — so the empty state points at the composition card above
 * instead of inviting an action that cannot be filled in yet.
 *
 * A boolean and not a count, unlike the sentence it descends from: this one claims no number, so it
 * needs none. The number it used to print (« les 3 titulaires choisis ci-dessus ont fini le match »)
 * was a statement about the *match* — who finished it — and decision 083 is exactly that a card with
 * no rows in it may not make one. A list that holds goals as well as substitutions cannot say it
 * anyway: no rows here means nothing was typed up at all, not that seven players played ninety
 * minutes without incident.
 */
export function retroActionsEmptyFr(startersChosen: boolean): string {
  if (!startersChosen) {
    return (
      "Aucune action pour l’instant. Commence par la composition de départ ci-dessus : sans " +
      "titulaire, personne ne peut marquer ni sortir du terrain."
    );
  }
  return RETRO_NO_FACTS_FR;
}

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
 * `action${s > 1 ? "s" : ""}` chain for the second clause — one line from the empty states above,
 * which exist because of that exact string. So it moves in beside them.
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

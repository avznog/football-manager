/**
 * What a deletion takes with it, said out loud.
 *
 * **The sentence is the safeguard.** There is now a confirmation screen of its own
 * (`/match/[id]/supprimer`, decision 191) rather than a lone button, and it is a plain form with no
 * dialog: a dialog is one more thing to get wrong, and the form works without JavaScript. So what
 * stands between a coach and an afternoon he cannot get back is what this function says.
 *
 * It did not always say much. « Le match disparaît du calendrier, avec les disponibilités
 * déclarées. » named the cheapest of the things `on delete cascade` destroyed, and not `match_squad`
 * — the sheet the coach spent a Thursday evening filling — nor `lineups`, the compositions and every
 * planned change in them. (The availability answers it did name went with availability itself,
 * decision 156; its training twin went with the trainings, decision 155.)
 *
 * And until decision 191 it could stop there, because a match with a log was undeletable: the two
 * biggest things a match owns — its **déroulé** and its **notes** — were named nowhere because no
 * button could reach them. Now one can, so they are named first and counted.
 *
 * Counting is the point. « avec les disponibilités déclarées » is a category; « 76 événements du
 * déroulé, 342 notes, la feuille de match et 2 compositions » is a quantity, and a quantity is what
 * makes a coach stop. The function is pure, so Vitest reads it — nothing under `app/` is collected
 * (see `lib/composition/copy.test.ts` on why that matters).
 */

import { pluralize } from "./labels";

/** « a », « a et b », « a, b et c » — a French enumeration, Oxford comma and all absent. */
function enumerateFr(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} et ${parts[parts.length - 1]}`;
}

/**
 * What hangs off a match by foreign key, counted.
 *
 * The four a coach would recognise. `match_player_stats` and `match_player_positions` cascade too
 * and are deliberately **not** here: they are a frozen cache of what the log already says
 * (invariant 2), so counting them would ask a coach to weigh a number that is not a fact of his
 * afternoon. `deleteMatch` still checks they are gone, which is a different job from naming them.
 */
export type MatchDeletionHolds = {
  /** Rows in `match_events`: the déroulé, voided events included. The one irreplaceable thing. */
  events: number;
  /** Rows in `ratings`: every individual note, published or not. */
  ratings: number;
  /** Rows in `match_squad`: the match sheet, starters, substitutes and supporters together. */
  squad: number;
  /** Rows in `lineups`: the starting composition and every planned change after it. */
  lineups: number;
};

/** The confirmation's description: everything the deletion reaches, counted. */
export function matchDeletionWarningFr(holds: MatchDeletionHolds): string {
  const parts: string[] = [];
  /*
   * The log first, because it is the only one of the four that cannot be entered again: a sheet can
   * be re-ticked and a composition re-drawn, while « qui a marqué à la 54ᵉ » is gone. « du déroulé »
   * rather than « événements » alone — the word on the screen that shows them is « Déroulé », and an
   * « événement » with no noun beside it is the database's word, not a coach's.
   */
  if (holds.events > 0) parts.push(`${pluralize(holds.events, "événement")} du déroulé`);
  if (holds.ratings > 0) parts.push(pluralize(holds.ratings, "note"));
  // Not a count: the sheet is one thing, whatever its length, and « la feuille de match » is the
  // name of the screen the coach filled it on.
  if (holds.squad > 0) parts.push("la feuille de match");
  if (holds.lineups > 0) parts.push(pluralize(holds.lineups, "composition"));

  if (parts.length === 0) {
    return "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.";
  }
  return `Le match disparaît du calendrier, et avec lui ${enumerateFr(parts)}. C’est définitif.`;
}

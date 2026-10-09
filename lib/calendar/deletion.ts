/**
 * What a deletion takes with it, said out loud.
 *
 * The « Supprimer » card on `/match/[id]/modifier` is a plain form with no confirmation dialog, on
 * purpose: a dialog is one more thing to get wrong, and the form works without JavaScript. The
 * consequence is that **the description on the card is the only safeguard there is.** So it had
 * better name everything that goes.
 *
 * It did not. « Le match disparaît du calendrier, avec les disponibilités déclarées. » named the
 * cheapest of the things `on delete cascade` destroyed, and not `match_squad` — the sheet the coach
 * spent a Thursday evening filling — nor `lineups`, the compositions and every planned change in
 * them. (The availability answers it did name went with availability itself, decision 156; its
 * training twin went with the trainings, decision 155.)
 *
 * Counting is the point. « avec les disponibilités déclarées » is a category; « et avec lui la
 * feuille de match et 2 compositions » is a quantity, and a quantity is what makes a coach stop. The function is pure, so Vitest reads it — nothing under `app/` is
 * collected (see `lib/composition/copy.test.ts` on why that matters).
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
 * Only the two a deletable match can hold. `match_events`, `match_player_stats` and `ratings`
 * cascade too, but a match with any of them has a non-empty log, and both the page and
 * `deleteMatch` refuse that outright (decision 003) — naming them would describe a button nobody
 * can press.
 */
export type MatchDeletionHolds = {
  /** Rows in `match_squad`: the match sheet, starters, substitutes and supporters together. */
  squad: number;
  /** Rows in `lineups`: the starting composition and every planned change after it. */
  lineups: number;
};

/** The « Supprimer » card's description on a match: everything the cascade reaches, counted. */
export function matchDeletionWarningFr(holds: MatchDeletionHolds): string {
  const parts: string[] = [];
  // Not a count: the sheet is one thing, whatever its length, and « la feuille de match » is the
  // name of the screen the coach filled it on.
  if (holds.squad > 0) parts.push("la feuille de match");
  if (holds.lineups > 0) parts.push(pluralize(holds.lineups, "composition"));

  if (parts.length === 0) {
    return "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.";
  }
  return `Le match disparaît du calendrier, et avec lui ${enumerateFr(parts)}. C’est définitif.`;
}

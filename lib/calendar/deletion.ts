/**
 * What a deletion takes with it, said out loud.
 *
 * The two « Supprimer » cards — on `/match/[id]/modifier` and `/entrainements/[id]/modifier` — are
 * plain forms with no confirmation dialog, on purpose: a dialog is one more thing to get wrong, and
 * the form works without JavaScript. The consequence is that **the description on the card is the
 * only safeguard there is.** So it had better name everything that goes.
 *
 * It did not. « Le match disparaît du calendrier, avec les disponibilités déclarées. » named the
 * cheapest of the three things `on delete cascade` destroys: the availability answers, yes, but also
 * `match_squad` — the sheet the coach spent a Thursday evening filling — and `lineups`, the
 * compositions and every planned change in them. The demo season's next match holds eleven answers,
 * an eleven-row sheet and two compositions, and the sentence mentioned one of those. The training
 * twin said « avec les réponses déjà données » and never mentioned `training_attendance`, which a
 * deletable séance can hold: decision 099 has since shut the pointage until 30 minutes before
 * kick-off, and the delete button is offered until the séance is over, so the two windows overlap by
 * exactly the length of a séance plus its grace. Narrow, and not empty — the count is still worth
 * saying, because the marks inside it are the ones taken at the pitch.
 *
 * Counting is the point. « avec les disponibilités déclarées » is a category; « et avec lui 11
 * réponses de disponibilité, la feuille de match et 2 compositions » is a quantity, and a quantity is
 * what makes a coach stop. Both functions are pure, so Vitest reads them — nothing under `app/` is
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
 * Only the three a deletable match can hold. `match_events`, `match_player_stats` and `ratings`
 * cascade too, but a match with any of them has a non-empty log, and both the page and
 * `deleteMatch` refuse that outright (decision 003) — naming them would describe a button nobody
 * can press.
 */
export type MatchDeletionHolds = {
  /** Rows in `match_availability`: members who answered « je suis dispo », or not. */
  answers: number;
  /** Rows in `match_squad`: the match sheet, starters, substitutes and supporters together. */
  squad: number;
  /** Rows in `lineups`: the starting composition and every planned change after it. */
  lineups: number;
};

/** What hangs off a training by foreign key, counted. */
export type TrainingDeletionHolds = {
  /** Rows in `training_availability`. */
  answers: number;
  /** Rows in `training_attendance` — markable from 30 minutes before, so possible on a deletable one. */
  attendance: number;
};

/** The « Supprimer » card's description on a match: everything the cascade reaches, counted. */
export function matchDeletionWarningFr(holds: MatchDeletionHolds): string {
  const parts: string[] = [];
  if (holds.answers > 0) {
    parts.push(pluralize(holds.answers, "réponse de disponibilité", "réponses de disponibilité"));
  }
  // Not a count: the sheet is one thing, whatever its length, and « la feuille de match » is the
  // name of the screen the coach filled it on.
  if (holds.squad > 0) parts.push("la feuille de match");
  if (holds.lineups > 0) parts.push(pluralize(holds.lineups, "composition"));

  if (parts.length === 0) {
    return "Le match disparaît du calendrier. Rien d’autre n’y est encore rattaché.";
  }
  return `Le match disparaît du calendrier, et avec lui ${enumerateFr(parts)}. C’est définitif.`;
}

/** The same, for a séance. « avec elle », and the attendance marks the statistics are built on. */
export function trainingDeletionWarningFr(holds: TrainingDeletionHolds): string {
  const parts: string[] = [];
  if (holds.answers > 0) parts.push(pluralize(holds.answers, "réponse"));
  if (holds.attendance > 0) {
    // « le pointage de 1 joueur » is not French, and this is the one branch where the count is small
    // often enough to matter.
    parts.push(
      holds.attendance === 1
        ? "le pointage d’un joueur"
        : `le pointage de ${holds.attendance} joueurs`,
    );
  }

  if (parts.length === 0) {
    return "La séance disparaît du calendrier. Rien d’autre n’y est encore rattaché.";
  }
  return `La séance disparaît du calendrier, et avec elle ${enumerateFr(parts)}. C’est définitif.`;
}

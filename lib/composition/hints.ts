/**
 * The sentences the composition editor says about the state it is in.
 *
 * They live here, not in `components/composition/composition-editor.tsx`, for the reason decision
 * 097 gives: a French sentence that is only true of *some* states of the screen is a claim, and a
 * claim belongs in a pure function a test can walk every branch of. « Appuie sur un joueur puis sur
 * un poste » is false when the bench is empty, and « il reste 2 postes libres » is false when the
 * seven are placed — both were printed unconditionally before this module existed.
 *
 * Everything here tutoie (decision 074) and nothing here is a tooltip (decision 072): these strings
 * are rendered as visible text or as an accessible name, never as a `title`.
 */

import type { SquadRole } from "@/db/schema";

/** French plural marker for a count. `1 poste`, `2 postes`. */
function s(count: number): string {
  return count > 1 ? "s" : "";
}

export type BenchHintInput = {
  /** Which of the editor's two modes is on. `shape` moves the postes, not the players. */
  mode: "players" | "shape";
  /** Players on the match sheet who are not on the pitch yet. */
  benchCount: number;
  /** Slots of the current formation with nobody in them. */
  freeSlots: number;
};

/**
 * The one line above the bench strip: how many players are on it, how many postes are still free,
 * and what a thumb does about it.
 *
 * **The count is the point of the sentence.** The bench is a strip that scrolls sideways, and about
 * five of its discs fit on a 390 px screen, so the number of players waiting is the one thing the
 * layout itself no longer shows — « 9 au banc » is what stops the four off the right edge from being
 * forgotten, which the old wrapping list did by being 300 px tall.
 *
 * It is the tap path that is spelled out, not the drag: on a phone the tap is the path that works
 * every time, and the drag is discoverable from the disc itself.
 */
export function benchHintFr({ mode, benchCount, freeSlots }: BenchHintInput): string {
  if (mode === "shape") return "Repasse en « Joueurs » pour placer quelqu’un.";

  if (benchCount === 0) {
    return freeSlots === 0
      ? "Les sept sont placés, le banc est vide."
      : `Plus personne à placer, et il reste ${freeSlots} poste${s(freeSlots)} libre${s(freeSlots)}.`;
  }

  const bench = `${benchCount} au banc`;

  if (freeSlots === 0) {
    return `${bench}, tous les postes pris. Appuie sur un joueur puis sur un poste pour échanger.`;
  }

  return `${bench}, ${freeSlots} poste${s(freeSlots)} libre${s(freeSlots)}. Appuie sur un joueur puis sur un poste.`;
}

export type BenchPlayerLabelInput = {
  name: string;
  jerseyNumber: number | null;
  /** `null` = not on the match sheet. Such a player is never on the bench strip, only on the pitch. */
  squadRole: SquadRole | null;
  isInjured: boolean;
};

/**
 * The accessible name of a bench disc.
 *
 * The disc itself only draws a number and a truncated name, so « titulaire » / « remplaçant » — the
 * one thing the strip's *order* carries visually — has to be said somewhere a screen reader hears it.
 */
export function benchPlayerLabelFr({
  name,
  jerseyNumber,
  squadRole,
  isInjured,
}: BenchPlayerLabelInput): string {
  return [
    name,
    jerseyNumber === null ? null : `numéro ${jerseyNumber}`,
    squadRole === "starter" ? "titulaire" : squadRole === "substitute" ? "remplaçant" : null,
    isInjured ? "blessé" : null,
  ]
    .filter(Boolean)
    .join(", ");
}

/**
 * The hint under the minute field. It interpolates the length of the match, so it cannot be a
 * constant: a 2×25 match must not be told it lasts 60 minutes.
 */
export function minuteFieldHintFr(totalMinutes: number): string {
  return `0 pour la composition de départ. Le match dure ${totalMinutes} minutes et les minutes sont continues.`;
}

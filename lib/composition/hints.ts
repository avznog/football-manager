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
export function benchHintFr({ benchCount, freeSlots }: BenchHintInput): string {
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

export type BenchDropHintInput = {
  name: string;
  /**
   * Whether the carried disc was lifted **off the turf**. A disc lifted from the bench strip was
   * not, and that is the whole of the distinction below — `slotOfMember(assignments, lifted)` is
   * what answers it in the editor, the same question `sendToBench` already asks to pick its own
   * wording.
   */
  fromPitch: boolean;
};

/**
 * What the bench says while a carried player is held over it — or `null` when it must say nothing,
 * which is also the signal not to ring the dock.
 *
 * The dock is the drop target that sends a player back to the bench, and until it said so the
 * gesture looked broken even once it worked: `Pitch` is `overflow-hidden`, so the disc under the
 * finger is clipped away the moment it leaves the turf. This sentence and the ring around the dock
 * are what replace it — not the disc, which must stay inside the turf with the other markers.
 *
 * **A disc lifted from the bench gets neither, and that is the fix.** Both halves of the
 * justification above are about the pitch: nothing is clipped, because a bench disc stays visible in
 * the strip right under the finger, and there is nothing to announce, because releasing over the dock
 * runs `sendToBench` on a player who is already on the bench — it removes nobody, and the editor
 * itself says so out loud with « reste sur le banc ». Ringing the dock and printing « Relâche ici :
 * Momo retourne sur le banc » was the screen contradicting its own announcement, after two pixels of
 * thumb travel that never left the strip.
 *
 * The alternative — keep the ring, swap in a « Momo reste sur le banc. » wording — was weighed and
 * rejected, on a phone specifically. An accented line plus a ring drawn around the thing under your
 * thumb reads as *something happens when you let go*, and the one fact the coach needs here is that
 * nothing does; a sentence that says « reste » inside a highlight that says « relâche » makes him
 * read twice to learn there was no move. Saying nothing says it in none. And what silence leaves on
 * screen is not blank: `benchHintFr`'s count and tap path stay up, both still true mid-drag, and the
 * dock's single line stops flickering between two claims every time a finger wobbles over the strip.
 */
export function benchDropHintFr({ name, fromPitch }: BenchDropHintInput): string | null {
  if (!fromPitch) return null;
  return `Relâche ici : ${name} retourne sur le banc.`;
}

/**
 * The hint under the minute field. It interpolates the length of the match, so it cannot be a
 * constant: a 2×25 match must not be told it lasts 60 minutes.
 */
export function minuteFieldHintFr(totalMinutes: number): string {
  return `0 pour la composition de départ. Le match dure ${totalMinutes} minutes et les minutes sont continues.`;
}

/** Highest minute a composition may start at — `fromMinuteSchema`'s ceiling, in the field's `max`. */
export const MINUTE_MAX = 200;

/**
 * The minute a composition starts at, read from what the coach has actually typed, or `null` when
 * that is not a minute yet.
 *
 * It lives beside the sentences about the field because it is the same question they answer: what
 * the field *says*. And it is the reason the field can be emptied at all — the editor used to hold a
 * `number` and coerce `""` to `0` on every keystroke, so the value snapped back to `0` the instant
 * the field was empty and reaching 10 meant typing `010` and deleting from the left. An empty field
 * is a coach mid-keystroke: a legal state to be in, an invalid one to submit.
 *
 * **Digits, checked before anything is converted.** `Number` reads far more than a minute:
 * `Number("1e2")` is 100 and `Number("0x10")` is 16, and `Number.isInteger` says yes to both — while
 * `<input type="number">` really does accept `1e2`, which is a valid floating-point literal in HTML.
 * So the field could read « 1e2 » with the card above it reading « à partir de la 100ᵉ minute »: two
 * accounts of one number, which is the single thing this module exists to prevent. A minute is a run
 * of digits or it is not a minute yet.
 *
 * The optional `-` is deliberate and is not a minute being accepted: `-1` stays out of range, so
 * `minuteFieldErrorFr` answers it with « Cette minute est en dehors du match » — which is what is
 * actually wrong with it — instead of asking for a minute the coach has visibly already typed.
 */
export function parseMinute(raw: string): number | null {
  const typed = raw.trim();
  if (typed === "") return null;
  if (!/^-?\d+$/.test(typed)) return null;
  return Number(typed);
}

/**
 * Why the minute field cannot be submitted, or `null` when it can.
 *
 * Out of range says the same thing as `fromMinuteSchema`'s own message, on purpose: the coach must
 * not be told two different stories about the same number by the field and by the server.
 */
export function minuteFieldErrorFr(raw: string): string | null {
  const minute = parseMinute(raw);
  if (minute === null) {
    return "Indique la minute à partir de laquelle cette composition s’applique.";
  }
  if (minute < 0 || minute > MINUTE_MAX) return "Cette minute est en dehors du match.";
  return null;
}

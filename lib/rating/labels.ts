/**
 * A note, and whoever wrote it, in words.
 *
 * Pure, and in `lib/` rather than beside the component, because Vitest collects `lib/**` and nothing
 * under `app/` — a sentence living in a `.tsx` file is a sentence no test can read.
 *
 * ## Who reads these
 *
 * Decision 007 printed the whole team's notes with every author named, to everybody. Decision 137
 * gives that list to the **coach alone**: a player reads one settled figure per match and never an
 * individual note. So `noteAuthorFr` and `ratingCountNoteFr` below are coach-facing, and the one
 * sentence they no longer have to get right is « il s'est mis 8 » — nobody rates himself any more, so
 * the third person about a reader's own row has no row to appear on.
 */

import { pluralize } from "@/lib/calendar/labels";

import { formatAverage, RATING_SCORE_MAX } from "./aggregate";

/** One note's author, reduced to what naming him needs. A full `RatingReceived` is assignable. */
export type NoteAuthor = {
  raterName: string;
  /** The reader wrote it. The coach plays too, so his own notes are in the list he is reading. */
  isViewer: boolean;
};

/**
 * The author of one note, as the chip naming him reads.
 *
 * Two cases now, where there used to be four: `isSelf` is gone with self-rating, and with it the
 * « lui-même » that read as a fourth teammate nobody could place. « (toi) » stays — the coach is a
 * player, and a list of eleven notes in which he cannot find his own is a list he will distrust.
 */
export function noteAuthorFr(note: NoteAuthor): string {
  return note.isViewer ? `${note.raterName} (toi)` : note.raterName;
}

/**
 * The line under a rated player's name in the coach's list: how many notes his figure rests on.
 *
 * **Only the coach sees this.** A player reads « 7,5 » and nothing else: the count is a fact about
 * who took part, and on a player's own screen it is an invitation to work out who did not. The coach
 * needs it for the opposite reason — a mean of three notes and a mean of eleven are not the same
 * figure, and he is the one who decides whether to publish.
 */
export function ratingCountNoteFr(count: number): string {
  if (count === 0) return "pas encore noté";
  return pluralize(count, "note");
}

/**
 * « 7,5 » — one note, or one mean, as a figure on the screen.
 *
 * Always one decimal, deliberately: the slider's « 5,0 » has to look like the same kind of thing as
 * the « 7,5 » two rows down, and « 5 » next to « 7,5 » reads as a different scale.
 */
export function ratingScoreFr(score: number | null): string {
  return formatAverage(score);
}

/**
 * What a screen reader says for a slider: « 7,5 sur 10 ».
 *
 * Without it the thumb announces « 7.5 », read in English by a French voice, and the scale is left
 * for the listener to assume. `aria-valuetext` replaces the number entirely, which is why it has to
 * carry « sur 10 » itself.
 */
export function ratingScoreValueTextFr(score: number): string {
  return `${formatAverage(score)} sur ${RATING_SCORE_MAX}`;
}

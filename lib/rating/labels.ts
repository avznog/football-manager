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

import { formatAverage, RATING_SCORE_DEFAULT, RATING_SCORE_MAX } from "./aggregate";

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

/**
 * The sentence above the sliders, and **it is not optional**.
 *
 * Every slider starts at `RATING_SCORE_DEFAULT` and every slider is submitted, so an untouched one
 * records 5,0 as an opinion rather than as a silence. That is a real cost of choosing a slider over
 * the old 0–10 pad, it was accepted when the choice was made, and the agreed mitigation is this: the
 * screen states the rule in the words below, above the list, before anybody touches anything.
 *
 * Here rather than in the component because Vitest collects `lib/**` and nothing under `app/`
 * (decision 097) — a promise this load-bearing has to be pinnable by a test.
 */
export const RATING_SLIDERS_START_AT_FR =
  `Tous les curseurs partent de ${formatAverage(RATING_SCORE_DEFAULT)}. ` +
  "Si tu n’y touches pas, c’est la note que tu donnes.";

/** « Une note envoyée ne change plus. » The `onConflictDoNothing` in `actions.ts`, said out loud. */
export const RATING_IS_FINAL_FR = "Une note envoyée ne change plus.";

/**
 * What the screen says once the notes are in — and what it no longer says.
 *
 * Under decision 021 this line was « il en reste à mettre pour voir celles des autres »: the reader's
 * own submissions bought him the right to read. Decision 137 deleted that trade, so the confirmation
 * is about the team's calendar instead of about his debt — he waits for everybody, including the
 * people he cannot do anything about.
 *
 * `unchanged > 0` with `saved === 0` is the retry path: a patchy connection resubmitting the same set
 * must not read as a failure, and « déjà enregistrées » is the truth about it.
 */
export function ratingsSavedFr(saved: number, unchanged: number): string {
  if (saved === 0) {
    return unchanged > 0
      ? "Ces notes étaient déjà enregistrées."
      : "Rien de nouveau à enregistrer.";
  }
  return (
    `${pluralize(saved, "note")} ${saved > 1 ? "enregistrées" : "enregistrée"}. ` +
    "C’est le coach qui décide quand les moyennes sortent."
  );
}

/**
 * The line that invites a member to note a match he has not finished — what used to be
 * `ratingUrgencyFr` in `lib/rating/window.ts`, which is deleted along with the window (decision 139).
 *
 * There is no urgency left to express, and that is the honest version of it: **nothing closes the
 * notation**, so the old sentence's promise that « tes notes ne compteront plus » is simply false. What
 * remains to say is who decides — the coach, per match — because that is the only thing a member
 * waiting for a figure can usefully know, and he cannot act on it.
 *
 * Two states, and the second is the uncomfortable one. Once the means are out a member may **still**
 * note (decision 139, asked for and chosen with the cost stated), so his notes will move a figure the
 * squad has already read, and he writes them having read it. The anti-anchoring guarantee decisions
 * 021, 137 and 138 were built around is gone, and the sentence does not pretend otherwise: it says the
 * means are out and that his notes will count anyway, rather than inviting him in as though nothing had
 * been published.
 *
 * Only for a viewer whose set is unfinished — it is about notes he has still to give, which is nothing
 * to say to somebody who has already rated everybody.
 */
export function ratingInvitationFr(meansVisible: boolean): string {
  if (meansVisible) {
    return (
      "Les moyennes de ce match sont sorties, et tu peux quand même noter : " +
      "tes notes compteront dedans."
    );
  }
  return (
    "Tu peux noter quand tu veux, ce match reste ouvert. " +
    "C’est le coach qui décide quand les moyennes sortent."
  );
}

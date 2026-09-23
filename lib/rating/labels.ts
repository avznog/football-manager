/**
 * Who wrote a note, in words — and in the right person.
 *
 * The recap prints the whole team's ratings with every author named (decision 007), which means the
 * reader finds *himself* in that list twice over: once as the author of the notes he gave, and once
 * as the subject of the row about him. `RatingsPanel` handled the first case and not the second, so
 * the same screen said « 7 Karim (toi) » on one row and, two rows down on Karim's own,
 * « 4 notes · il s’est mis 8 » with the chip « 8 lui-même ». The app tutoies the reader everywhere
 * else (decision 074); here it talked about him behind his back.
 *
 * Pure, and in `lib/` rather than beside the component, because Vitest collects `lib/**` and nothing
 * under `app/` — a sentence living in a `.tsx` file is a sentence no test can read.
 */

import { pluralize } from "@/lib/calendar/labels";

/** One note's author, reduced to what naming him needs. A full `RatingReceived` is assignable. */
export type NoteAuthor = {
  raterName: string;
  /** The author rated himself: this note is on his own row. */
  isSelf: boolean;
  /** The viewer wrote it. */
  isViewer: boolean;
};

/**
 * The author of one note, as the chip and the comment attribution both name him.
 *
 * Four cases, and only the first was wrong. Note that « toi » wins over « lui-même »: a self-note
 * written by the reader is still the reader's, and « lui-même » about the person holding the phone
 * reads as a fourth teammate nobody can place.
 */
export function noteAuthorFr(note: NoteAuthor): string {
  if (note.isSelf && note.isViewer) return "toi";
  if (note.isSelf) return "lui-même";
  if (note.isViewer) return `${note.raterName} (toi)`;
  return note.raterName;
}

/**
 * The line under a rated player's name: how many notes he has, and what he gave himself.
 *
 * `selfScore` is exposed separately by `aggregateRatings` precisely so this line can exist (see its
 * rule 1). It is only ever shown when the player did rate himself, so « pas encore noté » and a
 * self-score cannot both be true.
 */
export function ratingCountNoteFr(input: {
  count: number;
  selfScore: number | null;
  /** The row is the reader's own. */
  isViewer: boolean;
}): string {
  if (input.count === 0) return "pas encore noté";

  const notes = pluralize(input.count, "note");
  if (input.selfScore === null) return notes;

  // Not « il s'est mis » for the reader, who is reading his own row.
  return input.isViewer
    ? `${notes} · tu t’es mis ${input.selfScore}`
    : `${notes} · il s’est mis ${input.selfScore}`;
}

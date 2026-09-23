/**
 * Validation for the rating form. Pure — no server imports — so it is unit tested directly and the
 * same rules could be reused for inline validation on the client.
 *
 * Every message is French: they are shown to the player.
 */

import { z } from "zod";

import { RATING_SCORE_MAX, RATING_SCORE_MIN } from "./aggregate";

/** Long enough for « énorme match, dommage pour le penalty », short enough to stay readable. */
export const RATING_COMMENT_MAX = 240;

/**
 * A note is a **whole number from 0 to 10** (decision 007) — the same range as the `ratings.score`
 * check constraint, so a valid form can never produce a row the database refuses.
 *
 * `coerce` because it arrives as a string from a radio input, and `int` before the bounds so "7.5"
 * is reported as "not a whole number" rather than as out of range. (A French "7,5" coerces to `NaN`
 * and is reported as "choisis une note", which is the right thing to say to someone who typed it.)
 */
export const ratingScoreSchema = z.coerce
  .number({ message: "Choisis une note de 0 à 10." })
  .int("Une note est un nombre entier.")
  .min(RATING_SCORE_MIN, `Une note va de ${RATING_SCORE_MIN} à ${RATING_SCORE_MAX}.`)
  .max(RATING_SCORE_MAX, `Une note va de ${RATING_SCORE_MIN} à ${RATING_SCORE_MAX}.`);

/** An empty textarea means "no comment", which is a `null` column, not an empty string. */
export const ratingCommentSchema = z
  .string()
  .trim()
  .max(RATING_COMMENT_MAX, "Ce commentaire est trop long.")
  .optional()
  .transform((value) => (value && value.length > 0 ? value : null));

/**
 * The identifiers only ever come from hidden fields the app itself rendered, so a failure here means
 * a mangled or forged request — but the message is still French, because the action surfaces the
 * first issue to the player and nobody should ever be shown "Invalid UUID".
 */
const identifierSchema = z.uuid("Ce formulaire est invalide, recharge la page.");

export const ratingEntrySchema = z.object({
  ratedMemberId: identifierSchema,
  score: ratingScoreSchema,
  comment: ratingCommentSchema,
});

export const submitRatingsSchema = z.object({
  teamId: identifierSchema,
  matchId: identifierSchema,
  entries: z
    .array(ratingEntrySchema)
    .min(1, "Mets au moins une note avant d’enregistrer.")
    // A 7-a-side sheet is a dozen people; anything larger is not a form, it is an attack.
    .max(40, "Trop de notes dans ce formulaire."),
});

export type RatingEntryInput = z.infer<typeof ratingEntrySchema>;
export type SubmitRatingsInput = z.infer<typeof submitRatingsSchema>;

/**
 * Pulls the per-player fields out of one `FormData`.
 *
 * The whole sheet is submitted in a single POST — on a phone on the way home, twelve round trips is
 * twelve chances to lose the connection (same reasoning as `readAttendanceMarks` in
 * `lib/training/validation.ts`). Fields are named `score:<teamMemberId>` and
 * `comment:<teamMemberId>`.
 *
 * Two deliberate leniencies, because the form legitimately arrives half-filled:
 *
 * - **A player left blank is skipped, not rejected.** Rating is progressive: you save what you have
 *   and finish later. Only what is present is parsed, so an unanswered card costs nothing.
 * - **A comment with no note is dropped.** A comment qualifies a note; there is no row to hang it
 *   on without one, and the column is `not null`. The UI keeps the comment box disabled-looking
 *   until a note is picked, so this only catches the awkward paths.
 *
 * A malformed score (someone editing the DOM) *is* surfaced: it comes back as a parsed entry with
 * the raw value, and `submitRatingsSchema` rejects it with a French message rather than silently
 * ignoring a note the player believes he gave.
 */
export function readRatingEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
): { ratedMemberId: string; score: unknown; comment: unknown }[] {
  const scores = new Map<string, string>();
  const comments = new Map<string, string>();

  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;

    if (key.startsWith("score:")) {
      const memberId = key.slice("score:".length);
      // A radio group with nothing selected submits nothing; an empty value means the same.
      if (memberId.length > 0 && value.trim().length > 0) scores.set(memberId, value.trim());
      continue;
    }

    if (key.startsWith("comment:")) {
      const memberId = key.slice("comment:".length);
      if (memberId.length > 0) comments.set(memberId, value);
    }
  }

  return [...scores.entries()].map(([ratedMemberId, score]) => ({
    ratedMemberId,
    score,
    comment: comments.get(ratedMemberId) ?? undefined,
  }));
}

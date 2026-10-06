/**
 * Validation for the rating form. Pure — no server imports — so it is unit tested directly and the
 * same rules could be reused for inline validation on the client.
 *
 * Every message is French: they are shown to the player.
 */

import { z } from "zod";

import { RATING_SCORE_MAX, RATING_SCORE_MIN, RATING_SCORE_STEP } from "./aggregate";

/**
 * A note runs from 0 to 10 **in half-points** (decision 137, keeping decision 007's range and adding
 * the step). The same two bounds as the `ratings_score_range` check, so a form this schema accepts
 * can never produce a row the database refuses — and, the direction that actually bites, a slider the
 * screen renders can never produce a note this schema refuses.
 *
 * The step is **stricter than the column**, deliberately, since decision 144: `ratings_score_one_decimal`
 * tolerates a tenth so a historical mean can be imported, while a note *submitted through the
 * match-day slider* is still a half-point and anything else means a mangled or forged request.
 *
 * `coerce` because it arrives as a string from an `<input type="range">`. The step is checked by
 * arithmetic on a doubled value rather than with `multipleOf`: `0.5` is exact in binary floating
 * point, so `7.5 * 2 === 15` holds with no tolerance needed, and the message can then say what is
 * wrong rather than « nombre invalide ».
 *
 * A French « 7,5 » coerces to `NaN` and is reported as « choisis une note », which is the right thing
 * to say to somebody who typed it — but nothing in the app sends it: a range input emits `7.5`.
 */
export const ratingScoreSchema = z.coerce
  .number({ message: "Choisis une note de 0 à 10." })
  .min(RATING_SCORE_MIN, `Une note va de ${RATING_SCORE_MIN} à ${RATING_SCORE_MAX}.`)
  .max(RATING_SCORE_MAX, `Une note va de ${RATING_SCORE_MIN} à ${RATING_SCORE_MAX}.`)
  .refine(
    (score) => Number.isInteger(score / RATING_SCORE_STEP),
    "Une note va par demi-points : 7 ou 7,5, pas 7,2.",
  );

/**
 * The identifiers only ever come from hidden fields the app itself rendered, so a failure here means
 * a mangled or forged request — but the message is still French, because the action surfaces the
 * first issue to the player and nobody should ever be shown "Invalid UUID".
 */
const identifierSchema = z.uuid("Ce formulaire est invalide, recharge la page.");

export const ratingEntrySchema = z.object({
  ratedMemberId: identifierSchema,
  score: ratingScoreSchema,
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
 * The whole set is submitted in a single POST — which decision 021 had to *ask* for, because the old
 * card-at-a-time flow saved one note per round trip. Under decision 137 it is structural: the screen
 * is one list with one button, so there is no half-submitted state to anchor on. Fields are named
 * `score:<teamMemberId>`, and there is no longer a `comment:<teamMemberId>` — the free-text field and
 * its column are gone.
 *
 * **A player with no field is skipped, not rejected.** Under the slider screen every target submits a
 * value, so this leniency catches only the awkward paths: a disabled control, a member removed from
 * the log while the page was open, a form rebuilt by hand. Rejecting the whole set because one field
 * went missing would lose eleven notes the player did give.
 *
 * A *malformed* score (somebody editing the DOM) **is** surfaced: it comes back as a parsed entry
 * carrying the raw value, and `submitRatingsSchema` rejects it with a French message rather than
 * silently ignoring a note the player believes he gave.
 */
export function readRatingEntries(
  entries: Iterable<[string, FormDataEntryValue]>,
): { ratedMemberId: string; score: unknown }[] {
  const scores = new Map<string, string>();

  for (const [key, value] of entries) {
    if (typeof value !== "string") continue;
    if (!key.startsWith("score:")) continue;

    const memberId = key.slice("score:".length);
    // An empty value is a control that submitted nothing, not a note of zero.
    if (memberId.length > 0 && value.trim().length > 0) scores.set(memberId, value.trim());
  }

  return [...scores.entries()].map(([ratedMemberId, score]) => ({ ratedMemberId, score }));
}

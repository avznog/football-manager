/**
 * The flocage: the name printed on the back of a shirt, above the number.
 *
 * Pure, and in `lib/` for the reason decision 097 names: `vitest.config.ts` collects `lib/**` and
 * nothing under `app/`, so a sentence written inside a Server Component is a sentence no test can
 * read. Everything here has to survive the normal case — **no flocage at all** — because most
 * members will never have one, and « — », « () » and « undefined » are exactly what the last ten
 * defects in this repository looked like.
 */

/**
 * How many characters a 7-a-side shirt back actually holds.
 *
 * The limit is the kit, not the column: the flocage is printed across the width of the back above
 * the number, and past a dozen characters the printer either shrinks it to something unreadable or
 * refuses the job. Enforced three times, on purpose — here for the form and its hint, in
 * `shirtNameSchema` for the submission, and by the `team_members_shirt_name_length` check so no
 * other writer can get round it.
 */
export const SHIRT_NAME_MAX_CHARS = 12;

/**
 * What a flocage reads as on a shirt: trimmed, uppercase, or `null` when there is none.
 *
 * Uppercased **here and not in the database**: a real shirt is printed in capitals, but the player
 * typed « Momo » or « El Professor » and destroying their capitalisation on the way into the column
 * would make the stored value a display artefact. Blank in, `null` out, so a value that somehow got
 * past the check constraint still collapses to "no flocage" rather than to an empty gap on a row.
 *
 * `toLocaleUpperCase("fr-FR")` rather than `toUpperCase()`: « é » has to become « É », which is what
 * a flocking machine prints.
 */
export function shirtNameDisplay(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;
  return trimmed.toLocaleUpperCase("fr-FR");
}

/**
 * The value shown beside « Nom sur le maillot&nbsp;: » when the reader cannot edit it.
 *
 * « aucun » rather than a dash: the fiche is read by a coach ordering a set of shirts, and the
 * difference between "nobody has decided yet" and "this field is broken" is the whole sentence. It
 * matches the « non attribué » the jersey number already uses one line above.
 */
export function shirtNameValueFr(value: string | null | undefined): string {
  return shirtNameDisplay(value) ?? "aucun";
}

/**
 * The flocage as it appears on a squad row of `/equipe`, or `null` when there is none.
 *
 * The word « floqué » is carried with the value for one reason: the row's second line is a list of
 * fragments separated by « · » — the username, then the position codes — and « MOMO » dropped
 * between them reads as another code. And returning `null` rather than an empty string means the
 * caller cannot render a stray separator: there is nothing to separate.
 */
export function shirtNameRowFr(value: string | null | undefined): string | null {
  const display = shirtNameDisplay(value);
  return display === null ? null : `floqué ${display}`;
}

/**
 * The hint under the « Nom sur le maillot » field, for the three readers who see it.
 *
 * A member of the encadrement has no maillot at all, so their hint is the one `jerseyHintFr`
 * already gives for the number rather than an invitation to invent a flocage. The other two are the
 * player himself and a coach filling it in for him — decision 095's rule: the reader is « toi »
 * wherever he appears, and the sentence about somebody else never says « ton ».
 */
export function shirtNameHintFr(isPlayer: boolean, isSelf: boolean): string {
  if (!isPlayer) return "Laisse vide : un membre de l’encadrement n’a pas de maillot.";

  const who = isSelf
    ? "Ce qui est imprimé dans ton dos, souvent un surnom plutôt qu’un nom de famille."
    : "Ce qui est imprimé dans son dos, souvent un surnom plutôt qu’un nom de famille.";

  return `${who} ${SHIRT_NAME_MAX_CHARS} caractères au plus, et c’est écrit en majuscules sur le maillot.`;
}

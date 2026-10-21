/**
 * The one place the old app's people are paired with this app's.
 *
 * It was a `const` inside `scripts/import-radarlocal.mts` until a second importer needed it
 * (`scripts/import-ratings.mts`, decision 188). That script cannot `import` the first one: the
 * module calls `main()` at load time, so importing it would re-run an import. So the table moves
 * here and both read it, rather than a second copy being typed out and drifting — which for *these*
 * names would not be a cosmetic drift. « Leo COACH » and « Léo Montpre » are two different men, and
 * a mapping that confused them would attribute one's notes to the other with nothing failing.
 *
 * No side effects, no database, no `process.env`: data only, so either script may import it before
 * it has loaded its own environment.
 */

/**
 * Old `profiles.full_name`, **verbatim including its trailing spaces**, to this app's
 * `users.display_name`.
 *
 * Declared rather than computed, because it is a judgement: « Leo COACH » is Léo C and « Léo
 * Montpre » is Léo M, and nothing in the two strings says which of the two « Léo »s each one is.
 * `null` means « this person has no counterpart in this team », which the verification then holds to
 * its word by asserting he is referenced nowhere in the match data.
 */
export const OLD_TO_TARGET_DISPLAY_NAME: Readonly<Record<string, string | null>> = {
  Samuel: "Samuel",
  Lucas: "Lucas",
  Nicolas: "Nicolas",
  "Lucien ": "Lucien",
  Edouard: "Édouard",
  Charles: "Charles",
  Clément: "Clément",
  Benoît: "Benoît",
  "Maxime Goulard ": "Maxime",
  "Leo COACH": "Léo C",
  Pierre: "Pierre",
  Rémi: "Rémi",
  "Léo Montpre": "Léo M",
  "Nicodème (gronaldo)": "Nicodème",
  "Thomas Brunet": "Thomas",
  "Benjamin Gonzva": "Benjamin",
  "Alexis CHARRIER": null,
  // Added 2026-10-21. He is the one man this table could not name when it was written: decision 200
  // recorded that `raphael` « does not exist in the old app at all », so his hash stayed production's
  // own argon2id and he was the only non-admin account with no e-mail. The owner created him over
  // there on 2026-10-21, as « Raph » — not a prefix of any other name here, so the mapping is safe in
  // a way « Léo » would not be.
  Raph: "Raphaël",
};

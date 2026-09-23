/**
 * The French vocabulary and number formats of the statistics screens, in one place.
 *
 * Hardcoded French, no i18n layer (decision 012), and no `toLocaleString`: a decimal comma and a
 * non-breaking space before a `%` are two characters, while an ICU locale is a runtime dependency
 * whose output can differ between the developer's machine and a Vercel function. These functions
 * are pure and pinned by `format.test.ts`.
 *
 * The rule the whole screen leans on: **`null` means "nobody has this number yet"** and is rendered
 * as an em dash with an explanation nearby — never as `0`, never as `NaN`, never as `0 %`
 * (`aggregate.ts`, rule 1).
 */

/** What a statistic with no data behind it says, spelled once. */
export const NO_DATA_FR = "pas encore de données";

/** The placeholder inside a dense table, where the sentence above would not fit. */
export const NO_VALUE_FR = "—";

/** `312` → `312′`. The prime is how a football minute is written. */
export function formatMinutes(minutes: number): string {
  return `${minutes}′`;
}

/** `6.25` → `6,25`, trimmed to `digits` decimals. French uses a comma. */
export function formatDecimal(value: number, digits = 1): string {
  return value.toFixed(digits).replace(".", ",");
}

/** An average rating out of 10, or the dash when nobody has rated (rule 1). */
export function formatRating(average: number | null): string {
  return average === null ? NO_VALUE_FR : formatDecimal(average, 1);
}

/** `0.8` → `80 %`, with the non-breaking space French typography requires. */
export function formatPercent(rate: number | null): string {
  return rate === null ? NO_VALUE_FR : `${Math.round(rate * 100)} %`;
}

/**
 * An attendance rate that always carries its denominator: « 8/10 · 80 % » (decision 020). A rate
 * without the number of judged sessions behind it invites the reader to assume the denominator is
 * the squad, which is exactly the misreading the decision exists to prevent.
 */
export function formatAttendance(present: number, marked: number, rate: number | null): string {
  if (marked === 0) return NO_VALUE_FR;
  return `${present}/${marked} · ${formatPercent(rate)}`;
}

/**
 * What sits under an attendance rate, saying what the denominator counts — and, when a competition
 * filter is on, that this one figure is not inside it.
 *
 * A training belongs to no competition (decision 020), so the filter cannot apply to it. On the
 * « Coupe » tab that left a player's card with five dashes and one number: no matches, no minutes,
 * no goals, no assists, no rating, and « 1/2 · 50 % ». The dashes say « nothing in this selection »
 * and the rate says something — about the whole season, which the card never mentioned.
 */
export function attendanceHintFr(filtered: boolean): string {
  return filtered ? "séances pointées, toute la saison" : "séances pointées";
}

/**
 * Why that figure ignores the chip at the top of the screen. One sentence, shared by the player
 * cards and the « Présence aux entraînements » card, so the two cannot come to disagree about a rule
 * that belongs to neither of them.
 */
export const ATTENDANCE_NOT_FILTERED_FR =
  "Le filtre par compétition ne s’applique pas à la présence : un entraînement n’appartient à " +
  "aucune compétition.";

/** `+3`, `-1`, `0` — a goal difference is always signed. */
export function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

/*
 * There is deliberately no `formatScore` here. A scoreline is written by `scoreLineFr` in
 * `lib/calendar/labels.ts` and nowhere else (decision 061); this module used to have its own, with
 * a hyphen where that one has an en dash, so the stats page and the recap disagreed by a character.
 */

/** « 2 V · 1 N · 0 D » — a whole season's record in one line on a 320 px screen. */
export function formatRecord(wins: number, draws: number, losses: number): string {
  return `${wins} V · ${draws} N · ${losses} D`;
}

/** `V` / `N` / `D`, the single letter a form guide shows. */
export function resultLetterOf(result: "win" | "draw" | "loss"): "V" | "N" | "D" {
  return result === "win" ? "V" : result === "loss" ? "D" : "N";
}

/** « Victoire » / « Match nul » / « Défaite », for the accessible name of a form badge. */
export function resultLabelOf(result: "win" | "draw" | "loss"): string {
  return result === "win" ? "Victoire" : result === "loss" ? "Défaite" : "Match nul";
}

/**
 * One badge of the form guide, spelled out: « Victoire 3 – 1 contre Étoile du Parc, dim. 14/09/2026 ».
 *
 * A `V` and a scoreline is all the guide has room to print, so this is what the badge is *called* —
 * the announced name of the row, and the tooltip, which under decision 072 may only ever duplicate
 * something already announced. It used to be a `title` attribute alone, which is the one place a
 * phone cannot read: the only statement of home or away on the whole of `/stats` was hidden behind a
 * hover that does not exist, and it said « contre » about away matches anyway.
 *
 * The fixture comes in already worded, by `matchNameFr`, and the day already formatted: this joins
 * them, it does not invent a second way of saying either.
 */
export function formEntryLabelFr(input: {
  result: "win" | "draw" | "loss";
  scoreFr: string;
  fixtureFr: string;
  dayFr: string;
}): string {
  return `${resultLabelOf(input.result)} ${input.scoreFr} ${input.fixtureFr}, ${input.dayFr}`;
}

/** A plural `s` only when it is needed: « 1 match », « 3 matchs », « 1 but », « 2 buts ». */
export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${count} ${count > 1 ? many : singular}`;
}

/** « matchs » is the French form this app uses, so the invariant plural gets its own helper. */
export function matchCount(count: number): string {
  return plural(count, "match", "matchs");
}

/**
 * « 6 matchs sur la feuille · 1 fois titulaire · 5 fois remplaçant · 2 fois gardien ».
 *
 * The line under a player's figures, and the place where two numbers that look like the same number
 * are told apart. « Matchs » counts the matches he has minutes in (`aggregate.ts`, rule 3), while a
 * selection is a name on a sheet (rule 4) — an unused substitute is selected and has no appearance,
 * and a finished match nobody recorded gives nobody a minute at all (rule 7). So the sheet total is
 * routinely the larger of the two: the demo season's Karim reads « MATCHS 6 » above « 7 fois
 * titulaire », and the figure that reconciles them used to live in a `title` attribute, which on the
 * phone this app is built for is nowhere at all.
 *
 * « N fois titulaire », not « N titulaire »: seven of them is « 7 titulaires » in French, and the
 * shape with « fois » needs no agreement, reads the way a coach says it, and is what the profile
 * card already printed while `/stats` printed the ungrammatical short form.
 *
 * `withSheetTotal` is off for the profile card, whose header already says « 7 matchs sur la feuille »
 * in full width — the same sentence twice on one card is worse than none.
 */
export function appearancesLineFr(
  appearances: {
    selected: number;
    starter: number;
    substitute: number;
    supporter: number;
    goalkeeper: number;
  },
  options: { withSheetTotal?: boolean } = {},
): string | null {
  const parts: string[] = [];

  if (options.withSheetTotal === true && appearances.selected > 0) {
    parts.push(`${matchCount(appearances.selected)} sur la feuille`);
  }
  if (appearances.starter > 0) parts.push(`${appearances.starter} fois titulaire`);
  if (appearances.substitute > 0) parts.push(`${appearances.substitute} fois remplaçant`);
  if (appearances.supporter > 0) parts.push(`${appearances.supporter} fois supporter`);
  if (appearances.goalkeeper > 0) parts.push(`${appearances.goalkeeper} fois gardien`);

  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Why a player's average is short, or missing altogether.
 *
 * The profile card used to print the **season's** hidden-match count under **one player's** average:
 * « 2 matchs sont exclus de cette moyenne ». Two things were wrong with it. The count is a fact about
 * the reader's own unrated matches, so it included matches that never held a note about this player
 * and were therefore never in his average. And it said « cette moyenne » over a « — », on a profile
 * where every note received is hidden — announcing the exclusion of two matches from an average that
 * was not there.
 *
 * So the sentence takes both numbers — how many hidden matches hold a note about *this* player, and
 * how many notes the reader can actually see — and whose profile it is, because « tes notes » on one's
 * own page is the whole point of the gate. Null when there is nothing held back, in which case the
 * dash means what it says: nobody has rated him.
 *
 * The reason is always the reader's own doing — decision 007's gate, applied season-long by decision
 * 021 — which is why it is second person, on one's own profile and on somebody else's alike.
 */
export function hiddenRatingsNoteFr(
  hiddenMatches: number,
  visibleNotes: number,
  isSelf: boolean,
): string | null {
  if (hiddenMatches <= 0) return null;

  const whose = isSelf ? "Tes notes" : "Ses notes";
  const held = `${whose} sur ${matchCount(hiddenMatches)} restent cachées tant que tu n’as pas noté tes coéquipiers`;

  return visibleNotes === 0
    ? `${held} : c’est pourquoi il n’y a pas de moyenne.`
    : `${held}. La moyenne ne porte que sur les matchs que tu as notés.`;
}

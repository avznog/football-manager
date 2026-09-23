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

/** A plural `s` only when it is needed: « 1 match », « 3 matchs », « 1 but », « 2 buts ». */
export function plural(count: number, singular: string, many = `${singular}s`): string {
  return `${count} ${count > 1 ? many : singular}`;
}

/** « matchs » is the French form this app uses, so the invariant plural gets its own helper. */
export function matchCount(count: number): string {
  return plural(count, "match", "matchs");
}

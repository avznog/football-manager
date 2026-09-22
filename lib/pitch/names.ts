/**
 * Shortening player names so they fit under a 48 px disc.
 *
 * CSS truncation alone turns « Jean-Baptiste Dupont » into « Jean-Bapti… », which hides the
 * only part that identifies the player on a pitch full of discs: the surname. So we abbreviate
 * the given name(s) first and only truncate as a last resort.
 *
 * Pure and framework-free.
 */

/** The character used when a name still has to be cut. */
const ELLIPSIS = "…";

/** Collapse any run of whitespace and trim. */
function normalise(fullName: string): string {
  return fullName.replace(/\s+/g, " ").trim();
}

/**
 * Initials of one word, keeping hyphenated compounds: « Jean-Baptiste » becomes « J.-B. ».
 */
function initialsOf(word: string): string {
  return word
    .split("-")
    .filter((part) => part.length > 0)
    .map((part) => `${part[0].toLocaleUpperCase("fr-FR")}.`)
    .join("-");
}

/** Hard cut, with an ellipsis, never returning more than `maxLength` characters. */
function truncate(value: string, maxLength: number): string {
  if (maxLength <= 0) return "";
  if (value.length <= maxLength) return value;
  if (maxLength === 1) return ELLIPSIS;
  return `${value.slice(0, maxLength - 1).trimEnd()}${ELLIPSIS}`;
}

/**
 * Fit a display name into `maxLength` characters:
 *
 * 1. « Karim Benali » (short enough) stays as it is;
 * 2. « Jean-Baptiste Dupont » becomes « J.-B. Dupont »;
 * 3. « Jean-Baptiste Vandenberghelaan » becomes « J.-B. Vandenberg… ».
 *
 * The default of 14 characters is what fits under a default disc at the 320 px pitch width we
 * support; the component passes its own value per size.
 */
export function abbreviateName(fullName: string, maxLength = 14): string {
  const name = normalise(fullName);
  if (name.length === 0) return "";
  if (name.length <= maxLength) return name;

  const words = name.split(" ");
  if (words.length > 1) {
    const last = words[words.length - 1];
    const abbreviated = [...words.slice(0, -1).map(initialsOf), last].join(" ");
    if (abbreviated.length <= maxLength) return abbreviated;
    return truncate(abbreviated, maxLength);
  }

  return truncate(name, maxLength);
}

/**
 * Colour maths for kit-coloured player discs.
 *
 * The app palette is made of design tokens (`--color-turf`, `--color-ink`…) and is never
 * touched here. This module exists for the one colour the app does **not** control: a team's
 * `primary_color` / `secondary_color`, arbitrary hex strings coming from the database
 * (decision 014). A disc filled with the club's colour still has to show a legible number, so
 * the text colour is *computed*, not chosen: a team in yellow gets dark text, a team in navy
 * gets light text.
 *
 * Everything here is pure and framework-free.
 */

export type Rgb = { r: number; g: number; b: number };

/**
 * The two candidate ink colours for a disc. They are pure white and pure black on purpose —
 * see `readableInkOn` for the contrast guarantee that depends on it — and they map to the
 * `text-white` / `text-black` utilities rather than to a theme token, because a disc's fill is
 * the club's colour and does not change with the light/dark theme.
 */
const INK_LIGHT: Rgb = { r: 255, g: 255, b: 255 };
const INK_DARK: Rgb = { r: 0, g: 0, b: 0 };

/** Which of the two inks to print on a kit colour. */
export type DiscInk = "light" | "dark";

const HEX_SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const HEX_LONG = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;

/**
 * Parse `#rgb`, `#rrggbb` (with or without the `#`) into channel values. Returns `null` for
 * anything else — the database column is free text, so it can hold nonsense.
 */
export function parseHexColor(value: string): Rgb | null {
  const input = value.trim();

  const short = HEX_SHORT.exec(input);
  if (short) {
    return {
      r: Number.parseInt(short[1] + short[1], 16),
      g: Number.parseInt(short[2] + short[2], 16),
      b: Number.parseInt(short[3] + short[3], 16),
    };
  }

  const long = HEX_LONG.exec(input);
  if (long) {
    return {
      r: Number.parseInt(long[1], 16),
      g: Number.parseInt(long[2], 16),
      b: Number.parseInt(long[3], 16),
    };
  }

  return null;
}

/** Serialise back to `#rrggbb`, lowercase. */
export function toHexColor(rgb: Rgb): string {
  const channel = (value: number) =>
    Math.round(Math.min(255, Math.max(0, value)))
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb.r)}${channel(rgb.g)}${channel(rgb.b)}`;
}

/** sRGB channel (0..255) to its linear-light value, per WCAG 2.2 § relative luminance. */
function linearise(channel: number): number {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** WCAG 2.2 relative luminance, `0` for black and `1` for white. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * linearise(rgb.r) + 0.7152 * linearise(rgb.g) + 0.0722 * linearise(rgb.b)
  );
}

/** WCAG 2.2 contrast ratio between two colours, from `1` (identical) to `21` (black/white). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Pick the disc ink for a kit colour: whichever of white and black contrasts better with it.
 *
 * **Threshold.** We do not test against a fixed luminance cut-off; we compute both contrast
 * ratios and keep the larger. That is equivalent to a cut-off at a relative luminance of
 * ≈ 0.179 (where `1.05 / (L + 0.05) = (L + 0.05) / 0.05`), and it is strictly better than the
 * widely copied `luminance > 0.5` rule, which flips far too late and leaves mid-tone reds and
 * greens with white text at ~3:1.
 *
 * **Why this is enough.** The worst possible kit colour is the one sitting exactly on that
 * cut-off, and even there the winning ink still reaches ≈ 4.58:1. So *every* colour a club can
 * enter clears WCAG AA 1.4.3 for normal text (4.5:1), and clears AAA for large text (4.5:1)
 * — and the jersey number is rendered bold at 17 px or more, which is already "large text"
 * territory at 3:1. This guarantee is why the two candidates are pure white and pure black: a
 * softer near-black such as `--color-kit-ink` (`#0b1014`) would drop the worst case to ≈ 4.42:1,
 * just under AA — see the note in `components/pitch/README.md`.
 *
 * Unparseable input falls back to `"light"`, matching the dark default kit colour in the
 * schema.
 */
export function readableInkOn(color: string | Rgb): DiscInk {
  const rgb = typeof color === "string" ? parseHexColor(color) : color;
  if (!rgb) return "light";
  return contrastRatio(rgb, INK_LIGHT) >= contrastRatio(rgb, INK_DARK) ? "light" : "dark";
}

/** The contrast ratio actually achieved by `readableInkOn` for that colour. Used by tests. */
export function inkContrastOn(color: string | Rgb): number {
  const rgb = typeof color === "string" ? parseHexColor(color) : color;
  if (!rgb) return contrastRatio(INK_DARK, INK_LIGHT);
  return Math.max(contrastRatio(rgb, INK_LIGHT), contrastRatio(rgb, INK_DARK));
}

/**
 * `rgb(… / alpha)` string for a kit colour, used for the translucent fill of a ghost disc.
 * Returns `undefined` for unparseable input so the caller can fall back to a token.
 */
export function withAlpha(color: string, alpha: number): string | undefined {
  const rgb = parseHexColor(color);
  if (!rgb) return undefined;
  const a = Math.min(1, Math.max(0, alpha));
  return `rgb(${rgb.r} ${rgb.g} ${rgb.b} / ${a})`;
}

/**
 * True when two kit colours are so close that a border of the second over a fill of the first
 * would be invisible. The composition editor can use this to fall back to a token-coloured
 * outline. 1.5:1 is deliberately low: we only want to catch "white on white".
 */
export function areColorsIndistinguishable(a: string, b: string): boolean {
  const first = parseHexColor(a);
  const second = parseHexColor(b);
  if (!first || !second) return false;
  return contrastRatio(first, second) < 1.5;
}

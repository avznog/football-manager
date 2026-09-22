/**
 * Contrast helpers for CLUB colours, for the UI kit.
 *
 * Team `primaryColor` / `secondaryColor` are arbitrary hex values entered by a coach; nothing
 * guarantees they are readable. Anywhere a club colour is used as a background (avatars, team
 * header, match cards) the label colour must be chosen by measurement, not by guessing — that is
 * the whole reason the app palette stays neutral (decision 014).
 *
 * The maths lives in `lib/color.ts`, which is pure and unit-tested against a sweep of the sRGB
 * cube. This module is only the adapter that turns it into values a `style` prop can take, so
 * there is exactly one luminance implementation in the repository.
 */

import { inkContrastOn, parseHexColor, readableInkOn } from "@/lib/color";

/** The two candidate inks, pure on purpose — see `readableInkOn` for the 4.58:1 floor. */
const INK = { light: "#ffffff", dark: "#000000" } as const;

/** Parses `#rgb`, `#rrggbb`, or `rrggbb`. Returns null when unparseable. */
export function parseHex(hex: string | null | undefined) {
  return hex ? parseHexColor(hex) : null;
}

/**
 * The readable label colour to put on an arbitrary club colour, ready for a `style` prop:
 * `style={{ backgroundColor: club, color: inkOnColor(club) }}`.
 *
 * Falls back to the theme's own ink token when the colour is unusable, so an unparseable
 * database value degrades to the neutral look rather than to white-on-white.
 */
export function inkOnColor(background: string | null | undefined): string {
  if (!parseHex(background)) return "var(--color-ink)";
  return INK[readableInkOn(background as string)];
}

/** `true` when the club colour is safe to use as a text background (WCAG AA, 4.5:1). */
export function isReadableOnColor(background: string | null | undefined): boolean {
  if (!parseHex(background)) return true;
  return inkContrastOn(background as string) >= 4.5;
}

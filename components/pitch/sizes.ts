/**
 * Disc sizing, shared by `PlayerDisc`, `SlotTarget` and `PitchLayout`.
 *
 * Discs are sized in **pixels, not in pitch units**: a disc must stay a comfortable tap target
 * and its name must stay readable whether the pitch is 320 px or 640 px wide, so it does not
 * scale with the pitch.
 */

export type DiscSize = "sm" | "md" | "lg";

export type DiscMetrics = {
  /** Diameter of the disc, in pixels. */
  diameter: number;
  /** Font size of the jersey number / position code, in pixels. */
  glyph: number;
  /** Font size of the name beneath, in pixels. */
  name: number;
  /** Maximum width of the name chip, in pixels. */
  nameWidth: number;
  /** Characters the name is abbreviated to before CSS truncation takes over. */
  nameChars: number;
};

/**
 * `md` is the default and is 48 px — above the 44 px minimum tap target, and the size the
 * formation coordinates in `db/reference.ts` are spaced for.
 *
 * `sm` is 40 px and is **below** that minimum: use it for read-only pitches (a player's profile
 * summary, a match recap), never as a drop target or a button.
 */
export const DISC_SIZES: Record<DiscSize, DiscMetrics> = {
  sm: { diameter: 40, glyph: 15, name: 10, nameWidth: 72, nameChars: 11 },
  md: { diameter: 48, glyph: 18, name: 11, nameWidth: 88, nameChars: 14 },
  lg: { diameter: 60, glyph: 22, name: 12, nameWidth: 108, nameChars: 18 },
};

export const DEFAULT_DISC_SIZE: DiscSize = "md";

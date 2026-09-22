/**
 * Pure geometry for the turf pitch.
 *
 * ## The pitch coordinate space (the one thing to remember)
 *
 * Every position, formation slot and rendered marker is expressed as two **integers in
 * `0..1000`** (permille — integers on purpose, so coordinates never drift through repeated
 * float maths and compare exactly in tests and in SQL).
 *
 * The pitch is always drawn **vertically**, from our own goal at the bottom to the opponent's
 * goal at the top:
 *
 * ```
 *                 y = 1000  ── opponent's goal line (we attack upwards)
 *   x = 0 |                                             | x = 1000
 *   left  |                 y = 500 halfway             | right
 *   touch |                                             | touch
 *                 y = 0     ── our own goal line
 * ```
 *
 * So the goalkeeper sits near `y = 60` and the striker near `y = 850`.
 *
 * ## The two render spaces
 *
 * 1. **SVG units** — used by `Pitch` for the markings. The playing area is
 *    `PLAY_WIDTH x PLAY_LENGTH` = 1000 x 1500 units (a 40 m x 60 m seven-a-side pitch, so
 *    1 unit = 4 cm, `METER` = 25 units), surrounded by a `PITCH_MARGIN` of turf so the goals
 *    and the boundary lines are not clipped. The resulting `viewBox` is
 *    `VIEW_WIDTH x VIEW_HEIGHT`.
 * 2. **Percentages of that same viewBox** — used to absolutely position the HTML markers
 *    (discs, slots) on top of the SVG. Discs are HTML, not SVG, so that names truncate with
 *    CSS, tap targets stay a constant number of pixels whatever the pitch size, and focus
 *    rings look native.
 *
 * Both spaces come from the same constants, which is why the markers land exactly on the
 * markings. Use `toSvgPoint` inside the SVG and `toPercentPoint` for the HTML overlay; never
 * open-code the conversion.
 */

/** Smallest valid coordinate on either axis. */
export const PITCH_MIN = 0;
/** Largest valid coordinate on either axis. */
export const PITCH_MAX = 1000;

/** One metre, in SVG units. The playing area is 40 m x 60 m. */
export const METER = 25;

/** Width of the playing area in SVG units (40 m). */
export const PLAY_WIDTH = 1000;
/** Length of the playing area in SVG units (60 m). Vertical pitch, so this is the y axis. */
export const PLAY_LENGTH = 1500;

/** Turf drawn outside the touchlines, in SVG units (1.6 m). Leaves room for the goals. */
export const PITCH_MARGIN = 40;

/** `viewBox` width of the whole pitch graphic. */
export const VIEW_WIDTH = PLAY_WIDTH + 2 * PITCH_MARGIN;
/** `viewBox` height of the whole pitch graphic. */
export const VIEW_HEIGHT = PLAY_LENGTH + 2 * PITCH_MARGIN;

/** SVG units per unit of pitch `y`. The pitch is longer than it is wide, hence 1.5. */
export const Y_SCALE = PLAY_LENGTH / PITCH_MAX;
/** SVG units per unit of pitch `x`. 1 by construction, kept explicit for symmetry. */
export const X_SCALE = PLAY_WIDTH / PITCH_MAX;

export type PitchPoint = {
  /** 0 = left touchline, 1000 = right touchline. */
  x: number;
  /** 0 = our own goal line, 1000 = the opponent's goal line. */
  y: number;
};

/** A DOM rectangle, as plain numbers so this module stays free of browser types. */
export type Box = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Clamp a number into `[min, max]`. */
function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Clamp a point into the playing area, keeping it an integer pair. */
export function clampToPitch(point: PitchPoint): PitchPoint {
  return {
    x: Math.round(clamp(point.x, PITCH_MIN, PITCH_MAX)),
    y: Math.round(clamp(point.y, PITCH_MIN, PITCH_MAX)),
  };
}

/** True when both coordinates are integers inside `0..1000`. */
export function isValidPitchPoint(point: PitchPoint): boolean {
  return (
    Number.isInteger(point.x) &&
    Number.isInteger(point.y) &&
    point.x >= PITCH_MIN &&
    point.x <= PITCH_MAX &&
    point.y >= PITCH_MIN &&
    point.y <= PITCH_MAX
  );
}

/**
 * Pitch space to SVG `viewBox` units. Note the y flip: pitch y grows towards the opponent,
 * SVG y grows downwards.
 */
export function toSvgPoint(point: PitchPoint): { x: number; y: number } {
  return {
    x: PITCH_MARGIN + point.x * X_SCALE,
    y: PITCH_MARGIN + (PITCH_MAX - point.y) * Y_SCALE,
  };
}

/**
 * Pitch space to percentages of the pitch graphic's box, for absolutely positioned HTML
 * markers. Returned values are percentages (`0..100`), not ratios.
 */
export function toPercentPoint(point: PitchPoint): { left: number; top: number } {
  const svg = toSvgPoint(point);
  return {
    left: (svg.x / VIEW_WIDTH) * 100,
    top: (svg.y / VIEW_HEIGHT) * 100,
  };
}

/**
 * Screen coordinates back to pitch space — the conversion a drag-and-drop editor needs.
 * `box` is the bounding rectangle of the pitch graphic (`getBoundingClientRect()`), and the
 * result is always a clamped integer point, so a drop just outside the touchline still lands
 * on the pitch.
 */
export function fromClientPoint(client: { x: number; y: number }, box: Box): PitchPoint {
  if (box.width <= 0 || box.height <= 0) return { x: 0, y: 0 };
  const svgX = ((client.x - box.left) / box.width) * VIEW_WIDTH;
  const svgY = ((client.y - box.top) / box.height) * VIEW_HEIGHT;
  return clampToPitch({
    x: (svgX - PITCH_MARGIN) / X_SCALE,
    y: PITCH_MAX - (svgY - PITCH_MARGIN) / Y_SCALE,
  });
}

/**
 * Distance between two pitch points, **expressed in units of pitch width** (i.e. permille of
 * the touchline-to-touchline distance).
 *
 * Plain Euclidean distance on the raw coordinates would lie: the pitch is 1.5 times longer
 * than it is wide, so 100 units of `y` cover 1.5 times more ground — and 1.5 times more
 * screen — than 100 units of `x`. Correcting by `Y_SCALE` makes the result proportional to
 * what the eye sees, which is what the "discs must not overlap" rule needs.
 */
export function pitchDistance(a: PitchPoint, b: PitchPoint): number {
  const dx = (a.x - b.x) * X_SCALE;
  const dy = (a.y - b.y) * Y_SCALE;
  return Math.hypot(dx, dy);
}

/**
 * Minimum acceptable `pitchDistance` between two markers on the same pitch.
 *
 * Reasoning, at the worst case we support — a 320 px wide phone: the pitch graphic is 320 px
 * wide, of which the playing area is `PLAY_WIDTH / VIEW_WIDTH` ≈ 92.6 %, so 1 unit of pitch
 * width ≈ 0.296 px. A default disc is 48 px across ≈ 162 units, so two touching discs sit
 * 162 units apart. Rounding up and adding roughly 10 px of breathing room gives 195.
 */
export const MIN_MARKER_DISTANCE = 195;

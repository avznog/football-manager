/**
 * Reference data: the seven-a-side position vocabulary and the built-in formation templates.
 *
 * This is the typed source of truth that `db/seed.ts` inserts into `positions`, `formations`
 * (with `teamId = null`, i.e. shared by every team) and `formation_slots`. It is deliberately a
 * plain module with no database import, so the UI can read it directly — the position picker on
 * a player's profile needs the French labels and the canonical coordinates without a round
 * trip. See decision 005 and the "Positions and formations" section of `docs/DATA_MODEL.md`.
 *
 * ## Coordinate system
 *
 * `defaultX` / `defaultY` on a position, and `x` / `y` on a formation slot, are **integers in
 * `0..1000`** (permille — integers so that coordinates never drift through float maths and
 * compare exactly in tests and in SQL). The pitch is always drawn **vertically**:
 *
 * ```
 *   y = 1000  ── the opponent's goal line (we always attack upwards)
 *   y =  500  ── the halfway line
 *   y =    0  ── our own goal line
 *   x =    0  ── left touchline        x = 1000 ── right touchline
 * ```
 *
 * The goalkeeper therefore sits near `y = 60` and the striker near `y = 850`. `lib/pitch/
 * geometry.ts` converts this space to SVG units and to percentages; never open-code it.
 *
 * ## How a formation `label` is built
 *
 * `label` counts players from the back, and **the leading `1` is the goalkeeper**: `1-3-2-1` is
 * GB + 3 defenders + 2 midfielders + 1 forward = 7 players. The four groups are exactly the
 * four `line` values, in the order `GB`, `DEF`, `MIL`, `ATT`, so the label is derivable from
 * the slots — `formationLabelOf()` does it, and `db/reference.test.ts` asserts that every
 * template's declared label matches its slots. A line with nobody in it is still printed, hence
 * `1-3-3-0`: three at the back, three in midfield, no out-and-out striker.
 *
 * Note that a `positionCode` may legitimately appear twice in one formation — two centre-backs
 * are both `DC`, a double pivot is two `MC` — exactly as in eleven-a-side notation.
 */

import type { PositionLine } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Positions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The whole seven-a-side vocabulary, and nothing else. This list is closed: a player's
 * preferences reference these codes, which is what makes "Julien wants to play AT" meaningful
 * across every formation (decision 005).
 */
export const POSITION_CODES = [
  "GB",
  "DG",
  "DC",
  "DD",
  "MG",
  "MC",
  "MD",
  "MOC",
  "AG",
  "AT",
  "AD",
] as const;

export type PositionCode = (typeof POSITION_CODES)[number];

export type PositionDefinition = {
  code: PositionCode;
  /** Full French name, properly accented. Shown in tooltips and accessible labels. */
  labelFr: string;
  line: PositionLine;
  /** Canonical spot on the pitch, 0..1000. Used by the position picker and as a slot default. */
  defaultX: number;
  defaultY: number;
  /** Display order: goalkeeper first, then back to front, left to right. Unique. */
  sort: number;
};

/**
 * The canonical spot of each position. These eleven points are shown **all at once** by the
 * position picker, so they are spaced for a 48 px target on a 320 px wide pitch: the closest
 * pair (`MC` and `MOC`) is 240 units apart once corrected for the pitch's aspect ratio, which
 * is about 71 px there — see `MIN_MARKER_DISTANCE` in `lib/pitch/geometry.ts`.
 */
export const POSITIONS: readonly PositionDefinition[] = [
  { code: "GB", labelFr: "Gardien de but", line: "GB", defaultX: 500, defaultY: 60, sort: 1 },
  { code: "DG", labelFr: "Défenseur gauche", line: "DEF", defaultX: 190, defaultY: 250, sort: 2 },
  { code: "DC", labelFr: "Défenseur central", line: "DEF", defaultX: 500, defaultY: 250, sort: 3 },
  { code: "DD", labelFr: "Défenseur droit", line: "DEF", defaultX: 810, defaultY: 250, sort: 4 },
  { code: "MG", labelFr: "Milieu gauche", line: "MIL", defaultX: 190, defaultY: 500, sort: 5 },
  { code: "MC", labelFr: "Milieu central", line: "MIL", defaultX: 500, defaultY: 500, sort: 6 },
  { code: "MD", labelFr: "Milieu droit", line: "MIL", defaultX: 810, defaultY: 500, sort: 7 },
  {
    code: "MOC",
    labelFr: "Milieu offensif central",
    line: "MIL",
    defaultX: 500,
    defaultY: 660,
    sort: 8,
  },
  { code: "AG", labelFr: "Ailier gauche", line: "ATT", defaultX: 200, defaultY: 850, sort: 9 },
  { code: "AT", labelFr: "Attaquant", line: "ATT", defaultX: 500, defaultY: 880, sort: 10 },
  { code: "AD", labelFr: "Ailier droit", line: "ATT", defaultX: 800, defaultY: 850, sort: 11 },
];

/** Lookup by code. */
export const POSITION_BY_CODE = Object.fromEntries(
  POSITIONS.map((position) => [position.code, position]),
) as Record<PositionCode, PositionDefinition>;

/** French name of the four lines, for group headings and accessible labels. */
export const LINE_LABELS_FR: Record<PositionLine, string> = {
  GB: "Gardien",
  DEF: "Défense",
  MIL: "Milieu",
  ATT: "Attaque",
};

/** The order the lines are printed in a formation label: back to front. */
export const LINE_ORDER: readonly PositionLine[] = ["GB", "DEF", "MIL", "ATT"];

/** Narrow an arbitrary string to a known position code. */
export function isPositionCode(value: string): value is PositionCode {
  return (POSITION_CODES as readonly string[]).includes(value);
}

/** The full French name of a position, or the raw code if it is unknown. */
export function positionLabelFr(code: string): string {
  return isPositionCode(code) ? POSITION_BY_CODE[code].labelFr : code;
}

/* -------------------------------------------------------------------------- */
/* Formation templates                                                        */
/* -------------------------------------------------------------------------- */

export type FormationSlotTemplate = {
  positionCode: PositionCode;
  /** 0..1000, left to right. */
  x: number;
  /** 0..1000, our goal line to the opponent's. */
  y: number;
  /** 1..7, goalkeeper first then back to front, left to right. Unique within the formation. */
  sort: number;
};

export type FormationTemplate = {
  /** French human name, e.g. « Classique 1-3-2-1 ». */
  name: string;
  /** e.g. `1-3-2-1`. Unique among the built-ins, so the seed can be idempotent on it. */
  label: string;
  /** One line of French explaining when a coach would pick this shape. */
  descriptionFr: string;
  /** Exactly 7, exactly one of them `GB`. */
  slots: readonly FormationSlotTemplate[];
};

/**
 * The built-in templates (`formations.team_id = null`, shared by every team). A coach can still
 * create a team-specific formation by dragging the slots — decision 005.
 *
 * Coordinates follow four bands: goalkeeper ≈ 60, defence ≈ 240, midfield ≈ 500, attack ≈ 840,
 * with the left/centre/right columns at ≈ 180 / 500 / 820. Every shape is symmetric about
 * `x = 500` and every pair of slots is comfortably beyond `MIN_MARKER_DISTANCE`, so seven 48 px
 * discs never collide on a 320 px screen. Both invariants are enforced by
 * `db/reference.test.ts`.
 */
export const BUILTIN_FORMATIONS: readonly FormationTemplate[] = [
  {
    name: "Classique 1-3-2-1",
    label: "1-3-2-1",
    descriptionFr: "La valeur sûre du football à 7 : une défense à trois et un double pivot.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DG", x: 170, y: 250, sort: 2 },
      { positionCode: "DC", x: 500, y: 240, sort: 3 },
      { positionCode: "DD", x: 830, y: 250, sort: 4 },
      { positionCode: "MC", x: 330, y: 520, sort: 5 },
      { positionCode: "MC", x: 670, y: 520, sort: 6 },
      { positionCode: "AT", x: 500, y: 830, sort: 7 },
    ],
  },
  {
    name: "Milieu à trois 1-2-3-1",
    label: "1-2-3-1",
    descriptionFr:
      "Deux défenseurs centraux et un milieu à trois : la meilleure occupation du terrain.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DC", x: 330, y: 240, sort: 2 },
      { positionCode: "DC", x: 670, y: 240, sort: 3 },
      { positionCode: "MG", x: 160, y: 520, sort: 4 },
      { positionCode: "MC", x: 500, y: 500, sort: 5 },
      { positionCode: "MD", x: 840, y: 520, sort: 6 },
      { positionCode: "AT", x: 500, y: 830, sort: 7 },
    ],
  },
  {
    name: "Deux attaquants 1-3-1-2",
    label: "1-3-1-2",
    descriptionFr: "Défense à trois, un seul relayeur, deux attaquants pour presser haut.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DG", x: 170, y: 250, sort: 2 },
      { positionCode: "DC", x: 500, y: 240, sort: 3 },
      { positionCode: "DD", x: 830, y: 250, sort: 4 },
      { positionCode: "MC", x: 500, y: 510, sort: 5 },
      { positionCode: "AT", x: 330, y: 840, sort: 6 },
      { positionCode: "AT", x: 670, y: 840, sort: 7 },
    ],
  },
  {
    name: "Carré 1-2-2-2",
    label: "1-2-2-2",
    descriptionFr: "Deux par ligne : simple à expliquer, très lisible pour une équipe qui débute.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DC", x: 320, y: 240, sort: 2 },
      { positionCode: "DC", x: 680, y: 240, sort: 3 },
      { positionCode: "MG", x: 250, y: 510, sort: 4 },
      { positionCode: "MD", x: 750, y: 510, sort: 5 },
      { positionCode: "AT", x: 330, y: 840, sort: 6 },
      { positionCode: "AT", x: 670, y: 840, sort: 7 },
    ],
  },
  {
    name: "Libéro 1-1-3-2",
    label: "1-1-3-2",
    descriptionFr: "Un seul défenseur axial derrière un milieu à trois : offensif et exigeant.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DC", x: 500, y: 220, sort: 2 },
      { positionCode: "MG", x: 170, y: 480, sort: 3 },
      { positionCode: "MC", x: 500, y: 470, sort: 4 },
      { positionCode: "MD", x: 830, y: 480, sort: 5 },
      { positionCode: "AT", x: 330, y: 830, sort: 6 },
      { positionCode: "AT", x: 670, y: 830, sort: 7 },
    ],
  },
  {
    name: "Sans avant-centre 1-3-3-0",
    label: "1-3-3-0",
    descriptionFr:
      "Trois derrière, trois devant dont un meneur : on conserve le ballon sans pointe fixe.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DG", x: 170, y: 250, sort: 2 },
      { positionCode: "DC", x: 500, y: 240, sort: 3 },
      { positionCode: "DD", x: 830, y: 250, sort: 4 },
      { positionCode: "MG", x: 200, y: 560, sort: 5 },
      { positionCode: "MOC", x: 500, y: 640, sort: 6 },
      { positionCode: "MD", x: 800, y: 560, sort: 7 },
    ],
  },
  {
    name: "Offensif 1-2-1-3",
    label: "1-2-1-3",
    descriptionFr: "Trois devant avec deux ailiers : pour aller chercher un but en fin de match.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DC", x: 320, y: 240, sort: 2 },
      { positionCode: "DC", x: 680, y: 240, sort: 3 },
      { positionCode: "MC", x: 500, y: 500, sort: 4 },
      { positionCode: "AG", x: 180, y: 800, sort: 5 },
      { positionCode: "AT", x: 500, y: 860, sort: 6 },
      { positionCode: "AD", x: 820, y: 800, sort: 7 },
    ],
  },
];

/** The number of players in a seven-a-side formation. */
export const FORMATION_SLOT_COUNT = 7;

/** How many slots each line holds, in label order. */
export function formationDistribution(
  slots: readonly Pick<FormationSlotTemplate, "positionCode">[],
): Record<PositionLine, number> {
  const counts: Record<PositionLine, number> = { GB: 0, DEF: 0, MIL: 0, ATT: 0 };
  for (const slot of slots) {
    const position = POSITION_BY_CODE[slot.positionCode];
    if (position) counts[position.line] += 1;
  }
  return counts;
}

/** Rebuild the `1-3-2-1` style label from the slots themselves. */
export function formationLabelOf(
  slots: readonly Pick<FormationSlotTemplate, "positionCode">[],
): string {
  const counts = formationDistribution(slots);
  return LINE_ORDER.map((line) => counts[line]).join("-");
}

/** A built-in template by label, e.g. `"1-3-2-1"`. */
export function formationByLabel(label: string): FormationTemplate | undefined {
  return BUILTIN_FORMATIONS.find((formation) => formation.label === label);
}

/** The template a coach gets by default when planning a composition. */
export const DEFAULT_FORMATION_LABEL = "1-3-2-1";

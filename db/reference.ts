/**
 * Reference data: the seven-a-side position vocabulary and the one formation the team plays.
 *
 * This is the typed source of truth that `db/seed.ts` inserts into `positions`, `formations`
 * (with `teamId = null`, i.e. shared by every team) and `formation_slots`. It is deliberately a
 * plain module with no database import, so the UI can read it directly — the position picker on
 * a player's profile needs the French labels and the canonical coordinates without a round
 * trip. See decisions 005 and 157, and the "Positions and formations" section of
 * `docs/DATA_MODEL.md`.
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
 * `label` counts players from the back, and **the leading `1` is the goalkeeper**: `1-2-3-1` is
 * GB + 2 defenders + 3 midfielders + 1 forward = 7 players. The four groups are exactly the
 * four `line` values, in the order `GB`, `DEF`, `MIL`, `ATT`, so the label is derivable from
 * the slots — `formationLabelOf()` does it, and `db/reference.test.ts` asserts that the
 * template's declared label matches its slots.
 *
 * Note that a `positionCode` appears twice in the formation — the two centre-backs are both `DC`,
 * the two wingers are both `AIL` — exactly as in eleven-a-side notation.
 */

import type { PositionLine } from "@/db/schema";

/* -------------------------------------------------------------------------- */
/* Positions                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The whole seven-a-side vocabulary, and nothing else: **the five posts of the one formation the
 * team plays** (decision 157). This list is closed: a player's preferences reference these codes,
 * which is what makes "Julien wants to play AT" meaningful (decision 005).
 *
 * It used to be eleven codes — left and right defenders, left and right midfielders, a `MOC`, two
 * wingers on the attacking line — because the editor let a coach draw any shape and every shape
 * needed a word for every spot. There is one shape now, `1-2-3-1`, and it needs exactly five words:
 * the owner's « 1 (GK), 2 (DC × 2), 3 (MC, et les deux ailiers sans faire de différence), 1 (BU) ».
 *
 * The retired codes (`DG`, `DD`, `MG`, `MD`, `MOC`, `AG`, `AD`) keep their rows in `positions`,
 * because the retired built-in formations keep their slots (an old `lineups.formation_id` may point
 * at one) and those slots reference `positions.code`. They are simply not this app's vocabulary any
 * more: nothing offers them, and `POSITION_BY_CODE` answers `undefined` for them, which every reader
 * already handles — it is typed `Partial` for exactly that reason.
 *
 * It is also the list a player's wishes are picked from. That used to be a second, narrower list
 * (`PREFERRED_POSITION_CODES`, decisions 141 and 142); with five codes there is nothing left to narrow,
 * so every position is a wish and the two lists are one (decision 158).
 */
export const POSITION_CODES = ["GB", "DC", "MC", "AIL", "AT"] as const;

export type PositionCode = (typeof POSITION_CODES)[number];

export type PositionDefinition = {
  code: PositionCode;
  /** Full French name, properly accented. Shown in accessible labels and summaries. */
  labelFr: string;
  line: PositionLine;
  /** Canonical spot on the pitch, 0..1000. Where the position picker draws it. */
  defaultX: number;
  defaultY: number;
  /** Display order: goalkeeper first, then back to front. Unique. */
  sort: number;
};

/**
 * The five positions, each with a canonical spot. The spot is seeded into `positions.default_x/y` and
 * is no longer what the preference picker draws: since decision 173 the picker draws the seven slots of
 * `THE_FORMATION`, and the two `DC` discs (and the two `AIL` discs) are one wish, cycled together.
 *
 * `AIL` is **one** position with **two** slots in the formation, left and right of the midfield line,
 * and the owner was explicit that the two are not to be told apart. Its line is therefore `MIL`, the
 * line those two slots are drawn on (and the line `MG`/`MD` were on before them), which is what keeps
 * `formationLabelOf` reading `1-2-3-1` off the slots. Its canonical spot is the left one. It sorts after
 * `MC` — the middle first, then the wings either side of it.
 *
 * Spaced so that no two 48 px targets touch on a 320 px wide pitch (`MIN_MARKER_DISTANCE` in
 * `lib/pitch/geometry.ts`, held by `db/reference.test.ts`).
 */
export const POSITIONS: readonly PositionDefinition[] = [
  { code: "GB", labelFr: "Gardien de but", line: "GB", defaultX: 500, defaultY: 60, sort: 1 },
  { code: "DC", labelFr: "Défenseur central", line: "DEF", defaultX: 500, defaultY: 250, sort: 2 },
  { code: "MC", labelFr: "Milieu central", line: "MIL", defaultX: 500, defaultY: 500, sort: 3 },
  { code: "AIL", labelFr: "Ailier", line: "MIL", defaultX: 180, defaultY: 520, sort: 4 },
  { code: "AT", labelFr: "Attaquant", line: "ATT", defaultX: 500, defaultY: 850, sort: 5 },
];

/**
 * Lookup by code.
 *
 * The type is `Partial<Record<...>>` and not `Record<PositionCode, PositionDefinition>`: the
 * object is built from an `Object.fromEntries` whose key type the compiler cannot verify, and the
 * codes that reach this lookup come from `player_positions.code` and `formation_slots.position_code`,
 * `text` columns that reference `positions.code` rather than this closed list. A row holding a code
 * this module does not know is therefore possible — every slot of a retired formation is one — and
 * the old cast turned it into `TypeError: Cannot read properties of undefined` at the first `.sort`
 * or `.labelFr` — which could 500 a player's profile, `/moi`, `/equipe` and the composition editor
 * from a single bad row.
 *
 * Not `Record<string, PositionDefinition | undefined>`, which would make the values honest but let
 * `POSITION_BY_CODE["LIBERO"]` type-check and lose key checking entirely — one unsoundness traded
 * for another. `Partial<Record<PositionCode, …>>` keeps the keys closed *and* the values optional,
 * so the churn it causes is the point: the compiler enumerates every reader for us, instead of a
 * human hand-listing them and missing one.
 */
export const POSITION_BY_CODE: Partial<Record<PositionCode, PositionDefinition>> =
  Object.fromEntries(POSITIONS.map((position) => [position.code, position]));

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
  return POSITION_BY_CODE[code as PositionCode]?.labelFr ?? code;
}

/**
 * Display rank of a position; an unknown code sorts after every known one.
 *
 * `Number.MAX_SAFE_INTEGER` and not `Infinity`, reusing the rule `orderShape` in
 * `lib/formation/shape.ts` already settled on rather than inventing a second one: `Infinity -
 * Infinity` is `NaN`, a comparator returning `NaN` leaves the order implementation-defined, and two
 * unknown codes among one player's rows would then make `sortPreferredPositions` non-deterministic —
 * which would make `positionsSignature` unstable and remount the profile editor at random.
 */
export function positionRankOf(code: string): number {
  return POSITION_BY_CODE[code as PositionCode]?.sort ?? Number.MAX_SAFE_INTEGER;
}

/**
 * « au poste de gardien de but », but « au poste d’attaquant ».
 *
 * French elides `de` before a vowel, and two of the five positions start with one — attaquant and
 * ailier. Screen readers speak these announcements out loud, so the app either gets the elision
 * right or sounds like a robot every time a winger is placed.
 */
export function atPositionFr(code: string): string {
  const name = positionLabelFr(code).toLocaleLowerCase("fr-FR");
  return /^[aeiouyéèêàâîïôöûü]/.test(name) ? `au poste d’${name}` : `au poste de ${name}`;
}

/* -------------------------------------------------------------------------- */
/* The formation                                                              */
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
  /** French human name, e.g. « Milieu à trois 1-2-3-1 ». */
  name: string;
  /** e.g. `1-2-3-1`. Unique among the built-ins, so the seed can be idempotent on it. */
  label: string;
  /** One line of French describing the shape. */
  descriptionFr: string;
  /** Exactly 7, exactly one of them `GB`. */
  slots: readonly FormationSlotTemplate[];
};

/**
 * The built-in templates (`formations.team_id = null`, shared by every team) — **one of them**, and
 * that is the rule rather than a starting point (decision 157). The coach no longer picks a shape nor
 * draws one: every composition, every game-mode pitch and the équipe type stand on this `1-2-3-1`.
 *
 * The six other templates the app used to ship (`1-3-2-1`, `1-3-1-2`, `1-2-2-2`, `1-1-3-2`, `1-3-3-0`,
 * `1-2-1-3`) still exist as rows — `0009_seed_formations.sql` writes them on a fresh database, and an
 * old `lineups.formation_id` may point at one — but they are not listed here, so the seeder no longer
 * maintains them and nothing in the app offers them.
 *
 * The two side slots of the midfield line were `MG` and `MD`; they are both `AIL` now, at the same
 * coordinates, rewritten in place by the migration that introduced the code so that every match
 * already played on them reads « Ailier » too. Symmetric about `x = 500`, and every pair of slots is
 * comfortably beyond `MIN_MARKER_DISTANCE`, so seven 48 px discs never collide on a 320 px screen.
 * Both invariants are enforced by `db/reference.test.ts`. `scripts/import-radarlocal.mts` finds the
 * two wingers and the two centre-backs by their `x`, so those four numbers are load-bearing.
 */
export const BUILTIN_FORMATIONS: readonly FormationTemplate[] = [
  {
    name: "Milieu à trois 1-2-3-1",
    label: "1-2-3-1",
    descriptionFr:
      "Deux défenseurs centraux, un milieu axial entre deux ailiers, et un attaquant.",
    slots: [
      { positionCode: "GB", x: 500, y: 60, sort: 1 },
      { positionCode: "DC", x: 330, y: 240, sort: 2 },
      { positionCode: "DC", x: 670, y: 240, sort: 3 },
      { positionCode: "AIL", x: 160, y: 520, sort: 4 },
      { positionCode: "MC", x: 500, y: 500, sort: 5 },
      { positionCode: "AIL", x: 840, y: 520, sort: 6 },
      { positionCode: "AT", x: 500, y: 830, sort: 7 },
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

/** Rebuild the `1-2-3-1` style label from the slots themselves. */
export function formationLabelOf(
  slots: readonly Pick<FormationSlotTemplate, "positionCode">[],
): string {
  const counts = formationDistribution(slots);
  return LINE_ORDER.map((line) => counts[line]).join("-");
}

/** A built-in template by label, e.g. `"1-2-3-1"`. */
export function formationByLabel(label: string): FormationTemplate | undefined {
  return BUILTIN_FORMATIONS.find((formation) => formation.label === label);
}

/** The label of the one formation every composition stands on (decision 157). */
export const DEFAULT_FORMATION_LABEL = "1-2-3-1";

/** The one formation's template. `BUILTIN_FORMATIONS` holds exactly it. */
export const THE_FORMATION: FormationTemplate = BUILTIN_FORMATIONS[0];

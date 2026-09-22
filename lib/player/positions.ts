/**
 * Preferred positions: the bridge between the `player_positions` rows and the selection the
 * picker is controlled by, plus the French wording used in lists and accessible names.
 *
 * **Pure** — no database, no React. The division of labour with `lib/pitch/preferences.ts` is
 * deliberate: that module owns the *tap cycle* (non souhaité → secondaire → principal) and this
 * one owns the *storage shape* and the words. Neither invents a second rule.
 *
 * At most one `primary` per member (`docs/DATA_MODEL.md`). That invariant is enforced here, on
 * the way into the database, as well as by the picker on the way out.
 */

import { POSITIONS, POSITION_BY_CODE, isPositionCode, type PositionCode } from "@/db/reference";
import type { PositionPreference, PositionSelection } from "@/lib/pitch/preferences";

/** One `player_positions` row, as the UI reads it. */
export type PreferredPosition = {
  code: PositionCode;
  preference: PositionPreference;
};

/** Display rank of a position: goalkeeper first, then back to front (`POSITIONS.sort`). */
function rankOf(code: PositionCode): number {
  return POSITION_BY_CODE[code].sort;
}

/**
 * Canonical order for a player's positions: the primary first, then the secondaries back to
 * front. Returns a new array — the input may come straight from a query result.
 */
export function sortPreferredPositions(
  positions: readonly PreferredPosition[],
): PreferredPosition[] {
  return [...positions].sort((a, b) => {
    const byPreference =
      (a.preference === "primary" ? 0 : 1) - (b.preference === "primary" ? 0 : 1);
    return byPreference !== 0 ? byPreference : rankOf(a.code) - rankOf(b.code);
  });
}

/**
 * Rows → the picker's controlled value. Unknown codes are dropped rather than trusted: the
 * column is `text` referencing `positions.code`, so reference data could in principle outrun
 * the closed list in `db/reference.ts`.
 */
export function toSelection(
  positions: readonly { code: string; preference: PositionPreference }[],
): PositionSelection {
  const selection: PositionSelection = {};
  let primaryTaken = false;

  for (const row of sortPreferredPositions(
    positions.filter((row): row is PreferredPosition => isPositionCode(row.code)),
  )) {
    if (row.preference === "primary") {
      // Defensive: two primaries in the database would be a broken invariant, not a UI state.
      selection[row.code] = primaryTaken ? "secondary" : "primary";
      primaryTaken = true;
    } else {
      selection[row.code] = "secondary";
    }
  }

  return selection;
}

/** The picker's value → rows, in canonical order. */
export function fromSelection(selection: PositionSelection): PreferredPosition[] {
  const positions: PreferredPosition[] = [];
  for (const position of POSITIONS) {
    const preference = selection[position.code];
    if (preference) positions.push({ code: position.code, preference });
  }
  return sortPreferredPositions(positions);
}

/**
 * The rows a submitted form should produce: at most one primary, no duplicate, and a code
 * submitted as both primary and secondary counted once, as primary.
 *
 * The form posts one `primary` field and N `secondary` fields, which is what makes the picker
 * persist through an ordinary `<form>` rather than a JSON body.
 */
export function toPositionRows(
  primary: PositionCode | null,
  secondary: readonly PositionCode[],
): PreferredPosition[] {
  const selection: PositionSelection = {};
  for (const code of secondary) selection[code] = "secondary";
  if (primary) selection[primary] = "primary";
  return fromSelection(selection);
}

/** The primary position, if the player picked one. */
export function primaryCodeOf(
  positions: readonly PreferredPosition[],
): PositionCode | undefined {
  return positions.find((position) => position.preference === "primary")?.code;
}

/** Every secondary position, back to front. */
export function secondaryCodesOf(positions: readonly PreferredPosition[]): PositionCode[] {
  return sortPreferredPositions(positions)
    .filter((position) => position.preference === "secondary")
    .map((position) => position.code);
}

/**
 * A stable signature of a player's wishes. The profile page keys the client editor on it, so a
 * save (or somebody else's save) resets the local state instead of leaving it stale.
 */
export function positionsSignature(positions: readonly PreferredPosition[]): string {
  return sortPreferredPositions(positions)
    .map((position) => `${position.code}:${position.preference}`)
    .join("|");
}

/** True when two selections describe exactly the same wishes. */
export function selectionsEqual(a: PositionSelection, b: PositionSelection): boolean {
  return positionsSignature(fromSelection(a)) === positionsSignature(fromSelection(b));
}

/**
 * The full French sentence, for an accessible name or a tooltip — the squad row itself only has
 * space for the codes.
 */
export function positionsSummaryFr(positions: readonly PreferredPosition[]): string {
  const primary = primaryCodeOf(positions);
  const secondary = secondaryCodesOf(positions);
  const parts: string[] = [];

  if (primary) {
    parts.push(`Poste principal : ${POSITION_BY_CODE[primary].labelFr}`);
  }
  if (secondary.length === 1) {
    parts.push(`poste secondaire : ${POSITION_BY_CODE[secondary[0]].labelFr}`);
  } else if (secondary.length > 1) {
    parts.push(
      `postes secondaires : ${secondary.map((code) => POSITION_BY_CODE[code].labelFr).join(", ")}`,
    );
  }

  if (parts.length === 0) return "Aucun poste préféré indiqué";
  // Only the first part carries a capital, whichever part that turns out to be.
  return [parts[0].charAt(0).toUpperCase() + parts[0].slice(1), ...parts.slice(1)].join(" · ");
}

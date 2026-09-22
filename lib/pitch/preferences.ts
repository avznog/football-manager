/**
 * The tri-state logic behind the position picker on a player's profile.
 *
 * A player taps a position on the pitch diagram and it cycles
 * **non souhaité → secondaire → principal → non souhaité**, which maps onto
 * `player_positions`: no row, a row with `preference = 'secondary'`, a row with
 * `preference = 'primary'`.
 *
 * Pure: the component owns no state, the caller owns the selection and persists it.
 */

import type { PositionCode } from "@/db/reference";

/** Mirrors the `position_preference` enum in `db/schema.ts`. */
export type PositionPreference = "primary" | "secondary";

/**
 * A player's wishes, keyed by position code. A missing key means "not wanted", which is exactly
 * how it is stored: no row in `player_positions`.
 */
export type PositionSelection = Partial<Record<PositionCode, PositionPreference>>;

/** The three states in tap order, for legends and tests. */
export const PREFERENCE_CYCLE: readonly (PositionPreference | undefined)[] = [
  undefined,
  "secondary",
  "primary",
];

/** French label of a state, for legends and accessible names. */
export function preferenceLabelFr(preference: PositionPreference | undefined): string {
  if (preference === "primary") return "poste principal";
  if (preference === "secondary") return "poste secondaire";
  return "poste non souhaité";
}

/** The next state for one position: undefined → secondary → primary → undefined. */
export function nextPreference(
  current: PositionPreference | undefined,
): PositionPreference | undefined {
  if (current === undefined) return "secondary";
  if (current === "secondary") return "primary";
  return undefined;
}

export type CycleOptions = {
  /**
   * `docs/DATA_MODEL.md`: at most one `primary` per member. When a position is promoted to
   * primary the previous primary is demoted to secondary rather than dropped — the player still
   * wants to play there. Defaults to `true`; pass `false` only if that invariant ever changes.
   */
  singlePrimary?: boolean;
};

/**
 * Advance one position by one tap and return a **new** selection object. Never mutates its
 * input, so it is safe to call straight from a React event handler.
 */
export function cyclePosition(
  selection: PositionSelection,
  code: PositionCode,
  options: CycleOptions = {},
): PositionSelection {
  const { singlePrimary = true } = options;
  const next = nextPreference(selection[code]);
  const result: PositionSelection = { ...selection };

  if (next === undefined) {
    delete result[code];
    return result;
  }

  if (next === "primary" && singlePrimary) {
    for (const key of Object.keys(result) as PositionCode[]) {
      if (key !== code && result[key] === "primary") result[key] = "secondary";
    }
  }

  result[code] = next;
  return result;
}

/** The player's primary position, if they picked one. */
export function primaryPosition(selection: PositionSelection): PositionCode | undefined {
  return (Object.keys(selection) as PositionCode[]).find(
    (code) => selection[code] === "primary",
  );
}

/** Every position the player accepts, primary first. Order within a group is not guaranteed. */
export function selectedPositions(selection: PositionSelection): PositionCode[] {
  const codes = (Object.keys(selection) as PositionCode[]).filter((code) => selection[code]);
  return codes.sort((a, b) => {
    const rank = (code: PositionCode) => (selection[code] === "primary" ? 0 : 1);
    return rank(a) - rank(b);
  });
}

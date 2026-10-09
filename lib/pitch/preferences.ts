/**
 * The tri-state logic behind the position picker on a player's profile.
 *
 * A player taps a position on the pitch diagram and it cycles
 * **pas son poste → secondaire → principal → pas son poste**, which maps onto
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
  return "pas son poste";
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

/** One tappable disc of the position picker: a slot of the formation, and the code it stands for. */
export type PickerTarget = {
  /** Stable React key: the code, plus the side when the formation holds the code twice (`DC-gauche`). */
  key: string;
  code: PositionCode;
  /** 0..1000, the slot's own coordinates. */
  x: number;
  y: number;
  /**
   * The position's French name, plus the side when the formation holds the code twice (« Ailier
   * gauche », « Défenseur central droit »). Every name in the vocabulary is masculine — gardien,
   * défenseur, milieu, ailier, attaquant — so the side agrees as « droit », never « droite ».
   */
  labelFr: string;
};

/**
 * The picker's discs: **every slot** of the formation, at the slot's own coordinates (decision 173).
 *
 * Storage stays per code (`player_positions`), so the two `DC` discs and the two `AIL` discs read and
 * write the same key of a `PositionSelection`: tapping either one cycles both — the owner's « si je
 * sélectionne un je sélectionne les deux ». The side lives only in the accessible name, so a screen
 * reader does not hear two identical buttons; the visible caption stays the code.
 *
 * `labelOf` is passed in rather than imported so this module keeps taking only types from
 * `db/reference.ts`.
 */
export function pickerTargets(
  slots: readonly { positionCode: PositionCode; x: number; y: number }[],
  labelOf: (code: PositionCode) => string,
): PickerTarget[] {
  const count = new Map<PositionCode, number>();
  for (const slot of slots) count.set(slot.positionCode, (count.get(slot.positionCode) ?? 0) + 1);

  return slots.map((slot) => {
    const twin = (count.get(slot.positionCode) ?? 0) > 1;
    const side = slot.x < 500 ? "gauche" : "droit";
    return {
      key: twin ? `${slot.positionCode}-${side}` : slot.positionCode,
      code: slot.positionCode,
      x: slot.x,
      y: slot.y,
      labelFr: twin ? `${labelOf(slot.positionCode)} ${side}` : labelOf(slot.positionCode),
    };
  });
}

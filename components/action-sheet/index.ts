/**
 * Barrel for the game-mode sheets. Import from "@/components/action-sheet".
 *
 * Everything here is `'use client'` and stateless apart from the composer's draft: the sheets ask a
 * question and hand the answer back. What an answer *means* — which event it produces, at which
 * minute — belongs to `lib/match/presenter.ts` and the game-mode screen, so that it can be tested
 * without a browser.
 */

export { ActionMenu, type ActionChoice, type ActionMenuProps } from "./action-menu";
export { ConfirmSheet, type ConfirmSheetProps } from "./confirm-sheet";
export {
  LineupComposer,
  type ComposerFormation,
  type ComposerSlot,
  type LineupComposerProps,
} from "./lineup-composer";
export { OptionRow, type OptionRowProps } from "./option-row";
export { PlayerPicker, type PlayerPickerProps } from "./player-picker";
export { SlotPicker, type SlotChoice, type SlotPickerProps } from "./slot-picker";
export { TerrainSheet, type TerrainSheetProps } from "./terrain-sheet";

/**
 * Public surface of the pitch components. See `components/pitch/README.md`.
 *
 * `PositionPicker` is a Client Component; importing this barrel from another client component
 * therefore pulls it into that bundle. Server Components should import `Pitch`, `PlayerDisc`,
 * `SlotTarget` and `PitchLayout` from here freely — none of them ships any JavaScript.
 */

export { Pitch, PitchPoint, type PitchProps, type PitchPointProps } from "./Pitch";
export { PlayerDisc, type PlayerDiscProps, type PlayerDiscVariant } from "./PlayerDisc";
export { SlotTarget, type SlotTargetProps, type SlotTargetState } from "./SlotTarget";
export {
  PitchLayout,
  type PitchLayoutProps,
  type PitchPlayer,
  type PitchSlot,
  type KitColors,
} from "./PitchLayout";
export { PositionPicker, type PositionPickerProps } from "./PositionPicker";
export { DISC_SIZES, DEFAULT_DISC_SIZE, type DiscSize, type DiscMetrics } from "./sizes";

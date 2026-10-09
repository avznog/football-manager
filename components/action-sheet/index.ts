/**
 * Barrel for the game-mode sheets. Import from "@/components/action-sheet".
 *
 * Everything here is `'use client'` and stateless apart from the composer's draft: the sheets ask a
 * question and hand the answer back. What an answer *means* — which event it produces, at which
 * minute — belongs to `lib/match/presenter.ts` and the game-mode screen, so that it can be tested
 * without a browser.
 */

export {
  ACTION_ICONS,
  BadPassIcon,
  CommentIcon,
  GoalAgainstIcon,
  GoalForIcon,
  GoodEffortIcon,
  GoodPositioningIcon,
  GoodTrackBackIcon,
  InjuryIcon,
  LostBallIcon,
  MoreIcon,
  NiceSkillIcon,
  OwnGoalIcon,
  PenaltyMissedIcon,
  PenaltyScoredIcon,
  REMARK_ICONS,
  RemarkIcon,
  SubstitutionIcon,
} from "./action-icons";
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
export { TerrainSheet, type TerrainSheetProps } from "./terrain-sheet";

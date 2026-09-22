/**
 * The pitch with a composition on it: a `Pitch` plus one `PlayerDisc` per filled slot and one
 * `SlotTarget` per empty slot.
 *
 * **Pure presentation.** No state, no drag-and-drop, no data fetching, no hooks — so it renders
 * from a Server Component (a match recap, a player's profile) as happily as from the editor.
 * The editor wraps each marker through `renderItem` to attach its own pointer handlers, and
 * draws whatever follows the finger in `overlay`.
 */

import type { ReactNode } from "react";

import { Pitch, PitchPoint } from "./Pitch";
import { PlayerDisc, type PlayerDiscVariant } from "./PlayerDisc";
import { SlotTarget, type SlotTargetState } from "./SlotTarget";
import { DEFAULT_DISC_SIZE, type DiscSize } from "./sizes";

/** The team colours a disc is painted with — `teams.primary_color` / `secondary_color`. */
export type KitColors = {
  primaryColor: string;
  secondaryColor?: string;
};

export type PitchPlayer = {
  /** `team_members.id`. Only used as a React key and echoed back by `renderItem`. */
  id: string;
  name: string;
  jerseyNumber?: number | null;
  /** Defaults to `normal`. The caller decides what "unavailable" means, not this component. */
  variant?: PlayerDiscVariant;
  /** French reason for the variant, e.g. « blessé ». */
  statusLabel?: string;
  /** Overrides the team kit for this player only, e.g. a goalkeeper's shirt. */
  kit?: KitColors;
};

export type PitchSlot = {
  /** Stable key: `formation_slots.id` in the editor, or the position code on a profile. */
  id: string;
  /** 0..1000, left to right. */
  x: number;
  /** 0..1000, our goal line to the opponent's. */
  y: number;
  positionCode: string;
  /** Absent or null renders a `SlotTarget` instead of a disc. */
  player?: PitchPlayer | null;
  /** Only used when the slot is empty. Defaults to `idle`. */
  state?: SlotTargetState;
};

export type PitchLayoutProps = {
  slots: readonly PitchSlot[];
  /** The team's colours, used for every player without their own `kit`. */
  kit: KitColors;
  size?: DiscSize;
  className?: string;
  /** French accessible name for the pitch graphic. Omit to leave it decorative. */
  pitchLabel?: string;
  /** Number of mowing bands, forwarded to `Pitch`. */
  stripes?: number;
  /** Drawn above the markers, inside the pitch box: the drag layer, a score badge… */
  overlay?: ReactNode;
  /**
   * Wraps each marker. Return `content` inside your own element to make a slot interactive
   * without teaching this component about drag-and-drop:
   *
   * ```tsx
   * renderItem={(slot, content) => (
   *   <button type="button" onPointerDown={(e) => startDrag(slot, e)}>{content}</button>
   * )}
   * ```
   */
  renderItem?: (slot: PitchSlot, content: ReactNode) => ReactNode;
};

export function PitchLayout({
  slots,
  kit,
  size = DEFAULT_DISC_SIZE,
  className,
  pitchLabel,
  stripes,
  overlay,
  renderItem,
}: PitchLayoutProps) {
  return (
    <Pitch className={className} label={pitchLabel} stripes={stripes}>
      {slots.map((slot) => {
        const colors = slot.player?.kit ?? kit;
        const content = slot.player ? (
          <PlayerDisc
            name={slot.player.name}
            jerseyNumber={slot.player.jerseyNumber}
            primaryColor={colors.primaryColor}
            secondaryColor={colors.secondaryColor}
            variant={slot.player.variant}
            statusLabel={slot.player.statusLabel}
            positionCode={slot.positionCode}
            size={size}
          />
        ) : (
          <SlotTarget positionCode={slot.positionCode} state={slot.state} size={size} />
        );

        return (
          <PitchPoint key={slot.id} x={slot.x} y={slot.y}>
            {renderItem ? renderItem(slot, content) : content}
          </PitchPoint>
        );
      })}
      {overlay}
    </Pitch>
  );
}

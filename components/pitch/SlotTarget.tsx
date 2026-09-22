/**
 * An empty formation slot: a dashed outline with the position code inside. This is what the
 * composition editor drops a player onto.
 *
 * A **Server Component** — it renders a `<span>` and knows nothing about drag-and-drop. The
 * editor decides the `state` and attaches its own pointer handlers to a wrapper.
 */

import { positionLabelFr } from "@/db/reference";
import { cn } from "@/components/ui/cn";
import { DEFAULT_DISC_SIZE, DISC_SIZES, type DiscSize } from "./sizes";

export type SlotTargetState =
  /** Nothing happening: waiting for a player. */
  | "idle"
  /** A player is being dragged over it, and may be dropped. */
  | "hovered"
  /** A player is being dragged over it but must not be dropped (wrong squad, already used…). */
  | "invalid";

export type SlotTargetProps = {
  /** A `positions.code`, e.g. `MC`. Displayed inside the outline. */
  positionCode: string;
  state?: SlotTargetState;
  size?: DiscSize;
  /** Overrides the French accessible name. Defaults to « Poste libre : milieu central ». */
  label?: string;
  className?: string;
};

const STATE_STYLE: Record<SlotTargetState, string> = {
  idle: "border-dashed border-line/70 text-line/90 bg-black/10",
  hovered: "border-solid border-accent text-accent-ink bg-accent/80 scale-110",
  invalid: "border-double border-4 border-danger text-line bg-danger/70",
};

const STATE_LABEL: Record<SlotTargetState, string> = {
  idle: "poste libre",
  hovered: "cible du déplacement",
  invalid: "placement impossible",
};

export function SlotTarget({
  positionCode,
  state = "idle",
  size = DEFAULT_DISC_SIZE,
  label,
  className,
}: SlotTargetProps) {
  const metrics = DISC_SIZES[size];
  const accessibleName =
    label ??
    `${positionLabelFr(positionCode)} — ${STATE_LABEL[state]}`;

  return (
    <span
      role="img"
      aria-label={accessibleName}
      title={accessibleName}
      data-state={state}
      data-position={positionCode}
      className={cn(
        "flex items-center justify-center rounded-full border-2 font-bold uppercase transition-transform",
        STATE_STYLE[state],
        className,
      )}
      style={{
        width: metrics.diameter,
        height: metrics.diameter,
        fontSize: Math.round(metrics.glyph * 0.72),
      }}
    >
      {positionCode}
    </span>
  );
}

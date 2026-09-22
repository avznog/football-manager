/**
 * A player on the pitch: a kit-coloured disc with the jersey number, and the name beneath
 * (decision 014).
 *
 * A **Server Component** — no hooks, no handlers. It renders a `<span>`, so a client component
 * can wrap it in a `<button>` or attach pointer handlers for drag-and-drop without this file
 * knowing anything about it.
 *
 * The text colour is **computed** from the team's `primaryColor`, never chosen: see
 * `readableInkOn` in `lib/color.ts`.
 */

import type { CSSProperties } from "react";

import { positionLabelFr } from "@/db/reference";
import { cn } from "@/components/ui/cn";
import { readableInkOn, withAlpha } from "@/lib/color";
import { abbreviateName } from "@/lib/pitch/names";
import { DEFAULT_DISC_SIZE, DISC_SIZES, type DiscSize } from "./sizes";

export type PlayerDiscVariant =
  /** On the pitch, nothing special. */
  | "normal"
  /** Picked up, or the current selection in the editor. */
  | "selected"
  /** Injured, or already substituted off: the coach must not field them. */
  | "unavailable"
  /** A planned position that has not been confirmed yet (decision 006). */
  | "ghost";

export type PlayerDiscProps = {
  /** The player's display name. Abbreviated, then truncated, to fit under the disc. */
  name: string;
  /** `team_members.jersey_number`. Absent numbers are common in an amateur squad. */
  jerseyNumber?: number | null;
  /** `teams.primary_color` — a hex string from the database. Drives the disc and its ink. */
  primaryColor: string;
  /** `teams.secondary_color` — the ring around the disc. */
  secondaryColor?: string;
  variant?: PlayerDiscVariant;
  size?: DiscSize;
  /** Adds the position to the accessible name, e.g. « attaquant ». */
  positionCode?: string;
  /**
   * French reason appended to the accessible name, e.g. « blessé », « déjà remplacé ».
   * Shown as a tooltip too.
   */
  statusLabel?: string;
  /** Hide the name chip on a very dense pitch. The accessible name always keeps it. */
  showName?: boolean;
  className?: string;
};

const VARIANT_RING: Record<PlayerDiscVariant, string> = {
  normal: "ring-1 ring-black/25",
  selected: "ring-4 ring-accent",
  unavailable: "ring-2 ring-danger",
  ghost: "ring-2 ring-line/80 border-2 border-dashed border-line/90",
};

export function PlayerDisc({
  name,
  jerseyNumber,
  primaryColor,
  secondaryColor,
  variant = "normal",
  size = DEFAULT_DISC_SIZE,
  positionCode,
  statusLabel,
  showName = true,
  className,
}: PlayerDiscProps) {
  const metrics = DISC_SIZES[size];
  const ink = readableInkOn(primaryColor);
  const isGhost = variant === "ghost";

  const fill = isGhost ? withAlpha(primaryColor, 0.45) : primaryColor;
  const discStyle: CSSProperties = {
    width: metrics.diameter,
    height: metrics.diameter,
    fontSize: metrics.glyph,
    backgroundColor: fill,
    borderColor: secondaryColor,
  };

  const accessibleName = [
    name,
    jerseyNumber == null ? null : `numéro ${jerseyNumber}`,
    positionCode ? positionLabelFr(positionCode).toLocaleLowerCase("fr-FR") : null,
    statusLabel,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <span
      role="img"
      aria-label={accessibleName}
      title={statusLabel ? `${name} — ${statusLabel}` : name}
      data-variant={variant}
      className={cn("flex flex-col items-center gap-1", isGhost && "opacity-80", className)}
    >
      <span
        className={cn(
          "relative flex items-center justify-center rounded-full font-bold tabular-nums shadow-md",
          !isGhost && secondaryColor ? "border-2" : null,
          ink === "light" ? "text-white" : "text-black",
          VARIANT_RING[variant],
          variant === "unavailable" && "opacity-70",
        )}
        style={discStyle}
      >
        {jerseyNumber ?? ""}
        {variant === "unavailable" ? <UnavailableBadge size={size} /> : null}
      </span>

      {showName ? (
        <span
          className={cn(
            "max-w-full truncate rounded-full bg-surface/90 px-1.5 py-px font-medium leading-tight",
            variant === "unavailable" ? "text-danger" : "text-ink",
          )}
          style={{ fontSize: metrics.name, maxWidth: metrics.nameWidth }}
        >
          {abbreviateName(name, metrics.nameChars)}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The cross on an unavailable player. Colour alone must not carry the meaning, so the shape is
 * there too — for colour-blind users and for a phone screen in the sun.
 */
function UnavailableBadge({ size }: { size: DiscSize }) {
  const badge = Math.round(DISC_SIZES[size].diameter * 0.4);
  return (
    <span
      aria-hidden
      className="absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-surface"
      style={{ width: badge, height: badge }}
    >
      <svg
        viewBox="0 0 12 12"
        className="stroke-danger"
        style={{ width: badge * 0.7, height: badge * 0.7 }}
        strokeWidth={2.5}
        strokeLinecap="round"
        fill="none"
      >
        <line x1={3} y1={3} x2={9} y2={9} />
        <line x1={9} y1={3} x2={3} y2={9} />
      </svg>
    </span>
  );
}

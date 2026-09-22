"use client";

/**
 * The position picker on a player's profile: the eleven canonical positions as tappable targets
 * on the turf. Each tap cycles **non souhaité → secondaire → principal → non souhaité**, which
 * is exactly `player_positions.preference` (no row / `secondary` / `primary`).
 *
 * A **controlled** component: it holds no state, never talks to the database and defines no
 * Server Action. The page above it owns the selection and persists it — which is what makes it
 * usable both on the profile form and in a "who can play here?" preview.
 *
 * Primary and secondary are distinguishable **without colour** (decision 014 consequence): the
 * primary target is filled and carries an inner ring, the secondary is hollow with a solid
 * outline, an unwanted position is a dashed outline. That survives both a colour-blind reader
 * and a phone screen in direct sunlight.
 */

import { POSITIONS, POSITION_BY_CODE } from "@/db/reference";
import { cn } from "@/components/ui/cn";
import {
  type PositionPreference,
  type PositionSelection,
  cyclePosition,
  nextPreference,
  preferenceLabelFr,
  primaryPosition,
} from "@/lib/pitch/preferences";
import { Pitch, PitchPoint } from "./Pitch";
import { DISC_SIZES } from "./sizes";

export type PositionPickerProps = {
  /** Current wishes, keyed by position code. A missing key means « non souhaité ». */
  value: PositionSelection;
  /** Called with the complete next selection. Persisting it is the caller's job. */
  onChange: (next: PositionSelection) => void;
  /**
   * Keep at most one primary, demoting the previous one to secondary
   * (`docs/DATA_MODEL.md`). Default `true`.
   */
  singlePrimary?: boolean;
  /** Read-only rendering: the targets stay visible and keep their labels, but cannot be tapped. */
  disabled?: boolean;
  className?: string;
};

/** 48 px: above the 44 px minimum tap target, and the size the coordinates are spaced for. */
const TARGET = DISC_SIZES.md;

const STATE_STYLE: Record<"none" | PositionPreference, string> = {
  none: "border-2 border-dashed border-line/70 bg-black/20 text-line/90",
  secondary: "border-2 border-line bg-surface/90 text-ink",
  primary: "border-2 border-line bg-accent text-accent-ink",
};

function stateOf(preference: PositionPreference | undefined): "none" | PositionPreference {
  return preference ?? "none";
}

/** What a tap will do, spelled out in French for screen readers. */
function actionLabelFr(preference: PositionPreference | undefined): string {
  const next = nextPreference(preference);
  if (next === "secondary") return "appuyer pour en faire un poste secondaire";
  if (next === "primary") return "appuyer pour en faire votre poste principal";
  return "appuyer pour ne plus souhaiter ce poste";
}

export function PositionPicker({
  value,
  onChange,
  singlePrimary = true,
  disabled = false,
  className,
}: PositionPickerProps) {
  const primary = primaryPosition(value);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="group" aria-label="Postes souhaités sur le terrain">
        <Pitch label="Terrain de football à 7, vu depuis nos buts">
          {POSITIONS.map((position) => {
            const preference = value[position.code];
            const state = stateOf(preference);
            return (
              <PitchPoint key={position.code} x={position.defaultX} y={position.defaultY}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-label={`${position.labelFr}, ${preferenceLabelFr(preference)}${
                    disabled ? "" : ` — ${actionLabelFr(preference)}`
                  }`}
                  data-preference={state}
                  onClick={() => onChange(cyclePosition(value, position.code, { singlePrimary }))}
                  className={cn(
                    "relative flex items-center justify-center rounded-full font-bold uppercase shadow-md transition-transform",
                    "focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none",
                    !disabled && "hover:scale-105 active:scale-95",
                    disabled && "cursor-default",
                    STATE_STYLE[state],
                  )}
                  style={{
                    width: TARGET.diameter,
                    height: TARGET.diameter,
                    fontSize: Math.round(TARGET.glyph * 0.72),
                  }}
                >
                  {position.code}
                  {state === "primary" ? (
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-1 rounded-full border-2 border-accent-ink/70"
                    />
                  ) : null}
                </button>
              </PitchPoint>
            );
          })}
        </Pitch>
      </div>

      <Legend />

      <p className="text-sm text-ink-muted">
        {primary
          ? `Poste principal : ${POSITION_BY_CODE[primary].labelFr}.`
          : "Aucun poste principal choisi."}
      </p>
    </div>
  );
}

/** The three shapes, spelled out. Shown to everyone: the shapes are the primary signal. */
function Legend() {
  const items: { state: "none" | PositionPreference; label: string }[] = [
    { state: "primary", label: "Poste principal" },
    { state: "secondary", label: "Poste secondaire" },
    { state: "none", label: "Non souhaité" },
  ];

  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-ink-muted">
      {items.map((item) => (
        <li key={item.state} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "relative inline-block size-4 shrink-0 rounded-full",
              item.state === "none"
                ? "border-2 border-dashed border-ink-muted"
                : item.state === "secondary"
                  ? "border-2 border-ink bg-surface"
                  : "border-2 border-ink bg-accent",
            )}
          >
            {item.state === "primary" ? (
              <span className="absolute inset-0.5 rounded-full border border-accent-ink/70" />
            ) : null}
          </span>
          {item.label}
        </li>
      ))}
    </ul>
  );
}

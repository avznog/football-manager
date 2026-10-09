"use client";

/**
 * The position picker on a player's profile: the **seven slots** of the one formation, the `1-2-3-1`
 * (`THE_FORMATION`, decisions 157 and 173), as tappable targets on the turf. Each tap cycles
 * **pas son poste → secondaire → principal → pas son poste**, which is exactly
 * `player_positions.preference` (no row / `secondary` / `primary`).
 *
 * The wishes are still stored per **code** — five of them (decision 158) — so the two `DC` discs are
 * one wish and the two `AIL` discs another: a tap on either cycles both, because both read and write
 * the same key of the selection (`pickerTargets` in `lib/pitch/preferences.ts`). The pitch shows the
 * shape the team plays; the side is spoken in the accessible name only.
 *
 * There used to be a row of chips under the turf for wishes on a code the picker no longer offered,
 * so that a player could still remove them. The migration that retired those codes mapped every such
 * row onto one of the five (`0011_single_formation.sql`), and the readers drop any code outside the
 * vocabulary, so there is nothing left for such a row to show.
 *
 * `readOnly` and `disabled` are two props because they are two facts: « these wishes are not yours »
 * decides the **copy**, « a save is in flight » decides only the **interactivity**. One prop for both
 * made the sentence flicker to the coach's wording for the duration of a Server Action.
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

import { THE_FORMATION, positionLabelFr } from "@/db/reference";
import { cn } from "@/components/ui/cn";
import {
  type PositionPreference,
  type PositionSelection,
  cyclePosition,
  nextPreference,
  pickerTargets,
  preferenceLabelFr,
  primaryPosition,
  selectedPositions,
} from "@/lib/pitch/preferences";
// Pure, no database, no React: the words a player's wishes are said in, and the *same* words the
// read-only card's description uses — so the player and the coach read one sentence, not two.
import { fromSelection, positionsSummaryFr } from "@/lib/player/positions";
import { Pitch, PitchPoint } from "./Pitch";
import { DISC_SIZES } from "./sizes";

export type PositionPickerProps = {
  /** Current wishes, keyed by position code. A missing key means « pas son poste ». */
  value: PositionSelection;
  /** Called with the complete next selection. Persisting it is the caller's job. */
  onChange: (next: PositionSelection) => void;
  /**
   * Keep at most one primary, demoting the previous one to secondary
   * (`docs/DATA_MODEL.md`). Default `true`.
   */
  singlePrimary?: boolean;
  /**
   * These positions are not this reader's to change — anybody but a coach (decision 163).
   * The targets stay visible and keep their labels.
   */
  readOnly?: boolean;
  /**
   * Temporarily inert — a save is in flight. Interactivity only: the copy still describes what the
   * reader *may* do, because the permission has not changed, only the moment.
   */
  disabled?: boolean;
  className?: string;
};

/** 48 px: above the 44 px minimum tap target, and the size the coordinates are spaced for. */
const TARGET = DISC_SIZES.md;

/** The seven discs, computed once: the formation is a constant. */
const TARGETS = pickerTargets(THE_FORMATION.slots, positionLabelFr);

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
  if (next === "primary") return "appuyer pour en faire le poste principal";
  return "appuyer pour retirer ce poste";
}

export function PositionPicker({
  value,
  onChange,
  singlePrimary = true,
  readOnly = false,
  disabled = false,
  className,
}: PositionPickerProps) {
  // Two reasons not to respond to a tap, and only one of them is a reason to change what the copy
  // says: « ce n'est pas à toi de les indiquer » is permanent for this reader, « on enregistre » is a
  // second. Mixing them made the sentence flicker to the coach's wording mid-save.
  const inert = readOnly || disabled;
  const primary = primaryPosition(value);

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="group" aria-label="Postes du joueur sur le terrain">
        <Pitch label="Terrain de football à 7, vu depuis nos buts">
          {TARGETS.map((target) => {
            const preference = value[target.code];
            const state = stateOf(preference);
            return (
              <PitchPoint key={target.key} x={target.x} y={target.y}>
                <button
                  type="button"
                  disabled={inert}
                  aria-label={`${target.labelFr}, ${preferenceLabelFr(preference)}${
                    readOnly ? "" : ` — ${actionLabelFr(preference)}`
                  }`}
                  data-position={target.code}
                  data-preference={state}
                  onClick={() => onChange(cyclePosition(value, target.code, { singlePrimary }))}
                  className={cn(
                    "relative flex items-center justify-center rounded-full font-bold uppercase shadow-md transition-transform",
                    "focus-visible:ring-4 focus-visible:ring-accent focus-visible:outline-none",
                    !inert && "hover:scale-105 active:scale-95",
                    inert && "cursor-default",
                    STATE_STYLE[state],
                  )}
                  style={{
                    width: TARGET.diameter,
                    height: TARGET.diameter,
                    fontSize: Math.round(TARGET.glyph * 0.72),
                  }}
                >
                  {target.code}
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

      {/* Only where the reader is choosing. A read-only card carries the same sentence as its
          description, and printing it again four lines under said the primary twice, adjacently.
          On an editable card there is no such description — it is the tap instruction instead — so
          without this line a player decodes their own secondary wishes from the shapes of a diagram
          while the coach reads them in prose. Same `positionsSummaryFr` as the coach's, plus the one
          fact a summary cannot state on its own: that no primary has been chosen yet. */}
      {readOnly ? null : (
        <p className="text-sm text-ink-muted">
          {`${positionsSummaryFr(fromSelection(value))}.`}
          {!primary && selectedPositions(value).length > 0 ? " Aucun poste principal choisi." : ""}
        </p>
      )}
    </div>
  );
}

/** The three shapes, spelled out. Shown to everyone: the shapes are the primary signal. */
function Legend() {
  const items: { state: "none" | PositionPreference; label: string }[] = [
    { state: "primary", label: "Poste principal" },
    { state: "secondary", label: "Poste secondaire" },
    { state: "none", label: "Pas son poste" },
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

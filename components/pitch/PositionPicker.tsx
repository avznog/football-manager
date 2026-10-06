"use client";

/**
 * The position picker on a player's profile: the six positions this team's usual shape `1-3-2-1`
 * uses (`PREFERRED_POSITIONS`) as tappable targets on the turf. Each tap cycles
 * **non souhaité → secondaire → principal → non souhaité**, which is exactly
 * `player_positions.preference` (no row / `secondary` / `primary`).
 *
 * A record written before the list narrowed may still hold `MG`, `MD`, `MOC`, `AG` or `AD`. Nothing
 * deletes such a code — the form posts the selection's own keys — so without the chip row below it
 * would be invisible *and* unremovable. The chips are derived from `value`, exactly like the grid, which is
 * what keeps `cyclePosition` and the whole write path out of this: a chip only ever removes. Each one
 * prints its position **in full** — it is the control that ends the wish, so it names it.
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

import {
  PREFERRED_POSITIONS,
  type PositionCode,
  isPreferredPositionCode,
  positionLabelFr,
} from "@/db/reference";
import { cn } from "@/components/ui/cn";
import {
  type PositionPreference,
  type PositionSelection,
  cyclePosition,
  nextPreference,
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
  /** Current wishes, keyed by position code. A missing key means « non souhaité ». */
  value: PositionSelection;
  /** Called with the complete next selection. Persisting it is the caller's job. */
  onChange: (next: PositionSelection) => void;
  /**
   * Keep at most one primary, demoting the previous one to secondary
   * (`docs/DATA_MODEL.md`). Default `true`.
   */
  singlePrimary?: boolean;
  /**
   * These wishes are not this reader's to change — a teammate's or the coach's view of the card.
   * The targets stay visible and keep their labels, and the copy says so: a retired wish is shown
   * but offers no removal.
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

const STATE_STYLE: Record<"none" | PositionPreference, string> = {
  none: "border-2 border-dashed border-line/70 bg-black/20 text-line/90",
  secondary: "border-2 border-line bg-surface/90 text-ink",
  primary: "border-2 border-line bg-accent text-accent-ink",
};

/**
 * A retired wish, off the turf: the neutral `Badge` shape (`bg-surface-2` + a `border` ring), not a
 * pitch style — `line` is white, which only reads on grass.
 */
const CHIP =
  "inline-flex items-center gap-1.5 rounded-full bg-surface-2 text-sm font-semibold text-ink-muted ring-1 ring-inset ring-border/40";

function stateOf(preference: PositionPreference | undefined): "none" | PositionPreference {
  return preference ?? "none";
}

/** What a tap will do, spelled out in French for screen readers. */
function actionLabelFr(preference: PositionPreference | undefined): string {
  const next = nextPreference(preference);
  if (next === "secondary") return "appuyer pour en faire un poste secondaire";
  if (next === "primary") return "appuyer pour en faire le poste principal";
  return "appuyer pour ne plus souhaiter ce poste";
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
  // says: « ces postes ne sont pas les tiens » is permanent for this reader, « on enregistre » is a
  // second. Mixing them made the sentence flicker to the coach's wording mid-save.
  const inert = readOnly || disabled;
  const primary = primaryPosition(value);
  // Wishes the picker no longer offers. Kept rather than dropped: they are in the database, and the
  // player is the only one who may decide they are over.
  const retired = (Object.keys(value) as PositionCode[]).filter(
    (code) => value[code] && !isPreferredPositionCode(code),
  );

  /**
   * Removal only, never addition — hence no `cyclePosition`.
   *
   * If the code being removed was the primary the player is simply left with no primary, which the
   * summary line below already states on an editable card (« Aucun poste principal choisi. ») and
   * the form already posts as an empty `primary`. Promoting a secondary in its place would invent
   * a wish nobody expressed, and picking *which* secondary would be arbitrary.
   */
  function removeRetired(code: PositionCode): void {
    const next = { ...value };
    delete next[code];
    onChange(next);
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="group" aria-label="Postes souhaités sur le terrain">
        <Pitch label="Terrain de football à 7, vu depuis nos buts">
          {PREFERRED_POSITIONS.map((position) => {
            const preference = value[position.code];
            const state = stateOf(preference);
            return (
              <PitchPoint key={position.code} x={position.defaultX} y={position.defaultY}>
                <button
                  type="button"
                  disabled={inert}
                  aria-label={`${position.labelFr}, ${preferenceLabelFr(preference)}${
                    readOnly ? "" : ` — ${actionLabelFr(preference)}`
                  }`}
                  data-preference={state}
                  onClick={() => onChange(cyclePosition(value, position.code, { singlePrimary }))}
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

      {retired.length > 0 ? (
        <div
          role="group"
          aria-label="Postes qui ne sont plus proposés"
          className="flex flex-col gap-1.5"
        >
          <p className="text-sm text-ink-muted">
            {readOnly
              ? "Ces postes ne sont plus proposés."
              : "Ces postes ne sont plus proposés. Tu peux les retirer, pas les remettre."}
          </p>
          <ul className="flex flex-wrap items-center gap-2">
            {retired.map((code) => (
              <li key={code}>
                {/* The chip prints the position **in full**, not its code. It is the control that
                    ends the wish, and the player being asked to end it is owed the name of the thing
                    — the coach's read-only card spells it out in `positionsSummaryFr`, so two letters
                    here was the one reader who owns the wish getting the least of it. It is also
                    WCAG 2.5.3 Label in Name (decision 117): the visible text has to occur in the
                    accessible name, and « AG » occurs nowhere in « Retirer Ailier gauche … ».
                    `positionLabelFr` returns the raw code for anything it does not know, so a code
                    outside the vocabulary still renders as itself rather than blank. */}
                {readOnly ? (
                  <span className={cn(CHIP, "px-3 py-1")}>{positionLabelFr(code)}</span>
                ) : (
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => removeRetired(code)}
                    aria-label={`Retirer ${positionLabelFr(code)} de tes postes souhaités`}
                    className={cn(
                      CHIP,
                      "min-h-11 px-3",
                      disabled
                        ? "cursor-default"
                        : "hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none",
                    )}
                  >
                    {positionLabelFr(code)}
                    <span aria-hidden className="text-base leading-none">
                      ×
                    </span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

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

import type { ReactNode } from "react";

import { cn } from "./cn";

export type SegmentTone = "accent" | "success" | "danger" | "warning" | "neutral";

export type SegmentOption<T extends string> = {
  value: T;
  /** French label, e.g. « Dispo », « Pas dispo », « Peut-être ». */
  label: ReactNode;
  /** Colour of the selected segment. Defaults to the app accent. */
  tone?: SegmentTone;
  disabled?: boolean;
};

/**
 * `accent-ink` clears 6.4:1 on every one of these fills, in both themes.
 *
 * `neutral` is the one that is not a fill: a quiet pill in `surface` on the `surface-2` track, with
 * `ink` where the others have `accent-ink`. It exists for an option that is *chosen* without being
 * *good, bad or pending* — « hors feuille » on the match sheet, which used to be painted `danger` and
 * turned a brand-new match into thirteen red bars. The inset ring is what makes it read as selected
 * in dark mode, where `surface` is darker than the track it sits on rather than lighter.
 */
const CHECKED: Record<SegmentTone, string> = {
  accent: "peer-checked:bg-accent peer-checked:text-accent-ink",
  success: "peer-checked:bg-success peer-checked:text-accent-ink",
  danger: "peer-checked:bg-danger peer-checked:text-accent-ink",
  warning: "peer-checked:bg-warning peer-checked:text-accent-ink",
  neutral:
    "peer-checked:bg-surface peer-checked:text-ink peer-checked:ring-1 " +
    "peer-checked:ring-inset peer-checked:ring-border",
};

export type SegmentedControlProps<T extends string> = {
  /** Also the form field name — the control submits with a Server Action. */
  name: string;
  /** French, describes the whole group. */
  legend: string;
  /** Hide the legend visually while keeping it for screen readers. */
  hideLegend?: boolean;
  options: readonly SegmentOption<T>[];
  /** Controlled value. Requires `onChange` and a Client Component parent. */
  value?: T;
  /** Uncontrolled initial value. */
  defaultValue?: T;
  onChange?: (value: T) => void;
  disabled?: boolean;
  className?: string;
};

/**
 * Built on native radio inputs: arrow-key navigation, screen-reader semantics
 * and `FormData` submission all come for free, and it stays usable from a
 * Server Component as long as no `onChange` is passed — hence the handler is
 * only attached when there is one to call. Attaching an inert closure
 * unconditionally would make every render a function prop, which a Server
 * Component cannot serialise.
 */
export function SegmentedControl<T extends string>({
  name,
  legend,
  hideLegend = true,
  options,
  value,
  defaultValue,
  onChange,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const controlled = value !== undefined;

  return (
    <fieldset disabled={disabled} className={cn("min-w-0", className)}>
      <legend className={cn(hideLegend ? "sr-only" : "mb-1.5 text-sm font-medium text-ink")}>
        {legend}
      </legend>
      <div className="flex w-full gap-1 rounded-xl border border-border bg-surface-2 p-1">
        {options.map((option) => {
          const id = `${name}-${option.value}`;
          const handleChange = onChange ? () => onChange(option.value) : undefined;
          return (
            <div key={option.value} className="min-w-0 flex-1">
              <input
                type="radio"
                id={id}
                name={name}
                value={option.value}
                disabled={option.disabled}
                className="peer sr-only"
                {...(controlled
                  ? {
                      checked: value === option.value,
                      onChange: handleChange,
                      // A controlled radio with no handler is a display of state, not a
                      // broken input; saying so keeps React from warning about it.
                      readOnly: handleChange === undefined,
                    }
                  : {
                      defaultChecked: defaultValue === option.value,
                      onChange: handleChange,
                    })}
              />
              <label
                htmlFor={id}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-2 text-center text-sm font-medium",
                  // No hover recolouring: it would out-specify
                  // `peer-checked:text-accent-ink` on the selected segment.
                  "text-ink-muted transition-colors select-none",
                  "peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent",
                  "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
                  CHECKED[option.tone ?? "accent"],
                )}
              >
                <span className="truncate">{option.label}</span>
              </label>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
}

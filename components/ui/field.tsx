import type { ReactNode } from "react";

import { cn } from "./cn";
import { FieldError } from "./field-error";
import { Label } from "./label";

export type FieldProps = {
  /** Must match the control's `id`. */
  htmlFor: string;
  label: ReactNode;
  optional?: boolean;
  /** Helper text shown under the label, above the control. */
  hint?: ReactNode;
  error?: string | string[] | null;
  className?: string;
  /**
   * How wide the field may get on desktop (decision 227). Below `md:` every field is the full width
   * of its column, as it always was. `short` (10rem) is for a number of a digit or two; `date`
   * (24rem) fits the French date-and-time boxes of `DateInput` (decision 231). Unset, the field
   * takes its column, which on a form page is the 32rem `PageContainer width="form"`.
   */
  size?: "short" | "date";
  /**
   * Render the control. It receives the ids to wire up:
   * `<Input id={id} aria-describedby={describedBy} invalid={invalid} />`
   */
  children: (wiring: {
    id: string;
    describedBy: string | undefined;
    invalid: boolean;
  }) => ReactNode;
};

/**
 * Label + control + hint + error, with `aria-describedby` wired correctly.
 * Keeps every form in the app consistent without hiding the native control.
 */
export function Field({
  htmlFor,
  label,
  optional,
  hint,
  error,
  className,
  size,
  children,
}: FieldProps) {
  const invalid = Array.isArray(error) ? error.length > 0 : Boolean(error);
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = invalid ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div
      className={cn(
        "space-y-1.5",
        size === "short" && "md:max-w-40",
        size === "date" && "md:max-w-sm",
        className,
      )}
    >
      {/* The id names a group of boxes (`DateInput`, decision 231) that a single `htmlFor` cannot. */}
      <Label id={`${htmlFor}-label`} htmlFor={htmlFor} optional={optional}>
        {label}
      </Label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      {children({ id: htmlFor, describedBy, invalid })}
      <FieldError id={errorId}>{error}</FieldError>
    </div>
  );
}

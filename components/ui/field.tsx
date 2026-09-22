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
  children,
}: FieldProps) {
  const invalid = Array.isArray(error) ? error.length > 0 : Boolean(error);
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = invalid ? `${htmlFor}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={htmlFor} optional={optional}>
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

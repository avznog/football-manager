import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";

/**
 * Shared look for every text-ish control.
 * `text-base` (16px) is deliberate: anything smaller makes iOS Safari zoom the
 * page when the field is focused.
 */
export const controlClassName =
  "block w-full min-h-12 rounded-xl border border-border bg-surface px-3 py-2 " +
  "text-base text-ink " +
  "disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-muted " +
  "aria-invalid:border-danger aria-invalid:outline-danger";

export type InputProps = Omit<ComponentPropsWithRef<"input">, "type"> & {
  type?:
    | "text"
    | "password"
    | "number"
    | "search"
    | "tel"
    | "url"
    | "date"
    | "time"
    | "datetime-local";
  /** Marks the field as rejected; pair with `<FieldError>` via aria-describedby. */
  invalid?: boolean;
};

export function Input({
  className,
  invalid,
  type = "text",
  ...props
}: InputProps) {
  return (
    <input
      type={type}
      aria-invalid={invalid || undefined}
      className={cn(controlClassName, className)}
      {...props}
    />
  );
}

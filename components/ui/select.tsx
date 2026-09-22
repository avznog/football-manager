import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";
import { controlClassName } from "./input";

export type SelectProps = ComponentPropsWithRef<"select"> & {
  invalid?: boolean;
};

/**
 * Native `<select>`: on a phone this opens the OS picker, which is faster and
 * more reliable one-handed than any custom listbox.
 */
export function Select({ className, invalid, children, ...props }: SelectProps) {
  return (
    <div className="relative">
      <select
        aria-invalid={invalid || undefined}
        className={cn(controlClassName, "appearance-none pr-10", className)}
        {...props}
      >
        {children}
      </select>
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-muted"
      >
        <path d="m5.5 8 4.5 4.5L14.5 8" />
      </svg>
    </div>
  );
}

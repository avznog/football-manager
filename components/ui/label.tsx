import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";

export type LabelProps = ComponentPropsWithRef<"label"> & {
  /** Adds the French "(optionnel)" hint rather than marking everything else. */
  optional?: boolean;
};

export function Label({
  optional = false,
  className,
  children,
  ...props
}: LabelProps) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-ink select-none",
        className,
      )}
      {...props}
    >
      {children}
      {optional ? (
        <span className="ml-1 font-normal text-ink-subtle">(optionnel)</span>
      ) : null}
    </label>
  );
}

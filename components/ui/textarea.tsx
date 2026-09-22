import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";
import { controlClassName } from "./input";

export type TextareaProps = ComponentPropsWithRef<"textarea"> & {
  invalid?: boolean;
};

export function Textarea({
  className,
  invalid,
  rows = 4,
  ...props
}: TextareaProps) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(controlClassName, "min-h-24 resize-y", className)}
      {...props}
    />
  );
}

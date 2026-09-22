import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";

export type BadgeVariant =
  | "success"
  | "danger"
  | "warning"
  | "neutral"
  | "accent";

/**
 * Tinted, not filled, by default — sober per decision 014.
 * Contrast of the label over its own 15% tint, computed for both themes:
 *   light, over surface / canvas:  accent 5.34/4.94 · success 5.32/4.97
 *                                  danger 5.37/4.96 · warning 5.26/4.86
 *   dark  (the tint is weaker, so contrast is higher): all >= 5.2
 *   neutral: ink-muted on surface-2 → 6.40 (light) / 6.94 (dark)
 */
const TINTED: Record<BadgeVariant, string> = {
  success: "bg-success/15 text-success ring-success/30",
  danger: "bg-danger/15 text-danger ring-danger/30",
  warning: "bg-warning/15 text-warning ring-warning/30",
  accent: "bg-accent/15 text-accent ring-accent/30",
  neutral: "bg-surface-2 text-ink-muted ring-border/40",
};

/** Filled: `accent-ink` clears 6.4:1 on every one of these fills, both themes. */
const SOLID: Record<BadgeVariant, string> = {
  success: "bg-success text-accent-ink ring-success",
  danger: "bg-danger text-accent-ink ring-danger",
  warning: "bg-warning text-accent-ink ring-warning",
  accent: "bg-accent text-accent-ink ring-accent",
  neutral: "bg-ink-muted text-surface ring-ink-muted",
};

export type BadgeProps = ComponentPropsWithRef<"span"> & {
  variant?: BadgeVariant;
  solid?: boolean;
};

export function Badge({
  variant = "neutral",
  solid = false,
  className,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset whitespace-nowrap",
        solid ? SOLID[variant] : TINTED[variant],
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
}

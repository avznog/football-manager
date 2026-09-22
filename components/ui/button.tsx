import Link from "next/link";
import type { ComponentPropsWithRef } from "react";

import { cn } from "./cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-ink hover:bg-accent/90 active:bg-accent/80",
  secondary:
    "border border-border bg-surface text-ink hover:bg-surface-2 active:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2 active:bg-surface-2",
  danger: "bg-danger text-accent-ink hover:bg-danger/90 active:bg-danger/80",
};

// Every size clears the 44px minimum tap target: the coach uses this one-handed,
// outdoors, in a hurry. `sm` is only visually smaller through type and padding.
const SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 text-sm",
  md: "min-h-12 px-4 text-[0.9375rem]",
  lg: "min-h-14 px-6 text-base",
};

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: "min-h-11 w-11 px-0",
  md: "min-h-12 w-12 px-0",
  lg: "min-h-14 w-14 px-0",
};

const BASE =
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium " +
  "transition-colors select-none " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export type ButtonStyleOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Square button holding a single icon. Provide an aria-label. */
  iconOnly?: boolean;
  /** Stretch to the container width — the default for mobile form footers. */
  fullWidth?: boolean;
};

/** Shared class list, so `Button`, `ButtonLink` and one-off anchors agree. */
export function buttonClassName({
  variant = "primary",
  size = "md",
  iconOnly = false,
  fullWidth = false,
  className,
}: ButtonStyleOptions & { className?: string } = {}): string {
  return cn(
    BASE,
    VARIANTS[variant],
    iconOnly ? ICON_SIZES[size] : SIZES[size],
    fullWidth && "w-full",
    className,
  );
}

export type ButtonProps = ComponentPropsWithRef<"button"> &
  ButtonStyleOptions & {
    /** Server Action in flight: shows a spinner and blocks further clicks. */
    pending?: boolean;
  };

export function Button({
  variant,
  size = "md",
  iconOnly,
  fullWidth,
  pending = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
      className={buttonClassName({
        variant,
        size,
        iconOnly,
        fullWidth,
        className,
      })}
      {...props}
    >
      {pending ? <Spinner size={size === "lg" ? "md" : "sm"} /> : null}
      {iconOnly && pending ? null : children}
    </button>
  );
}

export type ButtonLinkProps = ComponentPropsWithRef<typeof Link> &
  ButtonStyleOptions;

/** Same look as `Button`, but a real link — keeps middle-click and open-in-new-tab. */
export function ButtonLink({
  variant,
  size,
  iconOnly,
  fullWidth,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClassName({
        variant,
        size,
        iconOnly,
        fullWidth,
        className,
      })}
      {...props}
    />
  );
}

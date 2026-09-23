"use client";

import type { ReactNode } from "react";

import { cn } from "@/components/ui";

export type OptionRowProps = {
  onClick: () => void;
  /** The one thing the coach is reading. */
  label: string;
  /** « MC · 34’ », « remplaçant · blessé » — context, never the answer. */
  subtitle?: string | null;
  /** Shirt number, or a single glyph. Omitted leaves the label flush left. */
  leading?: ReactNode;
  /** Danger tint: injured, already off, anything the coach should notice before tapping. */
  warn?: boolean;
  /** Currently chosen, in a multi-step flow. */
  selected?: boolean;
  disabled?: boolean;
  className?: string;
};

/**
 * One line in a picker: a full-width, 56 px, single-tap target.
 *
 * Everything in game mode is chosen from a list of these, so the size is not negotiable — this is
 * tapped one-handed, outdoors, while watching the match. `min-h-14` beats the 44 px floor with
 * room for a fat thumb, and the whole row is the target, not the text inside it.
 */
export function OptionRow({
  onClick,
  label,
  subtitle,
  leading,
  warn = false,
  selected = false,
  disabled = false,
  className,
}: OptionRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected || undefined}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition-colors",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        "disabled:pointer-events-none disabled:opacity-50",
        selected
          ? "border-accent bg-accent/10"
          : warn
            ? "border-danger/40 bg-danger/5 hover:bg-danger/10"
            : "border-border/60 bg-surface hover:bg-surface-2 active:bg-surface-2",
        className,
      )}
    >
      {leading ? (
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
            warn ? "bg-danger/15 text-danger" : "bg-surface-2 text-ink-muted",
          )}
        >
          {leading}
        </span>
      ) : null}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9375rem] font-semibold text-ink">{label}</span>
        {subtitle ? (
          <span className={cn("block truncate text-xs", warn ? "text-danger" : "text-ink-muted")}>
            {subtitle}
          </span>
        ) : null}
      </span>
    </button>
  );
}

import { cn } from "./cn";
import { inkOnColor, parseHex } from "./contrast";

const SIZES = {
  xs: "size-6 text-[0.625rem]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
} as const;

export type AvatarSize = keyof typeof SIZES;

export type AvatarProps = {
  /** Full name, e.g. "Karim Benali". Drives the initials. */
  name: string;
  /**
   * Optional club colour (hex). Used as the background; the label colour is
   * then computed so it always clears WCAG AA. Omit for the neutral look.
   */
  color?: string | null;
  size?: AvatarSize;
  className?: string;
};

/** "Karim Benali" → "KB", "Karim" → "KA". Accents and hyphens survive. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(/[\s\-']+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toLocaleUpperCase("fr-FR");
  return (words[0][0] + words[words.length - 1][0]).toLocaleUpperCase("fr-FR");
}

/** Initials only — no photos in v1. */
export function Avatar({ name, color, size = "md", className }: AvatarProps) {
  const clubColor = parseHex(color) ? (color as string) : null;

  return (
    <span
      // The name is already next to the avatar everywhere it is used, so the
      // initials are decorative for assistive tech.
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold ring-1 ring-inset select-none",
        SIZES[size],
        clubColor
          ? "ring-kit-ink/20"
          : "bg-surface-2 text-ink-muted ring-border/40",
        className,
      )}
      style={
        clubColor
          ? { backgroundColor: clubColor, color: inkOnColor(clubColor) }
          : undefined
      }
    >
      {initialsOf(name)}
    </span>
  );
}

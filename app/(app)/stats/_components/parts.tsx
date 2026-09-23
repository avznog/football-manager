/**
 * The small pieces every card on `/stats` is built from.
 *
 * Two ideas carry the whole screen's design, both of them consequences of a 320 px viewport:
 *
 * 1. **No wide table.** A season has fourteen figures per player; a `<table>` of that either
 *    scrolls sideways or shrinks to four-point type. So a player is a *row with a caption*: an
 *    identity line, then a wrapped list of `label: value` pairs. The pairs stay a real `<dl>`, so a
 *    screen reader still hears "Buts, 4" rather than a bare number.
 * 2. **A missing number says so.** `null` renders as an em dash, explained to assistive tech and on
 *    hover, never as `0` (`lib/stats/aggregate.ts`, rule 1). `Figure` is the only place that
 *    decision is applied, which is why no card formats a value itself.
 * 3. **Nothing is explained on hover alone.** There is no hover on a phone, and this screen is read
 *    on a phone: a `title` is a sentence nobody will ever see. So `hint` is *printed*, under the
 *    value — and because a column is about 110 px wide at 390 px, a hint that will not fit in two or
 *    three words belongs in a `Note` under the card instead (decision 072).
 */

import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/components/ui/cn";
import { NO_DATA_FR, NO_VALUE_FR } from "@/lib/stats/format";

/**
 * One `label / value` pair. `value` of `null` is "nobody has this number yet" and is rendered as a
 * dash explained on hover and to assistive tech — the one rule the screen must never break.
 *
 * `hint` is printed under the value, not hidden in a `title` (idea 3 above). Keep it to two or three
 * words: the grid gives it about 110 px.
 */
export function Figure({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: ReactNode;
  value: string | number | null;
  /** The denominator behind the value, printed under it. Two or three words. */
  hint?: string;
  tone?: "default" | "strong" | "muted";
  className?: string;
}) {
  const missing = value === null;

  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-[0.6875rem] leading-tight font-medium text-ink-subtle uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "tabular-nums",
          tone === "strong" ? "text-base font-semibold" : "text-sm font-medium",
          missing ? "text-ink-subtle" : tone === "muted" ? "text-ink-muted" : "text-ink",
        )}
        title={missing ? NO_DATA_FR : undefined}
      >
        {missing ? (
          <>
            <span aria-hidden="true">{NO_VALUE_FR}</span>
            <span className="sr-only">{NO_DATA_FR}</span>
          </>
        ) : (
          value
        )}
        {/* Inside the `<dd>`, so a screen reader hears « Note, 7,5, sur 4 notes » as one value
            rather than as a stray fragment between two pairs. Nothing is printed when the value is
            a dash: a denominator under a number nobody has is noise. */}
        {!missing && hint !== undefined ? (
          <span className="mt-0.5 block text-[0.625rem] leading-tight font-normal text-ink-subtle">
            {hint}
          </span>
        ) : null}
      </dd>
    </div>
  );
}

/** A wrapped grid of `Figure`s. Three columns at 320 px, more as the screen allows. */
export function FigureGrid({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <dl className={cn("grid grid-cols-3 gap-x-3 gap-y-2 sm:grid-cols-4", className)}>
      {children}
    </dl>
  );
}

/**
 * A player's name, jersey and status. Not a link: `/stats` is a season view, and a row that
 * navigates away on every tap makes the table hostile to scrolling with a thumb. The profile is one
 * tap away from `/equipe`, and the profile itself carries the same numbers.
 */
export function PlayerIdentity({
  displayName,
  jerseyNumber,
  hasLeft = false,
  trailing,
}: {
  displayName: string;
  jerseyNumber: number | null;
  hasLeft?: boolean;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <p className="flex min-w-0 flex-1 items-center gap-1.5 font-medium text-ink">
        {jerseyNumber !== null ? (
          <span className="font-mono text-xs text-ink-subtle tabular-nums">{jerseyNumber}</span>
        ) : null}
        <span className="truncate">{displayName}</span>
        {hasLeft ? (
          // Their goals stay in the season (`aggregate.ts`, rule 8), but the reader deserves to know
          // why a name they no longer see at training is in the table.
          <Badge variant="neutral" className="shrink-0">
            parti
          </Badge>
        ) : null}
      </p>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** A footnote under a card: the denominator, a caveat, a reason a number is missing. */
export function Note({ children }: { children: ReactNode }) {
  return <p className="mt-3 text-xs leading-relaxed text-ink-subtle">{children}</p>;
}

/** What a card shows instead of an empty body. Lighter than a full `EmptyState`. */
export function CardEmpty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-ink-muted">{children}</p>;
}

/**
 * The small pieces every card on `/stats` is built from.
 *
 * Three ideas carry the whole screen's design, all of them consequences of a 320 px viewport:
 *
 * 1. **No wide table.** A season has fourteen figures per player; a `<table>` of all of them either
 *    scrolls sideways or shrinks to four-point type. So a card that needs many figures (the keepers)
 *    makes a player a *row with a caption*: an identity line, then a wrapped list of `label: value`
 *    pairs, kept a real `<dl>` so a screen reader hears "Buts, 4" rather than a bare number. The
 *    squad table at the bottom is a real `<table>` because it keeps four narrow columns only
 *    (decision 178).
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
import { LEADERBOARD_SIZE } from "@/lib/stats/aggregate";
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
          // why a name they no longer see on Sundays is in the table.
          <Badge variant="neutral" className="shrink-0">
            parti
          </Badge>
        ) : null}
      </p>
      {trailing ? <div className="shrink-0">{trailing}</div> : null}
    </div>
  );
}

/** Who a ranked row is about — what every ranking on `/stats` carries for each name. */
type RankedPerson = {
  teamMemberId: string;
  displayName: string;
  jerseyNumber: number | null;
  hasLeft: boolean;
};

/**
 * Every ranked list on `/stats`: the first `LEADERBOARD_SIZE` rows, then the rest folded under a small
 * « Tout afficher (N) » (decision 176). One component for the buteurs, the rates and the impact per
 * position, so the lists cannot come to disagree about how many they show or how a rank is written.
 *
 * The server sends the whole ranking and the fold is a native `<details>`, so it opens with no
 * JavaScript at all (decisions 100 and 116), and the second `<ol>` starts at 6: the ranks run on
 * across the split, for the eye and for a screen reader, and nobody is renumbered by opening it.
 *
 * Each row is the rank, the player, and on the right the figure it is ranked on (`value`) with the
 * record under it (`detail`) — printed, never on hover (decision 072).
 */
export function RankedRows<T extends RankedPerson>({
  entries,
  value,
  detail,
  dense = false,
}: {
  entries: readonly T[];
  value: (entry: T) => string;
  detail?: (entry: T) => string;
  /** Tighter rows with no dividers, for the five short lists of the impact card. */
  dense?: boolean;
}) {
  const shown = entries.slice(0, LEADERBOARD_SIZE);
  const folded = entries.slice(LEADERBOARD_SIZE);
  const listClass = dense ? undefined : "divide-y divide-border/60";

  const row = (entry: T, rank: number) => (
    <li
      key={entry.teamMemberId}
      className={cn("flex items-center gap-3 px-4", dense ? "py-1.5" : "py-2.5")}
    >
      <span
        aria-hidden="true"
        className="w-5 shrink-0 font-mono text-xs text-ink-subtle tabular-nums"
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <PlayerIdentity
          displayName={entry.displayName}
          jerseyNumber={entry.jerseyNumber}
          hasLeft={entry.hasLeft}
        />
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold text-ink tabular-nums">{value(entry)}</p>
        {detail ? (
          <p className="text-[0.6875rem] text-ink-subtle tabular-nums">{detail(entry)}</p>
        ) : null}
      </div>
    </li>
  );

  return (
    <>
      <ol className={listClass}>{shown.map((entry, index) => row(entry, index + 1))}</ol>
      {folded.length > 0 ? (
        <details className={cn("group/more", !dense && "border-t border-border/60")}>
          {/* `list-none` drops the native triangle, so the chevron replaces it — the `/moi` pattern.
              The label says what opening does, and says the opposite once it is open. */}
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-xs font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open/more:rotate-90">
              ›
            </span>
            <span className="group-open/more:hidden">Tout afficher ({entries.length})</span>
            <span className="hidden group-open/more:inline">
              Afficher les {LEADERBOARD_SIZE} premiers
            </span>
          </summary>
          <ol
            start={LEADERBOARD_SIZE + 1}
            className={cn(listClass, !dense && "border-t border-border/60")}
          >
            {folded.map((entry, index) => row(entry, LEADERBOARD_SIZE + index + 1))}
          </ol>
        </details>
      ) : null}
    </>
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

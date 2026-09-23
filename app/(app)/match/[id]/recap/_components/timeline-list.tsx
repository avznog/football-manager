/**
 * The minute-by-minute story of the match.
 *
 * Minutes are **continuous**: with 2×30, the second half runs 30’→60’ (decision 009, `CLAUDE.md`).
 * A corrected event stays visible, struck through and labelled « annulé » — `match_events` is
 * append-only and the recap shows the correction rather than hiding it (decision 003).
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/components/ui/cn";
import { EmptyState } from "@/components/ui/empty-state";
import type { RecapTimelineEntry, RecapTimelineTone } from "@/lib/rating/recap";

const DOT: Record<RecapTimelineTone, string> = {
  for: "bg-success",
  against: "bg-danger",
  clock: "bg-border",
  neutral: "bg-ink-subtle",
};

export function TimelineList({ entries }: { entries: readonly RecapTimelineEntry[] }) {
  if (entries.length === 0) {
    return (
      <Card title="Déroulé du match" as="h2">
        <EmptyState
          title="Rien n’a été enregistré"
          description="Ce match n’a pas été suivi en direct, donc il n’y a pas de déroulé à afficher."
        />
      </Card>
    );
  }

  return (
    <Card title="Déroulé du match" as="h2" flush>
      <ol className="divide-y divide-border/60 border-t border-border/60">
        {entries.map((entry) => (
          <li key={entry.eventId} className="flex items-baseline gap-3 px-4 py-2.5">
            <span className="w-11 shrink-0 font-mono text-sm text-ink-subtle tabular-nums">
              {entry.minuteLabel}
            </span>

            <span
              aria-hidden="true"
              className={cn("mt-1.5 size-2 shrink-0 rounded-full", DOT[entry.tone])}
            />

            <span className={cn("min-w-0 flex-1", entry.voided && "opacity-60")}>
              <span
                className={cn(
                  "block text-sm font-medium text-ink",
                  entry.voided && "line-through",
                )}
              >
                {entry.label}
              </span>
              {entry.detail ? (
                <span className="block text-sm text-ink-muted">{entry.detail}</span>
              ) : null}
            </span>

            {entry.scoreAfter ? (
              <span className="shrink-0 font-mono text-sm font-semibold text-ink tabular-nums">
                {entry.scoreAfter}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </Card>
  );
}

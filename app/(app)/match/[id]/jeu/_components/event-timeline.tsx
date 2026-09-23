"use client";

import { Button, Card, EmptyState, cn } from "@/components/ui";
import type { TimelineLine } from "@/lib/match/presenter";

export type EventTimelineProps = {
  lines: readonly TimelineLine[];
  /** Null when the reader is not the operator: the log is still readable, just not editable. */
  onVoid: ((line: TimelineLine) => void) | null;
};

/**
 * The log, newest first.
 *
 * Nothing here is ever removed. « Annuler » appends a `VOID` that points at the event (invariant 1),
 * and the annulled line stays, struck through, with the annulment above it — so the coach can see
 * that they cancelled a goal at 58′ and not wonder whether they imagined it.
 */
export function EventTimeline({ lines, onVoid }: EventTimelineProps) {
  return (
    <Card title="Déroulé du match" as="h2" flush>
      {lines.length === 0 ? (
        <div className="p-4">
          <EmptyState
            title="Rien pour l’instant."
            description="Les actions enregistrées apparaissent ici, la plus récente en haut."
          />
        </div>
      ) : (
        <ol className="divide-y divide-border/60">
          {lines.map((line) => (
            <li key={line.eventId} className="flex items-start gap-3 px-4 py-3">
              <span className="w-12 shrink-0 pt-0.5 font-mono text-sm font-semibold text-ink-muted tabular-nums">
                {line.minuteLabel}
              </span>

              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-[0.9375rem] font-semibold text-ink",
                    line.voided && "text-ink-muted line-through",
                  )}
                >
                  {line.title}
                  {line.scoreLabel ? (
                    <span className="ml-2 font-mono text-sm font-bold tabular-nums">
                      {line.scoreLabel}
                    </span>
                  ) : null}
                </span>
                {line.detail ? (
                  <span
                    className={cn("block text-sm text-ink-muted", line.voided && "line-through")}
                  >
                    {line.detail}
                  </span>
                ) : null}
                {line.pending ? (
                  <span className="mt-0.5 block text-xs text-ink-muted">en attente d’envoi</span>
                ) : null}
                {line.voided ? (
                  <span className="mt-0.5 block text-xs text-danger">annulé</span>
                ) : null}
              </span>

              {onVoid && line.canVoid ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onVoid(line)}
                  className="shrink-0 text-danger"
                >
                  Annuler
                </Button>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

/**
 * A ranked top five: buteurs, passeurs, meilleures notes.
 *
 * One component for all three, because they differ only in how the value reads. Nobody on zero is
 * ever listed — a « meilleur buteur » with no goals would be an insult dressed as a statistic — so
 * an empty chart says why instead.
 */

import { Card } from "@/components/ui/card";
import type { LeaderboardEntry } from "@/lib/stats/aggregate";

import { CardEmpty, Note, PlayerIdentity } from "./parts";

export function Leaderboard({
  title,
  description,
  entries,
  /** Turns a row into its right-hand figure, e.g. `4 buts` or `6,8`. */
  valueLabel,
  /** The line under the value, e.g. the number of ratings behind an average. */
  countLabel,
  emptyMessage,
  note,
}: {
  title: string;
  description?: string;
  entries: readonly LeaderboardEntry[];
  valueLabel: (entry: LeaderboardEntry) => string;
  countLabel?: (entry: LeaderboardEntry) => string;
  emptyMessage: string;
  note?: string;
}) {
  if (entries.length === 0) {
    return (
      <Card title={title} description={description} as="h3">
        <CardEmpty>{emptyMessage}</CardEmpty>
        {/* The note matters most here: « nobody is ranked » plus the reason, not just the shrug. */}
        {note ? <Note>{note}</Note> : null}
      </Card>
    );
  }

  return (
    <Card title={title} description={description} as="h3" flush>
      <ol className="divide-y divide-border/60">
        {entries.map((entry, index) => (
          <li key={entry.teamMemberId} className="flex items-center gap-3 px-4 py-2.5">
            <span
              aria-hidden="true"
              className="w-4 shrink-0 font-mono text-xs text-ink-subtle tabular-nums"
            >
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <PlayerIdentity
                displayName={entry.displayName}
                jerseyNumber={entry.jerseyNumber}
                hasLeft={entry.hasLeft}
              />
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-ink tabular-nums">{valueLabel(entry)}</p>
              {countLabel ? (
                <p className="text-[0.6875rem] text-ink-subtle tabular-nums">{countLabel(entry)}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {note ? (
        <div className="px-4 pb-3">
          <Note>{note}</Note>
        </div>
      ) : null}
    </Card>
  );
}

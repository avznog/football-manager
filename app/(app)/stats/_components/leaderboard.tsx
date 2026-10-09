/**
 * A ranked list: buteurs, passeurs, minutes, meilleures notes. Five shown, the rest under « Tout
 * afficher » (`RankedRows`, decision 176).
 *
 * One component for all of them, because they differ only in how the value reads. Nobody on zero is
 * ever listed — a « meilleur buteur » with no goals would be an insult dressed as a statistic — so
 * an empty chart says why instead.
 */

import { Card } from "@/components/ui/card";
import type { LeaderboardEntry } from "@/lib/stats/aggregate";

import { CardEmpty, Note, RankedRows } from "./parts";

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
      <RankedRows entries={entries} value={valueLabel} detail={countLabel} />
      {note ? (
        <div className="px-4 pb-3">
          <Note>{note}</Note>
        </div>
      ) : null}
    </Card>
  );
}
